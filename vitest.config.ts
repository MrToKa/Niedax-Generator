import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@niedax/calculation-engine": fileURLToPath(
        new URL("./packages/calculation-engine/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    coverage: {
      reporter: ["text", "html"]
    },
    include: ["{apps,packages,database,scripts}/**/*.test.ts"],
    testTimeout: 15_000
  }
});
