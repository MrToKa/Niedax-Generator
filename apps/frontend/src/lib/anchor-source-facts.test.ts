import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProductSnapshotV2 } from "@niedax/domain";
import { AnchorSourceFacts } from "../app/anchor-source-facts";

const facts: NonNullable<ProductSnapshotV2["sourceFacts"]> = {
  indoorOnly: true,
  catalogSubstrate: "concrete",
  approvalNumber: "ETA 15/0784",
  dopNumber: null,
  engineeringNote: "Verify the applicable ETA, substrate condition, edge distances and loads.",
  source: {
    kind: "catalogDocument",
    id: "source-nsa",
    sourceDocument: "1.-Electrical-installation-materials.pdf",
    sourcePage: "157"
  }
};

describe("source-backed anchor restrictions", () => {
  it.each(["en", "bg"] as const)(
    "renders explicit NSA facts and missing environmental context in %s",
    (language) => {
      const html = renderToStaticMarkup(
        createElement(AnchorSourceFacts, { code: "NSA 6X35/FKK-T30 V", facts, language })
      );
      expect(html).toContain("ETA 15/0784");
      expect(html).toContain(language === "en" ? "Concrete" : "Бетон");
      expect(html).toContain("1.-Electrical-installation-materials.pdf");
      expect(html).toContain("157");
      expect(html).toContain(language === "en" ? "indoor use only" : "само за вътрешна употреба");
      expect(html).toContain(
        language === "en" ? "no indoor/outdoor setting" : "няма настройка за вътрешна/външна среда"
      );
      expect(html).toContain(
        language === "en"
          ? "do not establish structural suitability"
          : "не доказват конструктивна пригодност"
      );
    }
  );

  it("does not invent indoor restrictions for DAM/DAZ or retrofit absent legacy facts", () => {
    const html = renderToStaticMarkup(
      createElement(AnchorSourceFacts, {
        code: "DAM 6X5",
        facts: { ...facts, indoorOnly: false, approvalNumber: "ETA-18/0541", dopNumber: "NI 001" },
        language: "en"
      })
    );
    expect(html).toContain("ETA-18/0541");
    expect(html).toContain("NI 001");
    expect(html).not.toContain("indoor use only");
    expect(
      renderToStaticMarkup(
        createElement(AnchorSourceFacts, {
          code: "Legacy anchor",
          facts: undefined,
          language: "en"
        })
      )
    ).toBe("");
  });
});
