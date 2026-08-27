import type { CalculationInputV2 } from "@niedax/domain";

import { sumDecimals } from "../arithmetic/decimal.js";
import type { SectionSegmentResult } from "../rules/sections.js";
import { stableId } from "../stable/ids.js";

export interface StraightRun {
  readonly id: string;
  readonly productId: string;
  readonly supplyOptionIds: readonly string[];
  readonly segmentIds: readonly string[];
  readonly sectionCount: ReturnType<typeof sumDecimals>;
}

class DisjointSet {
  readonly #parent = new Map<string, string>();
  public constructor(ids: readonly string[]) {
    for (const id of ids) this.#parent.set(id, id);
  }
  public find(id: string): string {
    const parent = this.#parent.get(id);
    if (parent === undefined) throw new Error("UNKNOWN_STRAIGHT_SEGMENT");
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

export function buildStraightRuns(
  input: CalculationInputV2,
  segments: readonly SectionSegmentResult[]
): readonly StraightRun[] {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const set = new DisjointSet(segments.map((segment) => segment.id));
  for (const route of input.project.routes) {
    for (let index = 1; index < route.geometry.length; index += 1) {
      const previous = route.geometry[index - 1];
      const current = route.geometry[index];
      if (previous?.kind !== "straight" || current?.kind !== "straight") continue;
      const left = byId.get(previous.id);
      const right = byId.get(current.id);
      if (left !== undefined && right !== undefined && left.productId === right.productId)
        set.union(left.id, right.id);
    }
  }
  const routeById = new Map(input.project.routes.map((route) => [route.id, route]));
  for (const connection of input.project.connections) {
    if (connection.type !== "logicalContinuation" || connection.physicalBreak) continue;
    const boundarySegments = connection.participants.map((participant) => {
      const route = routeById.get(participant.routeId);
      if (route === undefined) return undefined;
      const atStart = route.startEndpoint.id === participant.endpointId;
      const item = atStart ? route.geometry[0] : route.geometry[route.geometry.length - 1];
      return item?.kind === "straight" ? byId.get(item.id) : undefined;
    });
    const first = boundarySegments[0];
    if (first === undefined) continue;
    for (const segment of boundarySegments.slice(1))
      if (segment !== undefined && segment.productId === first.productId)
        set.union(first.id, segment.id);
  }
  const grouped = new Map<string, SectionSegmentResult[]>();
  for (const segment of segments) {
    const root = set.find(segment.id);
    const members = grouped.get(root) ?? [];
    members.push(segment);
    grouped.set(root, members);
  }
  return [...grouped.values()]
    .map((members) => {
      const sorted = [...members].sort((left, right) => left.id.localeCompare(right.id));
      const segmentIds = sorted.map((segment) => segment.id);
      return {
        id: stableId("straight-run", segmentIds),
        productId: sorted[0]?.productId ?? "invalid",
        supplyOptionIds: [...new Set(sorted.map((segment) => segment.supplyOptionId))].sort(),
        segmentIds,
        sectionCount: sumDecimals(sorted.map((segment) => segment.sectionCount))
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
