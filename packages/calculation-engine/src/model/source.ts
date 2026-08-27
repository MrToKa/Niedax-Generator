import type { SourceReferenceV2 } from "@niedax/domain";

export function sourceRef(
  kind: SourceReferenceV2["kind"],
  id: string,
  sourceDocument: string | null = null,
  sourcePage: string | null = null
): SourceReferenceV2 {
  return { kind, id, sourceDocument, sourcePage };
}

export function uniqueSourceRefs(
  values: readonly SourceReferenceV2[]
): readonly SourceReferenceV2[] {
  const unique = new Map<string, SourceReferenceV2>();
  for (const value of values) {
    const key = `${value.kind}|${value.id}|${value.sourceDocument ?? ""}|${value.sourcePage ?? ""}`;
    unique.set(key, value);
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.id.localeCompare(right.id) ||
      (left.sourceDocument ?? "").localeCompare(right.sourceDocument ?? "") ||
      (left.sourcePage ?? "").localeCompare(right.sourcePage ?? "")
  );
}
