import { describe, expect, it } from "vitest";

import { translate, type TranslationKey } from "./i18n";

describe("UI resources", () => {
  it("starts with complete Bulgarian and English UI resources", () => {
    expect(translate("bg", "projects")).toBe("Проекти");
    expect(translate("en", "projects")).toBe("Projects");
  });

  it("interpolates stable user values without translating them", () => {
    expect(translate("bg", "dependentCleared", { fields: "R-01 / NX-100" })).toContain(
      "R-01 / NX-100"
    );
  });

  it("gives the material and finish controls distinct accessible names", () => {
    expect(translate("bg", "material")).toBe("Материал");
    expect(translate("bg", "finish")).toBe("Покритие");
    expect(translate("en", "material")).toBe("Material");
    expect(translate("en", "finish")).toBe("Finish");
  });

  it.each([
    [
      "validationSuperseded",
      "Черновата се промени по време на проверката. По-старата проверка беше отхвърлена.",
      "The draft changed while validation was running. The older validation was discarded."
    ],
    ["validationComplete", "Проверката завърши.", "Validation completed."],
    [
      "calculationSuperseded",
      "Черновата се промени по време на изчислението. По-старият резултат е неактуален; изчислете отново.",
      "The draft changed while calculation was running. The older result is stale; calculate again."
    ],
    [
      "calculationComplete",
      "Изчислението завърши. Резултатите са отворени.",
      "Calculation completed. Results are open."
    ]
  ] satisfies readonly (readonly [TranslationKey, string, string])[])(
    "translates the retained %s announcement key at render time",
    (key, bulgarian, english) => {
      expect(translate("bg", key)).toBe(bulgarian);
      expect(translate("en", key)).toBe(english);
    }
  );
});
