import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("calculation engine dependency boundary", () => {
  it("contains no forbidden runtime or infrastructure imports", () => {
    const sourceDirectory = resolve(packageDirectory, "src");
    const sourceFiles = listTypeScriptFiles(sourceDirectory);
    const forbidden = [
      /from ["'](?:next|react|fastify|pg|prisma|typeorm|sequelize)(?:\/|["'])/u,
      /from ["']node:(?:fs|http|https|net|process|crypto|stream)/u,
      /from ["'].*(?:apps\/frontend|apps\/backend|database|infrastructure)/u
    ];

    for (const sourceFile of sourceFiles) {
      const source = readFileSync(sourceFile, "utf8");
      for (const pattern of forbidden) expect(source).not.toMatch(pattern);
    }
  });

  it("declares only reviewed pure contract and rules dependencies", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(packageDirectory, "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      "@niedax/domain",
      "@niedax/rules-manifest"
    ]);
  });
});
