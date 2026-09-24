import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@niedax/export": fileURLToPath(new URL("./packages/export/src/index.ts", import.meta.url)),
      "@niedax/calculation-engine": fileURLToPath(
        new URL("./packages/calculation-engine/src/index.ts", import.meta.url)
      ),
      "@niedax/catalog-import": fileURLToPath(
        new URL("./packages/catalog-import/src/index.ts", import.meta.url)
      ),
      "@niedax/domain": fileURLToPath(new URL("./packages/domain/src/index.ts", import.meta.url))
    }
  },
  test: {
    reporters: ["default", ["./scripts/stage10-vitest-reporter.ts", { mode: "unit" }]],
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts", "**/*.spec.ts"],
    coverage: {
      reporter: ["text", "html"]
    },
    include: ["{apps,packages,database,scripts}/**/*.test.ts"],
    testTimeout: 15_000
  }
});
