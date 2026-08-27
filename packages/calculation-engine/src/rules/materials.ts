import type {
  CalculationInputV2,
  CalculationRuleV2,
  ProductSnapshotV2,
  SourceReferenceV2
} from "@niedax/domain";

import { ExactDecimal, ONE, ZERO, sumDecimals } from "../arithmetic/decimal.js";
import { CalculationEngineError } from "../errors.js";
import type { DemandEvent, TraceSeed } from "../model/demand-event.js";
import type { CalculationIndexes } from "../model/indexes.js";
import { sourceRef, uniqueSourceRefs } from "../model/source.js";
import { stableId } from "../stable/ids.js";
import type { StraightRun } from "../topology/straight-runs.js";
import { failIfRequired, requireCompatibleProduct } from "./compatibility.js";
import { resolvePolicies } from "./policies.js";
import type { WarningCollector } from "./warnings.js";

function countProductEvent(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  warnings: WarningCollector,
  product: ProductSnapshotV2,
  category: DemandEvent["category"],
  context: "fitting" | "connection" | "endpoint" | "accessory",
  subjectKind: string,
  subjectId: string,
  quantity: ExactDecimal,
  status: DemandEvent["status"],
  sourceRefs: readonly SourceReferenceV2[],
  rule: CalculationRuleV2 | null,
  traceSeeds: readonly TraceSeed[],
  warningIds: readonly string[] = []
): DemandEvent | null {
  if (product.orderUnit !== "pcs")
    throw new CalculationEngineError(
      "SEMANTIC_INPUT_INVALID",
      "Count material must use pcs as its order unit."
    );
  const compatibility =
    rule === null
      ? requireCompatibleProduct(
          input,
          indexes,
          warnings,
          product,
          context,
          subjectKind,
          subjectId,
          sourceRefs
        )
      : { compatible: product.active && product.orderable, warningIds: [] as readonly string[] };
  if (!compatibility.compatible) {
    failIfRequired(input, subjectId, `Resolved ${context} product is not orderable or compatible.`);
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
    id: stableId("demand", [category, subjectId, product.id, rule?.id ?? "selection"]),
    product,
    manualInputId: null,
    manualProductCode: null,
    manualDescription: null,
    category,
    quantity,
    unit: "pcs",
    supplyOptionId: null,
    sectionLength: null,
    sectionCount: null,
    reservePolicy: policies.reserve,
    packagingPolicy: policies.packaging,
    overrideBoundary: policies.overrideBoundary,
    status,
    inclusionSuppression: "independent",
    sourceRefs: uniqueSourceRefs([...sourceRefs, product.source]),
    ruleIds: rule === null ? [] : [rule.id],
    warningIds: [...warningIds, ...compatibility.warningIds],
    traceSeeds
  };
}

export function emitJointDemands(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  warnings: WarningCollector,
  runs: readonly StraightRun[]
): readonly DemandEvent[] {
  const events: DemandEvent[] = [];
  for (const run of runs) {
    const jointCount = run.sectionCount.compare(ONE) > 0 ? run.sectionCount.subtract(ONE) : ZERO;
    if (jointCount.isZero()) continue;
    const rules = [...indexes.rules.values()].filter(
      (rule) =>
        rule.type === "internalJoint" &&
        rule.straightProductId === run.productId &&
        (rule.supplyOptionId === null ||
          (run.supplyOptionIds.length === 1 && rule.supplyOptionId === run.supplyOptionIds[0]))
    );
    if (rules.length !== 1) {
      warnings.add({
        code: "UNRESOLVED_JOINT_PRODUCT",
        kind: "catalog",
        severity: "blocking",
        subject: { kind: "straightRun", id: run.id },
        effect: "No joint order demand was created without one unambiguous compatible joint rule.",
        approvalImpact: "blocksApproval",
        sourceRefs: run.segmentIds.map((id) => sourceRef("segment", id))
      });
      failIfRequired(input, run.id, "Internal joint product is unresolved.");
      continue;
    }
    const rule = rules[0];
    if (rule?.type !== "internalJoint") continue;
    const product = indexes.products.get(rule.jointProductId);
    if (product === undefined)
      throw new CalculationEngineError(
        "INTERNAL_INVARIANT_FAILED",
        "Validated joint product is missing."
      );
    const quantity = jointCount.multiply(ExactDecimal.from(rule.quantityPerJoint.value));
    const sources = uniqueSourceRefs([
      sourceRef("straightRun", run.id),
      ...run.segmentIds.map((id) => sourceRef("segment", id)),
      rule.source
    ]);
    const event = countProductEvent(
      input,
      indexes,
      warnings,
      product,
      "connector",
      "connection",
      "straightRun",
      run.id,
      quantity,
      rule.confidence,
      sources,
      rule,
      [
        {
          formulaId: "JOINT.INTERNAL_STRAIGHT_RUN.V1",
          inputs: [
            { name: "sectionCount", value: run.sectionCount, unit: "pcs" },
            {
              name: "quantityPerJoint",
              value: ExactDecimal.from(rule.quantityPerJoint.value),
              unit: "pcs"
            }
          ],
          output: quantity,
          unit: "pcs",
          sourceRefs: sources,
          rule,
          roundingMode: "none",
          roundingBefore: null,
          roundingIncrement: null
        }
      ]
    );
    if (event !== null) events.push(event);
  }
  return events;
}

function emitRuleComponents(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  warnings: WarningCollector,
  rule: Extract<CalculationRuleV2, { readonly type: "fittingConnection" | "physicalConnection" }>,
  subjectKind: "fitting" | "connection",
  subjectId: string,
  corrections: readonly {
    readonly id: string;
    readonly productId: string;
    readonly originalCalculatedQuantity: { readonly value: string; readonly unit: "pcs" };
    readonly adjustedQuantity: { readonly value: string; readonly unit: "pcs" };
    readonly metadata: {
      readonly overrideId: string;
      readonly reason: string;
      readonly note: string | null;
      readonly actorRef: string;
      readonly decisionRef: string;
    };
  }[] = []
): readonly DemandEvent[] {
  const componentGroups = new Map<string, typeof rule.components>();
  for (const component of rule.components) {
    const values = componentGroups.get(component.productId) ?? [];
    componentGroups.set(component.productId, [...values, component]);
  }
  const events: DemandEvent[] = [];
  for (const [productId, components] of [...componentGroups.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const product = indexes.products.get(productId);
    if (product === undefined)
      throw new CalculationEngineError(
        "INTERNAL_INVARIANT_FAILED",
        "Validated connection product is missing."
      );
    const original = sumDecimals(
      components.map((component) =>
        ExactDecimal.from(component.quantityPerEvent.value).multiply(
          ExactDecimal.from(component.portOrSideCount)
        )
      )
    );
    const correction = corrections.find((candidate) => candidate.productId === productId);
    if (
      correction !== undefined &&
      ExactDecimal.from(correction.originalCalculatedQuantity.value).compare(original) !== 0
    )
      throw new CalculationEngineError(
        "SEMANTIC_INPUT_INVALID",
        "Connector correction original quantity does not match the resolved rule."
      );
    const quantity =
      correction === undefined ? original : ExactDecimal.from(correction.adjustedQuantity.value);
    const warningIds: string[] = [];
    const sources = uniqueSourceRefs([sourceRef(subjectKind, subjectId), rule.source]);
    const baseSeed: TraceSeed = {
      formulaId: "CONNECTION.FITTING_SPECIFIC.V1",
      inputs: components.flatMap((component) => [
        {
          name: "quantityPerEvent",
          value: ExactDecimal.from(component.quantityPerEvent.value),
          unit: "pcs" as const
        },
        {
          name: "portOrSideCount",
          value: ExactDecimal.from(component.portOrSideCount),
          unit: "pcs" as const
        }
      ]),
      output: original,
      unit: "pcs",
      sourceRefs: sources,
      rule,
      roundingMode: "none",
      roundingBefore: null,
      roundingIncrement: null,
      contributesToDemand: correction === undefined
    };
    const seeds: TraceSeed[] = [baseSeed];
    if (correction !== undefined) {
      warningIds.push(
        warnings.add({
          code: "MANUAL_QUANTITY_OVERRIDE",
          kind: "manualOverride",
          severity: "warning",
          subject: { kind: subjectKind, id: subjectId },
          effect: "The manual connector correction replaced the resolved connector quantity.",
          approvalImpact: "reviewRequired",
          ruleId: rule.id,
          productId,
          sourceRefs: [sourceRef("manualOverride", correction.metadata.overrideId), ...sources],
          overrideId: correction.metadata.overrideId
        })
      );
      seeds.push({
        formulaId: "MANUAL.QUANTITY_OVERRIDE.V1",
        inputs: [
          { name: "originalCalculatedQuantity", value: original, unit: "pcs" },
          { name: "adjustedQuantity", value: quantity, unit: "pcs" }
        ],
        output: quantity,
        unit: "pcs",
        sourceRefs: [sourceRef("manualOverride", correction.metadata.overrideId), ...sources],
        rule,
        roundingMode: "none",
        roundingBefore: null,
        roundingIncrement: null,
        parentSeedIndexes: [0]
      });
    }
    const event = countProductEvent(
      input,
      indexes,
      warnings,
      product,
      "connector",
      subjectKind === "fitting" ? "fitting" : "connection",
      subjectKind,
      subjectId,
      quantity,
      correction === undefined ? rule.confidence : "manual",
      sources,
      rule,
      seeds,
      warningIds
    );
    if (event !== null) events.push(event);
  }
  return events;
}

export function emitFittingAndConnectionDemands(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  warnings: WarningCollector
): readonly DemandEvent[] {
  const events: DemandEvent[] = [];
  for (const route of [...input.project.routes].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    for (const item of route.geometry) {
      if (item.kind !== "fitting") continue;
      if (item.productId !== null) {
        const product = indexes.products.get(item.productId);
        if (product === undefined)
          throw new CalculationEngineError(
            "INTERNAL_INVARIANT_FAILED",
            "Validated fitting product is missing."
          );
        const sources = [
          sourceRef("route", route.id),
          sourceRef("fitting", item.id),
          product.source
        ];
        const fittingEvent = countProductEvent(
          input,
          indexes,
          warnings,
          product,
          "fitting",
          "fitting",
          "fitting",
          item.id,
          ONE,
          "catalogConfirmed",
          sources,
          null,
          [
            {
              formulaId: "CONNECTION.FITTING_SPECIFIC.V1",
              inputs: [{ name: "orderableFittingEvent", value: ONE, unit: "pcs" }],
              output: ONE,
              unit: "pcs",
              sourceRefs: sources,
              rule: null,
              roundingMode: "none",
              roundingBefore: null,
              roundingIncrement: null
            }
          ]
        );
        if (fittingEvent !== null) events.push(fittingEvent);
      }
      if (item.connectionRuleId === null) {
        warnings.add({
          code: "UNRESOLVED_FITTING_CONNECTION",
          kind: "catalog",
          severity: "blocking",
          subject: { kind: "fitting", id: item.id },
          effect: "No fitting-port connector demand was created without a resolved rule.",
          approvalImpact: "blocksApproval",
          sourceRefs: [sourceRef("fitting", item.id)]
        });
        failIfRequired(input, item.id, "Fitting connection materials are unresolved.");
        continue;
      }
      const rule = indexes.rules.get(item.connectionRuleId);
      if (rule?.type !== "fittingConnection" || rule.fittingId !== item.id)
        throw new CalculationEngineError(
          "SEMANTIC_INPUT_INVALID",
          "Fitting connection rule ownership is inconsistent."
        );
      events.push(...emitRuleComponents(input, indexes, warnings, rule, "fitting", item.id));
    }
  }

  for (const connection of [...input.project.connections].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    if (connection.type === "logicalContinuation") continue;
    if (connection.materialRuleId === null) {
      warnings.add({
        code: "UNRESOLVED_FITTING_CONNECTION",
        kind: "catalog",
        severity: "blocking",
        subject: { kind: "connection", id: connection.id },
        effect: "No physical-connection material was added without a resolved rule.",
        approvalImpact: "blocksApproval",
        sourceRefs: [sourceRef("connection", connection.id)]
      });
      failIfRequired(input, connection.id, "Physical connection material is unresolved.");
      continue;
    }
    const rule = indexes.rules.get(connection.materialRuleId);
    if (rule?.type !== "physicalConnection" || rule.connectionId !== connection.id)
      throw new CalculationEngineError(
        "SEMANTIC_INPUT_INVALID",
        "Physical connection rule ownership is inconsistent."
      );
    events.push(
      ...emitRuleComponents(
        input,
        indexes,
        warnings,
        rule,
        "connection",
        connection.id,
        connection.connectorCorrections
      )
    );
  }
  return events;
}

export function emitEndpointAndAccessoryDemands(
  input: CalculationInputV2,
  indexes: CalculationIndexes,
  warnings: WarningCollector
): readonly DemandEvent[] {
  const events: DemandEvent[] = [];
  for (const route of [...input.project.routes].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    for (const endpoint of [route.startEndpoint, route.endEndpoint]) {
      if (
        endpoint.connectionId !== null ||
        endpoint.type === "freeEnd" ||
        endpoint.type === "routeContinuation" ||
        endpoint.type === "custom"
      )
        continue;
      if (endpoint.materialRuleId === null) {
        warnings.add({
          code: "UNRESOLVED_ENDPOINT_MATERIAL",
          kind: "catalog",
          severity: "blocking",
          subject: { kind: "endpoint", id: endpoint.id },
          effect: "No endpoint product was fabricated or substituted.",
          approvalImpact: "blocksApproval",
          sourceRefs: [sourceRef("endpoint", endpoint.id), sourceRef("route", route.id)]
        });
        failIfRequired(input, endpoint.id, "Endpoint material is unresolved.");
        continue;
      }
      const rule = indexes.rules.get(endpoint.materialRuleId);
      if (rule?.type !== "endpointMaterial" || rule.endpointId !== endpoint.id)
        throw new CalculationEngineError(
          "SEMANTIC_INPUT_INVALID",
          "Endpoint material rule ownership is inconsistent."
        );
      const product = indexes.products.get(rule.productId);
      if (product === undefined)
        throw new CalculationEngineError(
          "INTERNAL_INVARIANT_FAILED",
          "Validated endpoint product is missing."
        );
      const quantity = ExactDecimal.from(rule.quantity.value);
      const sources = [
        sourceRef("endpoint", endpoint.id),
        sourceRef("route", route.id),
        rule.source
      ];
      const event = countProductEvent(
        input,
        indexes,
        warnings,
        product,
        "endpointMaterial",
        "endpoint",
        "endpoint",
        endpoint.id,
        quantity,
        rule.confidence,
        sources,
        rule,
        [
          {
            formulaId: "ENDPOINT.MATERIAL.V1",
            inputs: [{ name: "resolvedEndpointQuantity", value: quantity, unit: "pcs" }],
            output: quantity,
            unit: "pcs",
            sourceRefs: sources,
            rule,
            roundingMode: "none",
            roundingBefore: null,
            roundingIncrement: null
          }
        ]
      );
      if (event !== null) events.push(event);
    }
  }
  for (const productId of [...input.project.accessoryProductIds].sort()) {
    const product = indexes.products.get(productId);
    if (product === undefined)
      throw new CalculationEngineError(
        "INTERNAL_INVARIANT_FAILED",
        "Validated accessory product is missing."
      );
    const sources = [sourceRef("project", input.project.id), product.source];
    const event = countProductEvent(
      input,
      indexes,
      warnings,
      product,
      "accessory",
      "accessory",
      "project",
      input.project.id,
      ONE,
      "catalogConfirmed",
      sources,
      null,
      [
        {
          formulaId: "MANUAL.ITEM.V1",
          inputs: [{ name: "selectedAccessory", value: ONE, unit: "pcs" }],
          output: ONE,
          unit: "pcs",
          sourceRefs: sources,
          rule: null,
          roundingMode: "none",
          roundingBefore: null,
          roundingIncrement: null
        }
      ]
    );
    if (event !== null) events.push(event);
  }
  return events;
}
