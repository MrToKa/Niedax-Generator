import type {
  CalculationInputV2,
  ConnectionV2,
  RouteV2,
  SupportConfigurationV2
} from "@niedax/domain";

import { ExactDecimal, sumDecimals } from "../arithmetic/decimal.js";
import { CalculationEngineError } from "../errors.js";
import { sourceRef } from "../model/source.js";
import { stableId, stableKey } from "../stable/ids.js";
import type { WarningCollector } from "../rules/warnings.js";

export interface LogicalSupportGroup {
  readonly id: string;
  readonly routeIds: readonly string[];
  readonly routes: readonly RouteV2[];
  readonly configuration: SupportConfigurationV2;
  readonly totalSupportedLength: ExactDecimal;
  readonly connectionAdjustments: readonly {
    readonly connection: ConnectionV2;
    readonly quantity: ExactDecimal;
  }[];
}

function supportConfigurationKey(configuration: SupportConfigurationV2): string {
  return stableKey([
    configuration.spacing.value,
    configuration.supportType,
    configuration.supportProductId ?? "none",
    configuration.templateId ?? "none",
    configuration.levelCount?.value ?? "none",
    configuration.substrate ?? "none",
    configuration.anchorProductId ?? "none",
    configuration.anchorQuantityOverride?.adjustedPerSupportAxis.value ?? "template",
    configuration.wstbProductId ?? "none",
    configuration.wstb.mode,
    configuration.wstb.mode === "custom" ? configuration.wstb.quantityPerSupport : "default"
  ]);
}

class DisjointSet {
  readonly #parent = new Map<string, string>();

  public constructor(ids: readonly string[]) {
    for (const id of ids) this.#parent.set(id, id);
  }

  public find(id: string): string {
    const parent = this.#parent.get(id);
    if (parent === undefined) throw new Error("UNKNOWN_DISJOINT_SET_ID");
    if (parent === id) return id;
    const root = this.find(parent);
    this.#parent.set(id, root);
    return root;
  }

  public union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    if (leftRoot.localeCompare(rightRoot) < 0) this.#parent.set(rightRoot, leftRoot);
    else this.#parent.set(leftRoot, rightRoot);
  }
}

function routeLength(route: RouteV2): ExactDecimal {
  return sumDecimals(
    route.geometry.map((item) =>
      item.kind === "straight"
        ? ExactDecimal.from(item.length.value)
        : item.supportedPhysicalLength === null
          ? ExactDecimal.from("0")
          : ExactDecimal.from(item.supportedPhysicalLength.value)
    )
  );
}

export function buildLogicalSupportGroups(
  input: CalculationInputV2,
  warnings: WarningCollector
): readonly LogicalSupportGroup[] {
  const routes = [...input.project.routes].sort((left, right) => left.id.localeCompare(right.id));
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const disjoint = new DisjointSet(routes.map((route) => route.id));

  for (const connection of [...input.project.connections].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    if (
      connection.type !== "logicalContinuation" ||
      connection.physicalBreak ||
      connection.supportBehavior !== "shared"
    )
      continue;
    const participantRoutes = connection.participants
      .map((participant) => routeById.get(participant.routeId))
      .filter((route): route is RouteV2 => route !== undefined);
    const keys = new Set(participantRoutes.map((route) => supportConfigurationKey(route.supports)));
    if (keys.size !== 1) {
      if (input.options.supportMismatchPolicy === "fail") {
        throw new CalculationEngineError(
          "SUPPORT_CONFIGURATION_MISMATCH",
          "Logical continuation has incompatible support configurations.",
          [
            {
              path: ["project", "connections", connection.id],
              code: "SUPPORT_CONFIGURATION_MISMATCH",
              message: connection.id
            }
          ]
        );
      }
      warnings.add({
        code: "SUPPORT_CONFIGURATION_MISMATCH",
        kind: "engineering",
        severity: "engineeringReview",
        subject: { kind: "connection", id: connection.id },
        effect:
          "Routes were split into independent support groups; continuous support calculation was not claimed.",
        approvalImpact: "reviewRequired",
        sourceRefs: [sourceRef("connection", connection.id)]
      });
      continue;
    }
    const first = participantRoutes[0];
    if (first === undefined) continue;
    for (const route of participantRoutes.slice(1)) disjoint.union(first.id, route.id);
  }

  const grouped = new Map<string, RouteV2[]>();
  for (const route of routes) {
    const root = disjoint.find(route.id);
    const members = grouped.get(root) ?? [];
    members.push(route);
    grouped.set(root, members);
  }

  const routeGroup = new Map<string, string>();
  for (const [root, members] of grouped)
    for (const route of members) routeGroup.set(route.id, root);
  const connectionAdjustments = new Map<
    string,
    { connection: ConnectionV2; quantity: ExactDecimal }[]
  >();
  for (const connection of [...input.project.connections].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    const firstParticipant = connection.participants[0];
    const secondParticipant = connection.participants[1];
    if (firstParticipant !== undefined) {
      const group = routeGroup.get(firstParticipant.routeId);
      if (group !== undefined && connection.supportsBefore.value !== "0") {
        const values = connectionAdjustments.get(group) ?? [];
        values.push({ connection, quantity: ExactDecimal.from(connection.supportsBefore.value) });
        connectionAdjustments.set(group, values);
      }
    }
    if (secondParticipant !== undefined) {
      const group = routeGroup.get(secondParticipant.routeId);
      if (group !== undefined && connection.supportsAfter.value !== "0") {
        const values = connectionAdjustments.get(group) ?? [];
        values.push({ connection, quantity: ExactDecimal.from(connection.supportsAfter.value) });
        connectionAdjustments.set(group, values);
      }
    }
  }

  return [...grouped.entries()]
    .map(([root, members]) => {
      const sortedMembers = [...members].sort((left, right) => left.id.localeCompare(right.id));
      const routeIds = sortedMembers.map((route) => route.id);
      return {
        id: stableId("support-group", routeIds),
        routeIds,
        routes: sortedMembers,
        configuration:
          sortedMembers[0]?.supports ??
          (() => {
            throw new Error("EMPTY_SUPPORT_GROUP");
          })(),
        totalSupportedLength: sumDecimals(sortedMembers.map(routeLength)),
        connectionAdjustments: connectionAdjustments.get(root) ?? []
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
