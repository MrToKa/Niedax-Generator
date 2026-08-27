import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CalculationInputV2Schema,
  CalculationResultV2Schema,
  type CalculationInputV2
} from "@niedax/domain";
import { calculateV2, canonicalJson } from "../src/index.js";

const fixtures = fileURLToPath(new URL("./golden/fixtures/", import.meta.url));
const expected = fileURLToPath(new URL("./golden/expected/", import.meta.url));

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function permuteUnordered(input: CalculationInputV2): CalculationInputV2 {
  return {
    ...input,
    project: {
      ...input.project,
      routes: [...input.project.routes].reverse(),
      connections: [...input.project.connections].reverse(),
      accessoryProductIds: [...input.project.accessoryProductIds].reverse()
    },
    products: [...input.products].reverse(),
    compatibilityRelations: [...input.compatibilityRelations].reverse(),
    rules: [...input.rules].reverse(),
    assemblyTemplates: [...input.assemblyTemplates].reverse(),
    manualItems: [...input.manualItems].reverse(),
    productQuantityAdjustments: [...input.productQuantityAdjustments].reverse(),
    linePolicies: [...input.linePolicies].reverse()
  };
}

describe("Stage 6 human-reviewable golden scenarios", () => {
  it("matches every committed expected JSON document", async () => {
    const names = (await readdir(fixtures)).filter((name) => name.endsWith(".json")).sort();
    expect(names).toHaveLength(7);
    for (const name of names) {
      const input = CalculationInputV2Schema.parse(await readJson(`${fixtures}${name}`));
      const expectedResult = CalculationResultV2Schema.parse(await readJson(`${expected}${name}`));
      expect(calculateV2(input), name).toEqual(expectedResult);
    }
  });

  it("replays every scenario byte-for-byte and records stable canonical hashes", async () => {
    const names = (await readdir(fixtures)).filter((name) => name.endsWith(".json")).sort();
    const hashes: Record<string, string> = {};
    for (const name of names) {
      const input = CalculationInputV2Schema.parse(await readJson(`${fixtures}${name}`));
      const bytes = canonicalJson(calculateV2(input));
      for (let replay = 0; replay < 5; replay += 1)
        expect(canonicalJson(calculateV2(input)), `${name} replay ${replay}`).toBe(bytes);
      hashes[name] = createHash("sha256").update(bytes, "utf8").digest("hex");
    }
    expect(Object.values(hashes).every((hash) => /^[0-9a-f]{64}$/u.test(hash))).toBe(true);
  });

  it("canonicalizes semantically unordered input arrays", async () => {
    const input = CalculationInputV2Schema.parse(
      await readJson(`${fixtures}all-major-rules-combined.json`)
    );
    expect(canonicalJson(calculateV2(permuteUnordered(input)))).toBe(
      canonicalJson(calculateV2(input))
    );
  });
});
