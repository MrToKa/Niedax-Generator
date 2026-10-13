import type * as fsPromises from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  inventory: [] as string[],
  files: new Map<string, string>(),
  root: "",
  metadata: new Map<string, { kind: "file" | "directory" | "symlink" | "other"; nlink: number }>(),
  resolvedTargets: new Map<string, string>(),
  inventoryStatus: 0,
  runGit: vi.fn(),
  readText: vi.fn(),
  statPath: vi.fn(),
  resolvePath: vi.fn()
}));

vi.mock("node:child_process", () => ({ spawnSync: fixtures.runGit }));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof fsPromises>()),
  readFile: fixtures.readText,
  lstat: fixtures.statPath,
  realpath: fixtures.resolvePath
}));

import { sourceIdentity } from "../lib/stage10-evidence.js";

// Controlled virtual files exercise the real inventory/filter/hash function without reading
// repository data or credentials. Their versions and sums are synthetic test values.
const sourceFiles = new Map([
  ["gateway/build/main.go", 'package main\nimport _ "example.test/gateway"\n'],
  ["gateway/build/modules/audit.go", "package modules\nconst Enabled = true\n"],
  ["gateway/build/go.mod", "module example.test/gateway\ngo 1.26.8\n"],
  ["gateway/build/go.sum", "example.test/module v1.0.0 h1:synthetic-sum-only\n"],
  [".node-version", "24.21.0\n"],
  ["apps/backend/src/server.ts", "export const synthetic = true;\n"],
  ["package.json", '{"name":"synthetic-source-identity-fixture"}\n']
]);

beforeEach(() => {
  fixtures.inventory = [...sourceFiles.keys()];
  fixtures.files = new Map(sourceFiles);
  fixtures.root = resolve("virtual-source-identity-workspace");
  fixtures.metadata.clear();
  fixtures.resolvedTargets.clear();
  for (const path of sourceFiles.keys()) {
    const components = path.split("/");
    for (const [index] of components.entries())
      fixtures.metadata.set(resolve(fixtures.root, ...components.slice(0, index + 1)), {
        kind: index === components.length - 1 ? "file" : "directory",
        nlink: 1
      });
  }
  fixtures.inventoryStatus = 0;
  fixtures.runGit.mockReset().mockImplementation(() => ({
    status: fixtures.inventoryStatus,
    stdout: `${fixtures.inventory.join("\0")}\0`
  }));
  fixtures.readText.mockReset().mockImplementation(async (path: string, encoding: string) => {
    if (encoding !== "utf8") throw new Error("Expected normalized text source input");
    const contents = fixtures.files.get(relative(fixtures.root, path).split(sep).join("/"));
    if (contents === undefined) throw new Error(`Unexpected source read: ${path}`);
    return contents;
  });
  fixtures.statPath.mockReset().mockImplementation(async (path: string) => {
    const metadata = fixtures.metadata.get(path);
    if (!metadata) throw new Error(`Unexpected source metadata: ${path}`);
    return {
      nlink: metadata.nlink,
      isSymbolicLink: () => metadata.kind === "symlink",
      isFile: () => metadata.kind === "file",
      isDirectory: () => metadata.kind === "directory"
    };
  });
  fixtures.resolvePath
    .mockReset()
    .mockImplementation(async (path: string) =>
      path === resolve(".") ? fixtures.root : (fixtures.resolvedTargets.get(path) ?? path)
    );
});

describe("Stage 10 reproducible working-tree source identity", () => {
  it.each([
    "gateway/build/main.go",
    "gateway/build/modules/audit.go",
    "gateway/build/go.mod",
    "gateway/build/go.sum",
    ".node-version"
  ])("binds changed source/build input %s to a different identity", async (path) => {
    const original = await sourceIdentity();
    fixtures.files.set(path, `${fixtures.files.get(path)!}changed build input\n`);
    expect(await sourceIdentity()).not.toBe(original);
    expect(fixtures.readText).toHaveBeenCalledWith(resolve(fixtures.root, path), "utf8");
    expect(fixtures.runGit).toHaveBeenCalledWith(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8", shell: false }
    );
  });

  it("retains the same identity across LF/CRLF checkouts including Go and runtime pins", async () => {
    const original = await sourceIdentity();
    for (const [path, contents] of fixtures.files)
      fixtures.files.set(path, contents.replaceAll("\n", "\r\n"));
    expect(await sourceIdentity()).toBe(original);
  });

  it("never opens excluded docs, persisted data, artifacts or similarly named non-source files", async () => {
    const original = await sourceIdentity();
    fixtures.readText.mockClear();
    // Even a cached entry cannot widen the safe inventory into these paths. No file contents
    // are supplied for them, so an attempted read would fail instead of entering the hash.
    const excluded = [
      "docs/testing/identity-fixture.go",
      "docs/testing/runtime-fixture.json",
      "data/secrets/synthetic-fixture.json",
      "Data/secrets/synthetic-fixture.json",
      ".artifacts/stage12/safe/synthetic-fixture.json",
      "gateway/build/go.mod.backup",
      "gateway/build/go.sum.backup",
      "README.md"
    ];
    fixtures.inventory.push(...excluded);
    expect(await sourceIdentity()).toBe(original);
    expect(
      fixtures.readText.mock.calls.map(([path]) =>
        relative(fixtures.root, path).split(sep).join("/")
      )
    ).toEqual([...sourceFiles.keys()].sort());
  });

  it("does not depend on git inventory ordering or duplicate tracked/untracked entries", async () => {
    const original = await sourceIdentity();
    fixtures.inventory = [...fixtures.inventory.reverse(), "gateway/build/main.go"];
    expect(await sourceIdentity()).toBe(original);
  });

  it("fails before opening any file when git cannot establish the source inventory", async () => {
    fixtures.inventoryStatus = 1;
    await expect(sourceIdentity()).rejects.toThrow("Cannot identify current source tree");
    expect(fixtures.readText).not.toHaveBeenCalled();
  });

  it.each([
    ["source symlink", "gateway/build/main.go", "symlink", 1],
    ["junction or symlink ancestor", "gateway/build", "symlink", 1],
    ["multiply linked source", "gateway/build/main.go", "file", 2],
    ["non-regular source", "gateway/build/main.go", "other", 1],
    ["non-directory ancestor", "gateway/build", "file", 1]
  ] as const)("rejects %s before reading its contents", async (_label, path, kind, nlink) => {
    fixtures.inventory = ["gateway/build/main.go"];
    fixtures.metadata.set(resolve(fixtures.root, path), { kind, nlink });
    await expect(sourceIdentity()).rejects.toThrow("regular unlinked files and directories");
    expect(fixtures.readText).not.toHaveBeenCalled();
  });

  it.each(["relative traversal", "absolute escape", "sibling prefix"])(
    "rejects %s inventory before reading",
    async (kind) => {
      fixtures.inventory = [
        kind === "relative traversal"
          ? "../outside.ts"
          : kind === "absolute escape"
            ? resolve(fixtures.root, "..", "outside.ts")
            : resolve(`${fixtures.root}-unowned`, "main.ts")
      ];
      await expect(sourceIdentity()).rejects.toThrow("escaped workspace");
      expect(fixtures.statPath).not.toHaveBeenCalled();
      expect(fixtures.readText).not.toHaveBeenCalled();
    }
  );

  it.each([
    "apps/../data/secrets/synthetic-fixture.json",
    "apps\\..\\data\\secrets\\synthetic-fixture.json",
    "gateway/./build/main.go",
    "gateway//build/main.go"
  ])("rejects noncanonical inventory path %s before metadata or contents", async (path) => {
    fixtures.inventory = [path];
    await expect(sourceIdentity()).rejects.toThrow("escaped workspace");
    expect(fixtures.statPath).not.toHaveBeenCalled();
    expect(fixtures.readText).not.toHaveBeenCalled();
  });

  it("rejects an absolute path into private workspace data without opening it", async () => {
    fixtures.inventory = [resolve(fixtures.root, "data", "secrets", "synthetic-fixture.json")];
    await expect(sourceIdentity()).rejects.toThrow("escaped workspace");
    expect(fixtures.statPath).not.toHaveBeenCalled();
    expect(fixtures.readText).not.toHaveBeenCalled();
  });

  it("rejects a resolved target outside the root before opening the file", async () => {
    fixtures.inventory = ["gateway/build/main.go"];
    fixtures.resolvedTargets.set(
      resolve(fixtures.root, "gateway/build/main.go"),
      resolve(fixtures.root, "..", "outside.ts")
    );
    await expect(sourceIdentity()).rejects.toThrow("escaped workspace");
    expect(fixtures.readText).not.toHaveBeenCalled();
  });
});
