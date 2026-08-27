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
      /from ["'].*(?:apps\/frontend|apps\/backend|database|infrastructure)/u,
      /\b(?:process\.env|Math\.random|Date\.now|fetch|XMLHttpRequest)\b/u
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

  it("keeps formula identifiers out of presentation, HTTP, persistence, import, and export code", () => {
    const repositoryDirectory = resolve(packageDirectory, "../..");
    const forbiddenOwners = [
      "apps/frontend/src",
      "apps/backend/src",
      "database/src",
      "packages/catalog-import/src",
      "packages/export/src"
    ];
    const formulaIdentifier =
      /(?:SECTION\.REQUIRED_PER_SEGMENT|SUPPORT\.BASE_CONTINUOUS_GROUP|PACKAGING\.ROUND_UP_TO_INCREMENT)/u;
    for (const owner of forbiddenOwners) {
      for (const sourceFile of listTypeScriptFiles(resolve(repositoryDirectory, owner))) {
        expect(readFileSync(sourceFile, "utf8"), sourceFile).not.toMatch(formulaIdentifier);
      }
    }
  });
});
