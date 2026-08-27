import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { calculateV2 } from "../packages/calculation-engine/src/index.js";
import { goldenScenarios } from "../packages/calculation-engine/tests/helpers/scenarios.js";

const fixtureDirectory = resolve("packages/calculation-engine/tests/golden/fixtures");
const expectedDirectory = resolve("packages/calculation-engine/tests/golden/expected");

await mkdir(fixtureDirectory, { recursive: true });
await mkdir(expectedDirectory, { recursive: true });

for (const [name, buildInput] of Object.entries(goldenScenarios).sort(([left], [right]) =>
  left.localeCompare(right)
)) {
  const input = buildInput();
  const result = calculateV2(input);
  await writeFile(
    resolve(fixtureDirectory, `${name}.json`),
    `${JSON.stringify(input, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    resolve(expectedDirectory, `${name}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8"
  );
}
