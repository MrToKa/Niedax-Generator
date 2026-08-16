import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  catalogSheetNames,
  exportValidationIssuesCsv,
  parseCsvBundle,
  runCatalogPipeline,
  type CatalogSheetName
} from "../packages/catalog-import/src/index.js";

const argumentsList = process.argv.slice(2);
const sourceIndex = argumentsList.indexOf("--source");
const reportIndex = argumentsList.indexOf("--report");
const sourceDirectory = resolve(
  sourceIndex >= 0
    ? (argumentsList[sourceIndex + 1] ?? "catalogue/imports/niedax-p0-2022")
    : "catalogue/imports/niedax-p0-2022"
);

const files: Partial<Record<CatalogSheetName, string>> = {};
for (const sheet of catalogSheetNames) {
  files[sheet] = await readFile(resolve(sourceDirectory, `${sheet}.csv`), "utf8");
}
const result = runCatalogPipeline(parseCsvBundle(files));
if (reportIndex >= 0) {
  const reportPath = resolve(argumentsList[reportIndex + 1] ?? "catalog-validation-errors.csv");
  await writeFile(reportPath, exportValidationIssuesCsv(result.report.issues), "utf8");
}
process.stdout.write(
  `${JSON.stringify(
    {
      mode: "dry-run",
      sourceDirectory,
      contentHash: result.bundle.contentHash,
      valid: result.report.valid,
      counts: result.report.counts,
      productFamilies: Object.fromEntries(
        [...new Set(result.bundle.products.map((product) => product.productFamily))]
          .sort()
          .map((family) => [
            family,
            result.bundle.products.filter((product) => product.productFamily === family).length
          ])
      )
    },
    null,
    2
  )}\n`
);
if (!result.report.valid) process.exitCode = 1;
