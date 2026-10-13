import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalculationBuildProvenance } from "../app/calculation-build-provenance";

describe("saved calculation application build display", () => {
  it.each(["bg", "en"] as const)(
    "shows captured build and explicitly unavailable legacy provenance in %s",
    (language) => {
      const html = renderToStaticMarkup(
        createElement(CalculationBuildProvenance, {
          language,
          build: {
            application: "0.1.0",
            gitCommit: "abc12345".repeat(5),
            buildTimestamp: "2026-09-01T07:00:00.000Z",
            environment: "test"
          }
        })
      );
      expect(html).toContain("abc12345".repeat(5));
      expect(html).toContain("2026-09-01T07:00:00.000Z");
      expect(html).toContain("0.1.0");
      expect(html).toContain(
        language === "en"
          ? "saving or reviewing it on another build does not replace"
          : "запазване или преглед с друга версия не заменя"
      );
      const legacy = renderToStaticMarkup(
        createElement(CalculationBuildProvenance, { language, build: undefined })
      );
      expect(legacy).toContain(
        language === "en"
          ? "current server build is not attributed"
          : "Текущата версия на сървъра не се приписва"
      );
      expect(legacy).not.toContain("abc12345".repeat(5));
    }
  );

  it("keeps genuinely unknown configured SHA/time explicit instead of inserting examples", () => {
    const html = renderToStaticMarkup(
      createElement(CalculationBuildProvenance, {
        language: "en",
        build: {
          application: "0.1.0",
          gitCommit: null,
          buildTimestamp: null,
          environment: "development"
        }
      })
    );
    expect(html).toContain("Unknown");
    expect(html).not.toContain("sourceFingerprint");
  });
});
