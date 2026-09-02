import type {
  CalculationDraftV2,
  ProjectAccessV2,
  SaveProjectRevisionRequestV2
} from "@niedax/domain";

import { contentSignature } from "./autosave-state";

export type SaveRevisionInput = Omit<SaveProjectRevisionRequestV2, "schemaVersion">;

export interface RetryKey {
  readonly signature: string;
  readonly idempotencyKey: string;
}

export interface RevisionCalculationEvidence {
  readonly run: Pick<CalculationDraftV2["run"], "id" | "inputFingerprint">;
}

export function optionalComment(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function buildSaveRevisionInput(
  calculation: RevisionCalculationEvidence,
  expectedDraftVersion: number,
  expectedLatestRevisionNumber: number,
  name: string,
  comment: string
): SaveRevisionInput {
  return {
    expectedDraftVersion,
    expectedLatestRevisionNumber,
    calculationRunId: calculation.run.id,
    inputFingerprint: calculation.run.inputFingerprint,
    name: name.trim(),
    comment: optionalComment(comment)
  };
}

export function retryKeyFor(
  previous: RetryKey | null,
  payload: unknown,
  generate: () => string
): RetryKey {
  const signature = contentSignature(payload);
  return previous?.signature === signature ? previous : { signature, idempotencyKey: generate() };
}

export function canSaveRevision(
  access: ProjectAccessV2,
  calculation: RevisionCalculationEvidence | null,
  calculationStale: boolean,
  name: string
): boolean {
  return (
    access.canSaveRevision &&
    calculation !== null &&
    !calculationStale &&
    name.trim().length > 0 &&
    name.trim().length <= 500
  );
}

export function mergeRevisionSummary<T extends Readonly<{ id: string; revisionNumber: number }>>(
  revisions: readonly T[],
  revision: T
): readonly T[] {
  return [revision, ...revisions.filter((candidate) => candidate.id !== revision.id)].sort(
    (left, right) => right.revisionNumber - left.revisionNumber
  );
}

export interface RevisionViewState<TDraft> {
  readonly draft: TDraft;
  readonly selectedRevisionId: string | null;
}

export function selectHistoricalRevision<TDraft>(
  state: RevisionViewState<TDraft>,
  selectedRevisionId: string | null
): RevisionViewState<TDraft> {
  return { ...state, selectedRevisionId };
}
