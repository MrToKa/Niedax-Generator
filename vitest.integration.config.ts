import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
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
    include: ["{apps,packages,database,scripts}/**/*.integration.test.ts"],
    testTimeout: 30_000
  }
});
