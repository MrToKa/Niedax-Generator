import { describe, expect, it } from "vitest";

import {
  CalculationInputV2Schema,
  CalculationResultV2Schema,
  WarningCodeV2Schema,
  type CalculationInputV2
} from "@niedax/domain";
import { CalculationEngineError, calculateV2 } from "../src/index.js";
import { allMajorRulesInputV2 } from "./helpers/fixture-v2.js";
import { goldenScenarios } from "./helpers/scenarios.js";

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function mutableInput(): Mutable<CalculationInputV2> {
  return structuredClone(allMajorRulesInputV2) as Mutable<CalculationInputV2>;
}

function route(input: Mutable<CalculationInputV2>, id: string) {
  const found = input.project.routes.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`Missing route ${id}`);
  return found;
}

function product(input: Mutable<CalculationInputV2>, id: string) {
  const found = input.products.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`Missing product ${id}`);
  return found;
}

function bom(input: CalculationInputV2, code: string) {
  const found = calculateV2(input).bomLines.find((line) => line.productCode === code);
  if (found === undefined) throw new Error(`Missing BOM line ${code}`);
  return found;
}

describe("approved Stage 6 rule edge cases", () => {
  it("rounds 6.1 m selected as 6 m to two sections", () => {
    const input = mutableInput();
    const routeA = route(input, "route-a");
    routeA.geometry = [
      {
        id: "segment-6-1",
        kind: "straight",
        length: { value: "6.1", unit: "m" },
        supplyOptionId: null
      }
    ];
    routeA.startEndpoint = {
      id: "endpoint-a-start",
      type: "freeEnd",
      materialRuleId: null,
      connectionId: null
    };
    routeA.endEndpoint = {
      id: "endpoint-a-end",
      type: "freeEnd",
      materialRuleId: null,
      connectionId: null
    };
    input.project.routes = [routeA];
    input.project.connections = [];
    input.project.accessoryProductIds = [];
    input.manualItems = [];
    input.rules = input.rules.filter(
      (rule) =>
        rule.type !== "fittingConnection" &&
        rule.type !== "fittingAdditionalSupport" &&
        rule.type !== "endpointMaterial"
    );
    expect(bom(input, "NX STRAIGHT").sectionDetail?.technicalSectionCount.value).toBe("2");
  });

  it("keeps 3 m and 6 m demands separate", () => {
    const input = goldenScenarios["per-segment-rounding-and-3m-6m-separation"]?.();
    if (input === undefined) throw new Error("Missing mixed-supply scenario");
    const lines = calculateV2(input).bomLines.filter((line) => line.productCode === "NX STRAIGHT");
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.sectionDetail?.selectedSectionLength.value).sort()).toEqual([
      "3",
      "6"
    ]);
  });

  it("does not substitute an unresolved 3 m option with 6 m", () => {
    const input = mutableInput();
    const routeB = route(input, "route-b");
    routeB.defaultSupplyOptionId = "supply-3m";
    const option = product(input, "product-straight").supplyOptions.find(
      (candidate) => candidate.id === "supply-3m"
    );
    if (option === undefined) throw new Error("Missing 3 m option");
    option.active = false;
    const result = calculateV2(input);
    expect(result.warnings.map((warning) => warning.code)).toContain(
      "UNRESOLVED_SECTION_SUPPLY_OPTION"
    );
    const straightLines = result.bomLines.filter((line) => line.productCode === "NX STRAIGHT");
    expect(
      straightLines.every((line) => line.sectionDetail?.selectedSectionLength.value === "6")
    ).toBe(true);
  });

  it("accepts an included-only non-orderable product without packaging data", () => {
    const input = mutableInput();
    const fastener = product(input, "product-fastener");
    fastener.orderable = false;
    fastener.packageIncrement = null;
    for (const template of input.assemblyTemplates) {
      template.components = template.components.filter(
        (component) => component.productId !== fastener.id
      );
    }

    expect(() => calculateV2(input)).not.toThrow();
  });

  it("calculates separate physical support groups as 5 + 5, not continuous 9", () => {
    const input = mutableInput();
    const connection = input.project.connections[0];
    if (connection === undefined) throw new Error("Missing connection");
    connection.supportBehavior = "separate";
    route(input, "route-a").supports.manualAdditionalSupports = [];
    const extraRule = input.rules.find((rule) => rule.id === "rule-fitting-support-a");
    if (extraRule?.type !== "fittingAdditionalSupport") throw new Error("Missing fitting rule");
    extraRule.quantity.value = "0";
    expect(bom(input, "NX SUPPORT").technicalQuantity.value).toBe("10");
  });

  it("uses WSTB one, two, and custom without adding the template row", () => {
    const one = mutableInput();
    for (const candidate of one.project.routes)
      candidate.supports.wstb = { mode: "one", ruleId: "rule-wstb-two" };
    const oneRule = one.rules.find((rule) => rule.id === "rule-wstb-two");
    if (oneRule?.type !== "wstbPerSupport") throw new Error("Missing WSTB rule");
    oneRule.quantityPerSupport.value = "1";
    expect(bom(one, "NX WSTB").technicalQuantity.value).toBe("11");

    expect(bom(allMajorRulesInputV2, "NX WSTB").technicalQuantity.value).toBe("22");

    const custom = mutableInput();
    for (const candidate of custom.project.routes)
      candidate.supports.wstb = {
        mode: "custom",
        ruleId: "rule-wstb-two",
        quantityPerSupport: "3",
        metadata: {
          overrideId: "wstb-custom",
          reason: "Reviewed custom WSTB quantity",
          note: null,
          actorRef: "actor-checker",
          decisionRef: "decision-wstb-custom"
        }
      };
    const customResult = calculateV2(custom);
    expect(
      customResult.bomLines.find((line) => line.productCode === "NX WSTB")?.technicalQuantity.value
    ).toBe("33");
    expect(customResult.warnings.map((warning) => warning.code)).toContain(
      "MANUAL_QUANTITY_OVERRIDE"
    );
  });

  it("emits deterministic unresolved warnings without fabricated lines", () => {
    const input = goldenScenarios["unresolved-data-warning-matrix"]?.();
    if (input === undefined) throw new Error("Missing unresolved scenario");
    const result = calculateV2(input);
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "UNRESOLVED_SECTION_SUPPLY_OPTION",
        "UNRESOLVED_FITTING_CONNECTION",
        "UNRESOLVED_ENDPOINT_MATERIAL",
        "SUPPORT_CONFIGURATION_MISMATCH",
        "FITTING_ADDITIONAL_SUPPORT_UNRESOLVED",
        "ASSEMBLY_TEMPLATE_MISSING",
        "MISSING_ANCHOR_SELECTION",
        "MISSING_COMPATIBILITY_RULE"
      ])
    );
    expect(result.bomLines.some((line) => line.productCode === "NX END CAP")).toBe(false);
  });

  it("supports the complete required warning-code vocabulary", () => {
    const codes = [
      "MISSING_CABLE_LOAD",
      "MISSING_SUBSTRATE_OR_BASE",
      "UNKNOWN_SUBSTRATE",
      "MISSING_ANCHOR_SELECTION",
      "ANCHOR_ENGINEERING_CHECK_REQUIRED",
      "ANCHOR_PRODUCT_INCOMPATIBLE",
      "MISSING_COMPATIBILITY_RULE",
      "PRODUCT_SELECTION_INCOMPATIBLE",
      "UNRESOLVED_SECTION_SUPPLY_OPTION",
      "UNRESOLVED_JOINT_PRODUCT",
      "UNRESOLVED_FITTING_CONNECTION",
      "UNRESOLVED_ENDPOINT_MATERIAL",
      "SUPPORT_CONFIGURATION_MISMATCH",
      "FITTING_ADDITIONAL_SUPPORT_UNRESOLVED",
      "MANUAL_EXTRA_SUPPORT",
      "MANUAL_QUANTITY_OVERRIDE",
      "MANUAL_ANCHOR_OVERRIDE",
      "MANUAL_PACKAGE_OVERRIDE",
      "WSTB_PROJECT_RULE_UNCONFIRMED",
      "WSTB_TEMPLATE_RULE_CONFLICT",
      "ASSEMBLY_TEMPLATE_MISSING",
      "TEMPLATE_COMPONENT_MANUAL_VALUE_REQUIRED",
      "ENGINEERING_CHECK_REQUIRED"
    ];
    for (const code of codes) expect(WarningCodeV2Schema.safeParse(code).success, code).toBe(true);
  });

  it("rejects unknown keys and fail-on-unresolved material deterministically", () => {
    expect(
      CalculationInputV2Schema.safeParse({ ...allMajorRulesInputV2, uiState: "results" }).success
    ).toBe(false);
    const input = mutableInput();
    input.options.unresolvedMaterialPolicy = "fail";
    route(input, "route-a").startEndpoint.materialRuleId = null;
    expect(() => calculateV2(input)).toThrowError(CalculationEngineError);
  });

  it("round-trips result and trace as strict JSON and never mutates frozen input", () => {
    const input = structuredClone(allMajorRulesInputV2);
    const before = JSON.stringify(input);
    const freeze = (value: object): void => {
      for (const child of Object.values(value))
        if (child !== null && typeof child === "object") freeze(child);
      Object.freeze(value);
    };
    freeze(input);
    const result = calculateV2(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(CalculationResultV2Schema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });
});
