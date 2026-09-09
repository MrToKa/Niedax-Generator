import { describe, expect, it } from "vitest";
import { CalculationInputV2Schema } from "@niedax/domain";
import { CalculationEngineError, calculateV2 } from "../src/index.js";
import expected from "./fixtures/stage10-expected.json" with { type: "json" };
import { stage10Scenarios } from "./helpers/stage10-scenarios.js";
import {
  assertPerformanceResult,
  connectRoutes,
  line,
  manualItem,
  metadata,
  performanceInput,
  product,
  required,
  straightInput
} from "./helpers/stage10-fixtures.js";
import {
  API_PERFORMANCE_EXPECTED,
  assertApiPerformanceResult,
  performanceDraft
} from "./helpers/stage10-api-performance.js";

describe("Stage 10 controlled material regressions", () => {
  for (const [id, reference] of Object.entries(expected.scenarios)) {
    it(`${id} matches the independently derived complete BOM and warning multiset`, () => {
      const input = required(stage10Scenarios[id])();
      expect(CalculationInputV2Schema.safeParse(input).success).toBe(true);
      const result = calculateV2(input);
      const actual = result.bomLines.map((item) => [
        item.productCode ?? item.manualInputId,
        item.technicalQuantity.value,
        item.orderedQuantity.value
      ]);
      expect(actual.sort()).toEqual([...reference.bom].sort());
      const warningCounts: Record<string, number> = {};
      for (const warning of result.warnings)
        warningCounts[warning.code] = (warningCounts[warning.code] ?? 0) + 1;
      expect(warningCounts).toEqual(reference.warningCounts);
      expect(result.summary.approvalReady).toBe(id !== "T08");
      for (const item of result.bomLines) {
        expect(item.provenance.formulaIds.length).toBeGreaterThan(0);
        const final = result.trace.steps.filter((step) => step.bomLineId === item.id).at(-1);
        expect(final?.formula.id).toBe("BOM.FINALIZE.V1");
        expect(final?.output).toEqual(item.orderedQuantity);
      }
    });
  }

  it("T01 retains 17 sections and 2 m unused capacity in the actual metre order unit", () => {
    const result = calculateV2(required(stage10Scenarios.T01)());
    const straight = line(result, "KL 60.203");
    expect(straight.unit).toBe("m");
    expect(straight.sectionDetail?.technicalSectionCount.value).toBe("17");
    expect(straight.technicalQuantity.value).toBe("102");
    const step = required(
      result.trace.steps.find(
        (candidate) => candidate.formula.id === "SECTION.REQUIRED_PER_SEGMENT.V1"
      )
    );
    expect(step.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "segmentLength", value: "100", unit: "m" })
      ])
    );
    expect(straight.sourceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceDocument: "KAT_NX_KR 2022.pdf", sourcePage: "KR 340" })
      ])
    );
  });

  it("T01 omits an unresolved joint mapping without inventing a Niedax connector", () => {
    const input = required(stage10Scenarios.T01)();
    input.rules = input.rules.filter((rule) => rule.type !== "internalJoint");
    const result = calculateV2(input);
    expect(line(result, "KL 60.203").technicalQuantity.value).toBe("102");
    expect(result.bomLines.some((item) => item.category === "connector")).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNRESOLVED_JOINT_PRODUCT",
          approvalImpact: "blocksApproval"
        })
      ])
    );
  });

  it("T02 keeps the dedicated two-per-support WSTB demand a project rule", () => {
    const result = calculateV2(required(stage10Scenarios.T02)());
    expect(line(result, "WSTB 2")).toMatchObject({
      technicalQuantity: { value: "136" },
      status: "projectRule"
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "WSTB_PROJECT_RULE_UNCONFIRMED",
          approvalImpact: "reviewRequired"
        })
      ])
    );
  });

  it("T03 rounds exact and immediately adjacent 3 m and 6 m boundaries independently", () => {
    for (const [length, supply, count] of [
      ["2.999999999999999999", "3", "1"],
      ["3", "3", "1"],
      ["3.000000000000000001", "3", "2"],
      ["5.999999999999999999", "6", "1"],
      ["6", "6", "1"],
      ["6.000000000000000001", "6", "2"],
      ["8.5", "6", "2"]
    ]) {
      const input = straightInput([required(length)]);
      required(input.project.routes[0]).defaultSupplyOptionId = `supply-${supply}m`;
      expect(
        line(calculateV2(input), "NX STRAIGHT").sectionDetail?.technicalSectionCount.value,
        length
      ).toBe(count);
    }
    expect(
      line(calculateV2(straightInput(["3.1", "2.9"])), "NX STRAIGHT").sectionDetail
        ?.technicalSectionCount.value
    ).toBe("2");
  });

  it("T04 separates incompatible support groups and honors the reject mismatch policy", () => {
    const input = straightInput();
    connectRoutes(input, 2);
    required(input.project.routes[1]).supports.spacing.value = "2";
    const result = calculateV2(input);
    expect(line(result, "NX SUPPORT").technicalQuantity.value).toBe("9");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SUPPORT_CONFIGURATION_MISMATCH",
          severity: "engineeringReview"
        })
      ])
    );
    input.options.supportMismatchPolicy = "fail";
    expect(() => calculateV2(input)).toThrow(CalculationEngineError);
  });

  it("T05 and T07 own physical connector events once and keep included fasteners informational", () => {
    for (const id of ["T05", "T07"]) {
      const input = required(stage10Scenarios[id])(),
        result = calculateV2(input),
        connector = line(result, "NX CONNECTOR");
      expect(connector.includedItems).toEqual([
        expect.objectContaining({
          productCode: "NX FASTENER",
          quantityPerParent: { value: "2", unit: "pcs" }
        })
      ]);
      expect(result.bomLines.some((item) => item.productCode === "NX FASTENER")).toBe(false);
      const events = result.trace.steps.filter(
        (step) =>
          step.formula.id === "CONNECTION.FITTING_SPECIFIC.V1" && step.bomLineId === connector.id
      );
      expect(events).toHaveLength(1);
      expect(events[0]?.sourceRefs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "connection", id: "connection-0" })
        ])
      );
    }
  });

  it("T06 retains manual support reason and original plus additional quantities", () => {
    const input = required(stage10Scenarios.T06)(),
      result = calculateV2(input);
    const step = required(
      result.trace.steps.find(
        (candidate) => candidate.formula.id === "SUPPORT.MANUAL_CORRECTION.V1"
      )
    );
    expect(step.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "originalCalculatedQuantity", value: "6" }),
        expect.objectContaining({ name: "manualAdditionalQuantity", value: "2" })
      ])
    );
    expect(step.sourceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "manualOverride", id: "manual-bend-supports" })
      ])
    );
    expect(
      required(input.project.routes[0]).supports.manualAdditionalSupports[0]?.metadata.reason
    ).not.toBe("");
  });

  it("T07 rejects duplicated or nonexistent participants and missing compatible connection mappings", () => {
    const duplicate = required(stage10Scenarios.T07)();
    const connection = required(duplicate.project.connections[0]);
    connection.participants[2] = structuredClone(required(connection.participants[0]));
    expect(CalculationInputV2Schema.safeParse(duplicate).success).toBe(false);
    const nonexistent = required(stage10Scenarios.T07)();
    required(required(nonexistent.project.connections[0]).participants[2]).endpointId =
      "missing-endpoint";
    expect(CalculationInputV2Schema.safeParse(nonexistent).success).toBe(false);
    const missing = required(stage10Scenarios.T07)();
    required(missing.project.connections[0]).materialRuleId = null;
    const result = calculateV2(missing);
    expect(result.bomLines.some((item) => item.productCode === "NX CONNECTOR")).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNRESOLVED_FITTING_CONNECTION",
          approvalImpact: "blocksApproval"
        })
      ])
    );
  });

  it("T08 defers a connected endpoint to its physical owner", () => {
    const input = required(stage10Scenarios.T05)();
    const endpoint = required(input.project.routes[0]).endEndpoint;
    endpoint.type = "equipment";
    expect(
      calculateV2(input).warnings.some((warning) => warning.code === "UNRESOLVED_ENDPOINT_MATERIAL")
    ).toBe(false);
    expect(line(calculateV2(input), "NX CONNECTOR").technicalQuantity.value).toBe("2");
  });

  it("T09 and T10 retain exact anchor identities packages and engineering approval effects", () => {
    for (const [id, code, increment] of [
      ["T09-DAM", "DAM 6X5", "50"],
      ["T09-DAZ", "DAZ 8X10", "50"],
      ["T10", "NSA 6X35/FKK-T30 V", "100"]
    ]) {
      const result = calculateV2(required(stage10Scenarios[required(id)])());
      expect(line(result, required(code))).toMatchObject({
        technicalQuantity: { value: "10", unit: "pcs" },
        packageIncrement: { value: increment, unit: "pcs" },
        packageCount: { value: "1", unit: "packages" },
        status: "engineeringReview"
      });
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "ANCHOR_ENGINEERING_CHECK_REQUIRED",
            severity: "engineeringReview",
            approvalImpact: "reviewRequired"
          })
        ])
      );
    }
  });

  it("T10 omits NSA for missing unknown or denied context and blocks approval", () => {
    for (const context of ["missing", "unknown", "denied", "unresolved"] as const) {
      const input = required(stage10Scenarios.T10)(),
        route = required(input.project.routes[0]);
      if (context === "missing") route.supports.substrate = null;
      if (context === "unknown") route.supports.substrate = "unknown";
      if (context === "denied") {
        route.supports.substrate = "masonry";
        required(
          input.compatibilityRelations.find((relation) => relation.context === "anchor")
        ).allowed = false;
      }
      if (context === "unresolved") {
        const relation = required(
          input.compatibilityRelations.find((item) => item.context === "anchor")
        );
        relation.subjectRef = "unrelated-context";
      }
      const result = calculateV2(input);
      expect(result.bomLines.some((item) => item.productCode === "NSA 6X35/FKK-T30 V")).toBe(false);
      const code = {
        missing: "MISSING_SUBSTRATE_OR_BASE",
        unknown: "UNKNOWN_SUBSTRATE",
        denied: "ANCHOR_PRODUCT_INCOMPATIBLE",
        unresolved: "MISSING_COMPATIBILITY_RULE"
      }[context];
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code, severity: "blocking", approvalImpact: "blocksApproval" })
        ])
      );
      input.options.unresolvedMaterialPolicy = "fail";
      expect(() => calculateV2(input)).toThrow(CalculationEngineError);
    }
  });

  it("T11 keeps technical reserve reserved packaging overage order and spare distinct", () => {
    expect(line(calculateV2(required(stage10Scenarios.T11)()), "NX STRAIGHT")).toMatchObject({
      technicalQuantity: { value: "102" },
      reserveQuantity: { value: "6" },
      reservedQuantity: { value: "108" },
      packageIncrement: { value: "24" },
      packageCount: { value: "5" },
      packagingOverage: { value: "12" },
      orderedQuantity: { value: "120" },
      totalSpareQuantity: { value: "18" },
      sectionDetail: {
        technicalSectionCount: { value: "17" },
        reservedSectionCount: { value: "18" }
      }
    });
  });

  it("T12 preserves manual identity while adding editing removing and changing independent policies", () => {
    const input = required(stage10Scenarios.T12)();
    const first = calculateV2(input);
    expect(
      first.bomLines
        .filter((item) => item.category === "manual")
        .every((item) => item.manualInputId !== null && item.status === "manual")
    ).toBe(true);
    const free = required(input.manualItems.find((item) => item.kind === "freeText"));
    free.quantity.value = "3.5";
    free.packagingPolicy = { mode: "disabled", metadata: metadata("disable-manual-pack") };
    const edited = required(
      calculateV2(input).bomLines.find((item) => item.manualInputId === free.id)
    );
    expect(edited).toMatchObject({
      technicalQuantity: { value: "3.5" },
      reservedQuantity: { value: "3.675" },
      orderedQuantity: { value: "3.675" },
      packageCount: null
    });
    input.manualItems = input.manualItems.filter((item) => item.id !== free.id);
    expect(calculateV2(input).bomLines.some((item) => item.manualInputId === free.id)).toBe(false);
    const catalog = required(input.manualItems[0]);
    catalog.productCode = "wrong-code";
    expect(() => calculateV2(input)).toThrow(CalculationEngineError);
  });

  it("uses explicit manual template quantities once and omits unresolved parameters", () => {
    const input = straightInput(),
      template = required(input.assemblyTemplates[0]),
      route = required(input.project.routes[0]);
    template.components.push({
      id: "manual-template-component",
      productId: "product-structure",
      role: "structure",
      quantity: { value: "1", unit: "pcs" },
      quantityMode: "manual",
      manualParameterId: "manual-parameter",
      suppressWhenIncluded: false,
      source: {
        kind: "templateComponent",
        id: "manual-template-component",
        sourceDocument: null,
        sourcePage: null
      }
    });
    const unresolved = calculateV2(input);
    expect(unresolved.bomLines.some((item) => item.productCode === "NX STRUCTURE")).toBe(false);
    expect(unresolved.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TEMPLATE_COMPONENT_MANUAL_VALUE_REQUIRED",
          approvalImpact: "blocksApproval"
        })
      ])
    );
    route.supports.templateManualValues.push({
      componentId: "manual-template-component",
      quantity: { value: "7", unit: "pcs" },
      metadata: metadata("manual-component")
    });
    expect(line(calculateV2(input), "NX STRUCTURE").technicalQuantity.value).toBe("7");
  });

  it("keeps identical manual descriptions separate by manual identity and unit", () => {
    const input = straightInput();
    input.manualItems = [
      manualItem("manual-one", "2.5", "m"),
      manualItem("manual-two", "2.5", "kg")
    ];
    for (const item of input.manualItems) item.descriptionEn = "Identical manual label";
    const lines = calculateV2(input).bomLines.filter((item) => item.category === "manual");
    expect(
      lines.map((item) => [item.manualInputId, item.unit, item.orderedQuantity.value]).sort()
    ).toEqual([
      ["manual-one", "m", "3"],
      ["manual-two", "kg", "3"]
    ]);
  });

  it("rejects invalid decimals units zero quantities and precision without rejecting permitted zero adjustments", () => {
    for (const value of [
      "0",
      "-1",
      "-0",
      "6.0",
      "01",
      "1e3",
      "NaN",
      "0.0000000000000000001",
      "1234567890123456789012345678901"
    ])
      expect(CalculationInputV2Schema.safeParse(straightInput([value])).success, value).toBe(false);
    const zeroSpacing = straightInput();
    required(zeroSpacing.project.routes[0]).supports.spacing.value = "0";
    expect(CalculationInputV2Schema.safeParse(zeroSpacing).success).toBe(false);
    const zeroPack = straightInput();
    product(zeroPack, "product-support").packageIncrement = { value: "0", unit: "pcs" };
    expect(CalculationInputV2Schema.safeParse(zeroPack).success).toBe(false);
    const zeroManual = straightInput();
    zeroManual.manualItems = [manualItem("zero", "0")];
    expect(CalculationInputV2Schema.safeParse(zeroManual).success).toBe(false);
    const zeroCustom = straightInput();
    required(zeroCustom.project.routes[0]).supports.wstb = {
      mode: "custom",
      ruleId: "rule-wstb-two",
      quantityPerSupport: "0",
      metadata: metadata("zero-custom")
    };
    expect(CalculationInputV2Schema.safeParse(zeroCustom).success).toBe(false);
    const invalidUnit = straightInput();
    const invalidSegment = required(required(invalidUnit.project.routes[0]).geometry[0]);
    if (invalidSegment.kind === "straight") Reflect.set(invalidSegment.length, "unit", "kg");
    expect(CalculationInputV2Schema.safeParse(invalidUnit).success).toBe(false);
    const input = straightInput();
    input.project.cableLoad = { value: "0", unit: "kgPerM" };
    required(input.project.routes[0]).supports.manualAdditionalSupports.push({
      id: "zero-adjustment",
      originalCalculatedQuantity: { value: "5", unit: "pcs" },
      additionalQuantity: { value: "0", unit: "pcs" },
      sourceEntityRef: "route-a",
      metadata: metadata("zero-adjustment")
    });
    expect(line(calculateV2(input), "NX SUPPORT").technicalQuantity.value).toBe("5");
  });

  it("preserves exact large valid quantities beyond binary integer precision", () => {
    const input = straightInput(["60000000000000000"]);
    expect(line(calculateV2(input), "NX STRAIGHT").sectionDetail?.technicalSectionCount.value).toBe(
      "10000000000000000"
    );
    expect(line(calculateV2(input), "NX JOINT").technicalQuantity.value).toBe("9999999999999999");
  });

  it("pins valid typical and large benchmark counts and literal correctness", () => {
    for (const size of ["typical", "large"] as const) {
      const input = performanceInput(size);
      expect(CalculationInputV2Schema.safeParse(input).success).toBe(true);
      assertPerformanceResult(size, calculateV2(input));
    }
  });

  it("pins transport benchmark sizes and accepted unresolved fitting expectations", () => {
    for (const size of ["typical", "large"] as const) {
      let index = 1;
      const nextId = () => `b1000000-0000-4000-8000-${String(index++).padStart(12, "0")}`;
      const ids = {
        straight: nextId(),
        support: nextId(),
        connector: nextId(),
        anchor: nextId(),
        template: nextId(),
        supply: "synthetic-supply",
        system: "S10-SYN"
      };
      const draft = performanceDraft(size, ids, nextId),
        reference = API_PERFORMANCE_EXPECTED[size];
      expect(draft.routes).toHaveLength(reference.routes);
      expect(draft.connections).toHaveLength(reference.connections);
      expect(draft.manualItems).toHaveLength(reference.manualItems);
      expect(
        draft.routes.flatMap((route) => route.geometry).filter((item) => item.kind === "straight")
      ).toHaveLength(reference.segments);
      const input = performanceInput(size);
      input.project.cableLoad = { value: "0", unit: "kgPerM" };
      product(input, "product-straight").code = "S10-SYN-STRAIGHT";
      product(input, "product-support").code = "S10-SYN-SUPPORT";
      product(input, "product-joint").code = "S10-SYN-CONNECTOR";
      product(input, "product-joint").packageIncrement = { value: "2", unit: "pcs" };
      product(input, "product-anchor").code = "S10-SYN-ANCHOR";
      product(input, "product-anchor").packageIncrement = { value: "10", unit: "pcs" };
      for (const route of input.project.routes) {
        route.supports.wstbProductId = null;
        for (const item of route.geometry)
          if (item.kind === "fitting") {
            item.productId = null;
            item.connectionRuleId = null;
            item.additionalSupportRuleId = null;
          }
      }
      for (const item of input.manualItems)
        item.packagingPolicy = { mode: "disabled", metadata: null };
      assertApiPerformanceResult(size, calculateV2(input));
    }
  });
});
