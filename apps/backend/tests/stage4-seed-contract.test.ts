import { readFile } from "node:fs/promises";

import { CalculationInputV1Schema, CalculationResultV1Schema } from "@niedax/domain";
import { describe, expect, it } from "vitest";

describe("Stage 4 seed snapshots", () => {
  it("stores a valid CalculationInputV1 and CalculationResultV1 fixture", async () => {
    const sql = await readFile(
      new URL("../../../database/seeds/development.sql", import.meta.url),
      "utf8"
    );
    const documents = [...sql.matchAll(/\$json\$([\s\S]*?)\$json\$::jsonb/gu)].map((match) =>
      JSON.parse(match[1] ?? "null")
    );

    expect(documents).toHaveLength(2);
    expect(CalculationInputV1Schema.safeParse(documents[0]).success).toBe(true);
    expect(CalculationResultV1Schema.safeParse(documents[1]).success).toBe(true);
  });
});
