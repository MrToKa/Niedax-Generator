import type {
  AssemblyTemplateV2,
  CalculationInputV2,
  ProductSnapshotV2,
  TemplateComponentV2
} from "@niedax/domain";

import { ExactDecimal, ONE, ZERO, sumDecimals } from "../arithmetic/decimal.js";
import { CalculationEngineError } from "../errors.js";
import type { DemandEvent, TraceSeed } from "../model/demand-event.js";
import type { CalculationIndexes } from "../model/indexes.js";
import { sourceRef, uniqueSourceRefs } from "../model/source.js";
import { stableId } from "../stable/ids.js";
import type { LogicalSupportGroup } from "../topology/support-groups.js";
import { failIfRequired, requireCompatibleProduct } from "./compatibility.js";
import { resolvePolicies } from "./policies.js";
import type { WarningCollector } from "./warnings.js";

interface SupportCountResult {
  readonly total: ExactDecimal;
  readonly traceSeeds: readonly TraceSeed[];
  readonly warningIds: readonly string[];
}

function eventForProduct(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  warnings: WarningCollector,
  group: LogicalSupportGroup,
  product: ProductSnapshotV2,
  context: "support" | "structure" | "anchor" | "wstb" | "accessory",
  category: DemandEvent["category"],
  quantity: ExactDecimal,
  status: DemandEvent["status"],
  traceSeeds: readonly TraceSeed[],
  ruleIds: readonly string[],
  warningIds: readonly string[],
  inclusionSuppression: DemandEvent["inclusionSuppression"] = "independent"
): DemandEvent | null {
  const sources = uniqueSourceRefs([
    sourceRef("supportGroup", group.id),
    ...group.routeIds.map((id) => sourceRef("route", id)),
    product.source,
    ...traceSeeds.flatMap((seed) => seed.sourceRefs)
  ]);
  const compatibility = requireCompatibleProduct(
    input,
    indexes,
    warnings,
    product,
    context,
    "supportGroup",
    group.id,
    sources
  );
  if (!compatibility.compatible) {
    failIfRequired(input, group.id, `The selected ${context} product is not compatible.`);
    return null;
  }
  const policies = resolvePolicies(
    input,
    product,
    null,
    { mode: "projectDefault" },
    { mode: "catalogDefault" }
  );
  return {
    id: stableId("demand", [category, group.id, product.id, ...ruleIds]),
    product,
    manualInputId: null,
    manualProductCode: null,
    manualDescription: null,
    category,
    quantity,
    unit: product.orderUnit,
    supplyOptionId: null,
    sectionLength: null,
    sectionCount: null,
    reservePolicy: policies.reserve,
    packagingPolicy: policies.packaging,
    overrideBoundary: policies.overrideBoundary,
    status,
    inclusionSuppression,
    sourceRefs: sources,
    ruleIds,
    warningIds: [...warningIds, ...compatibility.warningIds],
    traceSeeds
  };
}

function calculateSupportCount(
  group: LogicalSupportGroup,
  indexes: CalculationIndexes,
  warnings: WarningCollector
): SupportCountResult {
  const sources = [
    sourceRef("supportGroup", group.id),
    ...group.routeIds.map((id) => sourceRef("route", id))
  ];
  const spacing = ExactDecimal.from(group.configuration.spacing.value);
  const unroundedBase = group.totalSupportedLength.divide(spacing);
  const base = unroundedBase.ceil().add(ONE);
  const traceSeeds: TraceSeed[] = [
    {
      formulaId: "SUPPORT.BASE_CONTINUOUS_GROUP.V1",
      inputs: [
        { name: "totalStraightLength", value: group.totalSupportedLength, unit: "m" },
        { name: "spacing", value: spacing, unit: "m" }
      ],
      output: base,
      unit: "pcs",
      sourceRefs: sources,
      rule: null,
      roundingMode: "ceil",
      roundingBefore: group.totalSupportedLength,
      roundingIncrement: spacing,
      roundingUnit: "m"
    }
  ];
  const warningIds: string[] = [];

  for (const route of group.routes) {
    for (const item of route.geometry) {
      if (item.kind !== "fitting") continue;
      if (item.additionalSupportRuleId === null) {
        warningIds.push(
          warnings.add({
            code: "FITTING_ADDITIONAL_SUPPORT_UNRESOLVED",
            kind: "engineering",
            severity: "engineeringReview",
            subject: { kind: "fitting", id: item.id },
            effect: "No additional fitting support was added without a resolved quantity.",
            approvalImpact: "reviewRequired",
            sourceRefs: [sourceRef("fitting", item.id), sourceRef("route", route.id)]
          })
        );
        continue;
      }
      const rule = indexes.rules.get(item.additionalSupportRuleId);
      if (rule?.type !== "fittingAdditionalSupport" || rule.fittingId !== item.id)
        throw new CalculationEngineError(
          "SEMANTIC_INPUT_INVALID",
          "Fitting support rule ownership is inconsistent."
        );
      const quantity = ExactDecimal.from(rule.quantity.value);
      traceSeeds.push({
        formulaId: "SUPPORT.EXTRA_AROUND_FITTING.V1",
        inputs: [{ name: "resolvedAdditionalSupports", value: quantity, unit: "pcs" }],
        output: quantity,
        unit: "pcs",
        sourceRefs: [sourceRef("fitting", item.id), rule.source],
        rule,
        roundingMode: "none",
        roundingBefore: null,
        roundingIncrement: null
      });
    }
    for (const adjustment of route.supports.manualAdditionalSupports) {
      const quantity = ExactDecimal.from(adjustment.additionalQuantity.value);
      warningIds.push(
        warnings.add({
          code: "MANUAL_EXTRA_SUPPORT",
          kind: "manualOverride",
          severity: "warning",
          subject: { kind: "manualSupport", id: adjustment.id },
          effect: "The explicit manual support quantity was added to the calculated support total.",
          approvalImpact: "reviewRequired",
          sourceRefs: [
            sourceRef("manualOverride", adjustment.metadata.overrideId),
            sourceRef("route", route.id)
          ],
          overrideId: adjustment.metadata.overrideId
        })
      );
      traceSeeds.push({
        formulaId: "SUPPORT.MANUAL_CORRECTION.V1",
        inputs: [
          {
            name: "originalCalculatedQuantity",
            value:
              adjustment.originalCalculatedQuantity === null
                ? ZERO
                : ExactDecimal.from(adjustment.originalCalculatedQuantity.value),
            unit: "pcs"
          },
          { name: "manualAdditionalQuantity", value: quantity, unit: "pcs" }
        ],
        output: quantity,
        unit: "pcs",
        sourceRefs: [
          sourceRef("manualOverride", adjustment.metadata.overrideId),
          sourceRef("route", route.id)
        ],
        rule: null,
        roundingMode: "none",
        roundingBefore: null,
        roundingIncrement: null
      });
    }
  }

  for (const adjustment of group.connectionAdjustments) {
    traceSeeds.push({
      formulaId: "SUPPORT.EXTRA_AT_CONNECTION.V1",
      inputs: [{ name: "connectionAdditionalSupports", value: adjustment.quantity, unit: "pcs" }],
      output: adjustment.quantity,
      unit: "pcs",
      sourceRefs: [sourceRef("connection", adjustment.connection.id)],
      rule: null,
      roundingMode: "none",
      roundingBefore: null,
      roundingIncrement: null
    });
  }

  return {
    total: sumDecimals(traceSeeds.map((seed) => seed.output)),
    traceSeeds,
    warningIds
  };
}

function templateComponentQuantity(
  group: LogicalSupportGroup,
  component: TemplateComponentV2,
  totalSupportCount: ExactDecimal,
  warnings: WarningCollector
): { readonly quantity: ExactDecimal; readonly warningIds: readonly string[] } | null {
  const base = ExactDecimal.from(component.quantity.value);
  if (component.quantityMode === "fixed") return { quantity: base, warningIds: [] };
  if (component.quantityMode === "perSupport")
    return { quantity: base.multiply(totalSupportCount), warningIds: [] };
  if (component.quantityMode === "perLevel") {
    if (group.configuration.levelCount === null) {
      warnings.add({
        code: "TEMPLATE_COMPONENT_MANUAL_VALUE_REQUIRED",
        kind: "engineering",
        severity: "blocking",
        subject: { kind: "templateComponent", id: component.id },
        effect: "The per-level component was omitted because levelCount is unresolved.",
        approvalImpact: "blocksApproval",
        sourceRefs: [component.source]
      });
      return null;
    }
    return {
      quantity: base.multiply(ExactDecimal.from(group.configuration.levelCount.value)),
      warningIds: []
    };
  }
  const manualValue = group.configuration.templateManualValues.find(
    (value) => value.componentId === component.id
  );
  if (manualValue === undefined) {
    warnings.add({
      code: "TEMPLATE_COMPONENT_MANUAL_VALUE_REQUIRED",
      kind: "engineering",
      severity: "blocking",
      subject: { kind: "templateComponent", id: component.id },
      effect: "The manual template component was omitted because no explicit value was supplied.",
      approvalImpact: "blocksApproval",
      sourceRefs: [component.source]
    });
    return null;
  }
  const warningId = warnings.add({
    code: "MANUAL_QUANTITY_OVERRIDE",
    kind: "manualOverride",
    severity: "warning",
    subject: { kind: "templateComponent", id: component.id },
    effect: "The explicit manual template-component quantity was used.",
    approvalImpact: "reviewRequired",
    sourceRefs: [component.source, sourceRef("manualOverride", manualValue.metadata.overrideId)],
    overrideId: manualValue.metadata.overrideId
  });
  return { quantity: ExactDecimal.from(manualValue.quantity.value), warningIds: [warningId] };
}

function emitTemplateComponents(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  warnings: WarningCollector,
  group: LogicalSupportGroup,
  template: AssemblyTemplateV2,
  totalSupportCount: ExactDecimal
): readonly DemandEvent[] {
  const events: DemandEvent[] = [];
  for (const component of [...template.components].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    if (
      component.role === "anchor" ||
      component.role === "wstb" ||
      (component.role === "support" && component.productId === group.configuration.supportProductId)
    )
      continue;
    const product = indexes.products.get(component.productId);
    if (product === undefined)
      throw new CalculationEngineError(
        "INTERNAL_INVARIANT_FAILED",
        "Validated template product is missing."
      );
    if (component.quantity.unit !== product.orderUnit)
      throw new CalculationEngineError(
        "SEMANTIC_INPUT_INVALID",
        "Template component unit does not match product order unit.",
        [
          {
            path: ["assemblyTemplates", template.id, "components", component.id],
            code: "TEMPLATE_UNIT_MISMATCH",
            message: product.id
          }
        ]
      );
    const calculated = templateComponentQuantity(group, component, totalSupportCount, warnings);
    if (calculated === null) continue;
    const context =
      component.role === "structure"
        ? "structure"
        : component.role === "support"
          ? "support"
          : "accessory";
    const category =
      component.role === "structure"
        ? "structure"
        : component.role === "support"
          ? "support"
          : "accessory";
    const applicationScope =
      component.quantityMode === "perSupport"
        ? totalSupportCount
        : component.quantityMode === "perLevel" && group.configuration.levelCount !== null
          ? ExactDecimal.from(group.configuration.levelCount.value)
          : ONE;
    const seed: TraceSeed = {
      formulaId: "ASSEMBLY.COMPONENT_QUANTITY.V1",
      inputs: [
        {
          name: "componentQuantity",
          value: ExactDecimal.from(component.quantity.value),
          unit: product.orderUnit
        },
        { name: "applicationScope", value: applicationScope, unit: "pcs" }
      ],
      output: calculated.quantity,
      unit: product.orderUnit,
      sourceRefs: [
        sourceRef("template", template.id),
        sourceRef("templateComponent", component.id),
        component.source
      ],
      rule: null,
      roundingMode: "none",
      roundingBefore: null,
      roundingIncrement: null
    };
    const event = eventForProduct(
      input,
      indexes,
      warnings,
      group,
      product,
      context,
      category,
      calculated.quantity,
      template.engineeringReviewRequired ? "engineeringReview" : "calculated",
      [seed],
      [],
      calculated.warningIds,
      component.suppressWhenIncluded ? "eligible" : "independent"
    );
    if (event !== null) events.push(event);
  }
  return events;
}

function anchorComponent(
  template: AssemblyTemplateV2,
  anchorProductId: string
): TemplateComponentV2 | null {
  return (
    [...template.components]
      .sort((left, right) => left.id.localeCompare(right.id))
      .find(
        (component) => component.role === "anchor" && component.productId === anchorProductId
      ) ?? null
  );
}

function emitAnchor(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  warnings: WarningCollector,
  group: LogicalSupportGroup,
  template: AssemblyTemplateV2,
  totalSupportCount: ExactDecimal
): DemandEvent | null {
  const configuration = group.configuration;
  if (configuration.substrate === null) {
    warnings.add({
      code: "MISSING_SUBSTRATE_OR_BASE",
      kind: "engineering",
      severity: "blocking",
      subject: { kind: "supportGroup", id: group.id },
      effect: "No anchor demand was created without a mounting substrate/base.",
      approvalImpact: "blocksApproval",
      templateId: template.id,
      sourceRefs: [sourceRef("supportGroup", group.id)]
    });
    failIfRequired(input, group.id, "Anchor substrate/base is missing.");
    return null;
  }
  if (configuration.substrate === "unknown") {
    warnings.add({
      code: "UNKNOWN_SUBSTRATE",
      kind: "engineering",
      severity: "blocking",
      subject: { kind: "supportGroup", id: group.id },
      effect: "No anchor demand was created for an unknown substrate.",
      approvalImpact: "blocksApproval",
      templateId: template.id,
      sourceRefs: [sourceRef("supportGroup", group.id)]
    });
    failIfRequired(input, group.id, "Anchor substrate is unknown.");
    return null;
  }
  if (configuration.anchorProductId === null) {
    warnings.add({
      code: "MISSING_ANCHOR_SELECTION",
      kind: "engineering",
      severity: "blocking",
      subject: { kind: "supportGroup", id: group.id },
      effect: "No anchor demand was created without an explicit anchor selection.",
      approvalImpact: "blocksApproval",
      templateId: template.id,
      sourceRefs: [sourceRef("supportGroup", group.id)]
    });
    failIfRequired(input, group.id, "Anchor product selection is missing.");
    return null;
  }
  const product = indexes.products.get(configuration.anchorProductId);
  if (product === undefined)
    throw new CalculationEngineError(
      "INTERNAL_INVARIANT_FAILED",
      "Validated anchor product is missing."
    );
  const component = anchorComponent(template, product.id);
  if (
    component === null ||
    component.quantityMode !== "perSupport" ||
    component.quantity.unit !== "pcs"
  ) {
    warnings.add({
      code: "ASSEMBLY_TEMPLATE_MISSING",
      kind: "engineering",
      severity: "blocking",
      subject: { kind: "supportGroup", id: group.id },
      effect: "No anchor demand was created because the template has no per-support anchor axis.",
      approvalImpact: "blocksApproval",
      productId: product.id,
      templateId: template.id,
      sourceRefs: [template.source]
    });
    failIfRequired(input, group.id, "Assembly template anchor axis is unresolved.");
    return null;
  }
  const original = ExactDecimal.from(component.quantity.value);
  const perAxis =
    configuration.anchorQuantityOverride === null
      ? original
      : ExactDecimal.from(configuration.anchorQuantityOverride.adjustedPerSupportAxis.value);
  const warningIds: string[] = [];
  if (configuration.anchorQuantityOverride !== null) {
    warningIds.push(
      warnings.add({
        code: "MANUAL_ANCHOR_OVERRIDE",
        kind: "manualOverride",
        severity: "warning",
        subject: { kind: "supportGroup", id: group.id },
        effect:
          "The manual anchors-per-support-axis value replaced the template value before multiplication.",
        approvalImpact: "reviewRequired",
        productId: product.id,
        templateId: template.id,
        sourceRefs: [
          component.source,
          sourceRef("manualOverride", configuration.anchorQuantityOverride.metadata.overrideId)
        ],
        overrideId: configuration.anchorQuantityOverride.metadata.overrideId
      })
    );
  }
  if (product.engineeringReviewRequired || template.engineeringReviewRequired) {
    warningIds.push(
      warnings.add({
        code: "ANCHOR_ENGINEERING_CHECK_REQUIRED",
        kind: "engineering",
        severity: "engineeringReview",
        subject: { kind: "product", id: product.id },
        effect:
          "The exact quantity is calculated, but anchor capacity and suitability require engineering review.",
        approvalImpact: "reviewRequired",
        productId: product.id,
        templateId: template.id,
        sourceRefs: [product.source, template.source]
      })
    );
  }
  const quantity = totalSupportCount.multiply(perAxis);
  return eventForProduct(
    input,
    indexes,
    warnings,
    group,
    product,
    "anchor",
    "anchor",
    quantity,
    product.engineeringReviewRequired || template.engineeringReviewRequired
      ? "engineeringReview"
      : "calculated",
    [
      {
        formulaId: "ANCHOR.PER_SUPPORT_AXIS.V1",
        inputs: [
          { name: "totalSupportCount", value: totalSupportCount, unit: "pcs" },
          { name: "originalAnchorsPerSupportAxis", value: original, unit: "pcs" },
          { name: "appliedAnchorsPerSupportAxis", value: perAxis, unit: "pcs" }
        ],
        output: quantity,
        unit: "pcs",
        sourceRefs: [
          sourceRef("supportGroup", group.id),
          sourceRef("templateComponent", component.id),
          component.source
        ],
        rule: null,
        roundingMode: "none",
        roundingBefore: null,
        roundingIncrement: null
      }
    ],
    [],
    warningIds
  );
}

function emitWstb(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  warnings: WarningCollector,
  group: LogicalSupportGroup,
  template: AssemblyTemplateV2,
  totalSupportCount: ExactDecimal
): DemandEvent | null {
  const configuration = group.configuration;
  if (configuration.wstbProductId === null) return null;
  const product = indexes.products.get(configuration.wstbProductId);
  const rule = indexes.rules.get(configuration.wstb.ruleId);
  if (product === undefined || rule?.type !== "wstbPerSupport")
    throw new CalculationEngineError(
      "INTERNAL_INVARIANT_FAILED",
      "Validated WSTB input is missing."
    );
  const quantityPerSupport =
    configuration.wstb.mode === "one"
      ? ExactDecimal.from("1")
      : configuration.wstb.mode === "two"
        ? ExactDecimal.from("2")
        : ExactDecimal.from(configuration.wstb.quantityPerSupport);
  if (
    (configuration.wstb.mode === "one" && rule.quantityPerSupport.value !== "1") ||
    (configuration.wstb.mode === "two" && rule.quantityPerSupport.value !== "2")
  )
    throw new CalculationEngineError(
      "SEMANTIC_INPUT_INVALID",
      "WSTB mode and resolved rule quantity disagree."
    );
  const warningIds = [
    warnings.add({
      code: "WSTB_PROJECT_RULE_UNCONFIRMED",
      kind: "projectRule",
      severity: "engineeringReview",
      subject: { kind: "supportGroup", id: group.id },
      effect: "The WSTB quantity remains an unconfirmed project rule.",
      approvalImpact: "reviewRequired",
      ruleId: rule.id,
      productId: product.id,
      sourceRefs: [rule.source, product.source]
    })
  ];
  if (configuration.wstb.mode === "custom") {
    warningIds.push(
      warnings.add({
        code: "MANUAL_QUANTITY_OVERRIDE",
        kind: "manualOverride",
        severity: "warning",
        subject: { kind: "supportGroup", id: group.id },
        effect: "The custom WSTB quantity per support was used.",
        approvalImpact: "reviewRequired",
        ruleId: rule.id,
        productId: product.id,
        sourceRefs: [sourceRef("manualOverride", configuration.wstb.metadata.overrideId)],
        overrideId: configuration.wstb.metadata.overrideId
      })
    );
  }
  for (const component of template.components.filter((candidate) => candidate.role === "wstb")) {
    if (
      component.productId !== product.id ||
      component.quantityMode !== "perSupport" ||
      component.quantity.value !== quantityPerSupport.toCanonical()
    ) {
      warningIds.push(
        warnings.add({
          code: "WSTB_TEMPLATE_RULE_CONFLICT",
          kind: "engineering",
          severity: "engineeringReview",
          subject: { kind: "templateComponent", id: component.id },
          effect:
            "The dedicated WSTB rule retained quantity ownership; the template value was not added.",
          approvalImpact: "reviewRequired",
          ruleId: rule.id,
          productId: product.id,
          templateId: template.id,
          sourceRefs: [component.source, rule.source]
        })
      );
    }
  }
  const quantity = totalSupportCount.multiply(quantityPerSupport);
  return eventForProduct(
    input,
    indexes,
    warnings,
    group,
    product,
    "wstb",
    "wstb",
    quantity,
    "projectRule",
    [
      {
        formulaId: "WSTB.PER_SUPPORT.V1",
        inputs: [
          { name: "totalSupportCount", value: totalSupportCount, unit: "pcs" },
          { name: "quantityPerSupport", value: quantityPerSupport, unit: "pcs" }
        ],
        output: quantity,
        unit: "pcs",
        sourceRefs: [sourceRef("supportGroup", group.id), rule.source],
        rule,
        roundingMode: "none",
        roundingBefore: null,
        roundingIncrement: null
      }
    ],
    [rule.id],
    warningIds
  );
}

export function emitSupportDemands(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  warnings: WarningCollector,
  groups: readonly LogicalSupportGroup[]
): readonly DemandEvent[] {
  const events: DemandEvent[] = [];
  for (const group of groups) {
    const count = calculateSupportCount(group, indexes, warnings);
    const configuration = group.configuration;
    if (configuration.supportProductId !== null) {
      const supportProduct = indexes.products.get(configuration.supportProductId);
      if (supportProduct === undefined)
        throw new CalculationEngineError(
          "INTERNAL_INVARIANT_FAILED",
          "Validated support product is missing."
        );
      const supportEvent = eventForProduct(
        input,
        indexes,
        warnings,
        group,
        supportProduct,
        "support",
        "support",
        count.total,
        "calculated",
        count.traceSeeds,
        count.traceSeeds.flatMap((seed) => (seed.rule === null ? [] : [seed.rule.id])),
        count.warningIds
      );
      if (supportEvent !== null) events.push(supportEvent);
    }
    if (configuration.templateId === null) {
      warnings.add({
        code: "ASSEMBLY_TEMPLATE_MISSING",
        kind: "engineering",
        severity: "blocking",
        subject: { kind: "supportGroup", id: group.id },
        effect: "Template components, anchors, and template-bound materials were omitted.",
        approvalImpact: "blocksApproval",
        sourceRefs: [sourceRef("supportGroup", group.id)]
      });
      failIfRequired(input, group.id, "Assembly template is missing.");
      continue;
    }
    const template = indexes.templates.get(configuration.templateId);
    if (template === undefined)
      throw new CalculationEngineError(
        "INTERNAL_INVARIANT_FAILED",
        "Validated template is missing."
      );
    events.push(...emitTemplateComponents(input, indexes, warnings, group, template, count.total));
    const anchor = emitAnchor(input, indexes, warnings, group, template, count.total);
    if (anchor !== null) events.push(anchor);
    const wstb = emitWstb(input, indexes, warnings, group, template, count.total);
    if (wstb !== null) events.push(wstb);
  }
  return events;
}
