import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { getApprovedWorkbookMapping, renderExcelWorkbook } from "../src/index.js";
import { readCells, readParts } from "./helpers/ooxml.js";
import {
  approvedTemplateControlContext,
  syntheticContext,
  syntheticMapping
} from "./helpers/synthetic.js";

// Candidates are separate from reviewed fixtures. This command never updates
// synthetic-control.expected.json or the accepted golden workbook.
const folder = resolve(process.cwd(), "../../.artifacts/stage9-candidate");
await mkdir(folder, { recursive: true });
const workbook = await renderExcelWorkbook(syntheticContext(), syntheticMapping);
await writeFile(resolve(folder, "synthetic-control.candidate.xlsx"), workbook.bytes);
const parts = readParts(workbook.bytes);
const semantic = Object.fromEntries(
  [1, 2, 3].map((index) => [`sheet${index}`, Object.fromEntries(readCells(parts, index))])
);
await writeFile(
  resolve(folder, "synthetic-control.candidate.semantic.json"),
  `${JSON.stringify(semantic, null, 2)}\n`
);
process.stdout.write(`Synthetic candidate and independent semantic dump written to ${folder}\n`);
const approved = await renderExcelWorkbook(
  approvedTemplateControlContext(),
  getApprovedWorkbookMapping()!
);
await writeFile(resolve(folder, "change-order-control.candidate.xlsx"), approved.bytes);
const approvedParts = readParts(approved.bytes);
const approvedSemantic = Object.fromEntries(
  [1, 2, 3].map((index) => [`sheet${index}`, Object.fromEntries(readCells(approvedParts, index))])
);
await writeFile(
  resolve(folder, "change-order-control.candidate.semantic.json"),
  `${JSON.stringify(approvedSemantic, null, 2)}\n`
);
