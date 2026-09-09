import { describe, expect, it } from "vitest";
import {
  assertBuiltAssetDiscovery,
  classifySecuritySource,
  securityTextFindings
} from "../lib/stage10-security-guards.js";

describe("Stage 10 security scanner guards", () => {
  it("scans environment examples and relevant configuration and data text formats", () => {
    for (const path of [
      ".env.example",
      "apps/backend/.env.example",
      "database/migrations/change.sql",
      "catalogue/products.csv",
      "gateway/Caddyfile",
      "apps/frontend/Dockerfile",
      "settings.toml",
      "styles.css",
      "configuration.ini"
    ])
      expect(classifySecuritySource(path), path).toBe("scan");
  });

  it("refuses sensitive paths before content selection, including alternative separators and case", () => {
    for (const path of [
      "data/secrets/password",
      "DATA\\secrets\\password",
      ".env",
      ".env.production",
      "apps/backend/.env.test",
      "backup.dump",
      "certificate.pem",
      "private.key",
      "identity.pfx",
      "password.secret",
      "storage-state-probe.json"
    ])
      expect(classifySecuritySource(path), path).toBe("reject");
    expect(classifySecuritySource("template.xlsx")).toBe("skip");
    expect(classifySecuritySource("photo.png")).toBe("skip");
  });

  it("detects synthetic signatures in each newly included format without returning matched values", () => {
    const signatures = [
      ["-----BEGIN ", "PRIVATE KEY-----"].join(""),
      ["ghp", "_", "a".repeat(32)].join(""),
      ["AK", "IA", "X".repeat(16)].join(""),
      [
        "postgresql",
        "://",
        "synthetic-user",
        ":",
        "synthetic-password",
        "@",
        "localhost/test"
      ].join("")
    ];
    for (const path of [".env.example", "migration.sql", "products.csv", "gateway/Caddyfile"])
      for (const signature of signatures) {
        expect(classifySecuritySource(path)).toBe("scan");
        expect(securityTextFindings(path, `CONFIG=${signature}`)).toEqual(["credential-signature"]);
        expect(securityTextFindings(path, signature, true)).toEqual(["built-credential-signature"]);
      }
  });

  it("distinguishes actual external assets from explanatory URLs and checks built imports", () => {
    const url = ["https:", "//", "example.invalid", "/runtime.js"].join("");
    expect(securityTextFindings("apps/frontend/src/app.tsx", `<script src="${url}">`)).toEqual([
      "external-runtime-asset"
    ]);
    expect(securityTextFindings("docs/design.md", `<script src="${url}">`)).toEqual([]);
    expect(securityTextFindings("apps/backend/dist/app.js", `import "${url}"`, true)).toEqual([
      "built-external-asset"
    ]);
    expect(
      securityTextFindings("apps/backend/dist/app.js", `// documentation: ${url}`, true)
    ).toEqual([]);
  });

  it("rejects either missing runtime asset set even when the other set is nonempty", () => {
    expect(() => assertBuiltAssetDiscovery(["frontend.js"], ["backend.js"])).not.toThrow();
    expect(() => assertBuiltAssetDiscovery([], ["backend.js"])).toThrow(
      "Frontend runtime asset scan discovered zero files"
    );
    expect(() => assertBuiltAssetDiscovery(["frontend.js"], [])).toThrow(
      "Backend runtime asset scan discovered zero files"
    );
  });
});
