import type {
  CalculationRun,
  CalculationResultV1,
  Project,
  ProjectCalculationData,
  RevisionV1,
  SnapshotReference
} from "@niedax/domain";

export interface ProjectDraftRecord {
  readonly project: Project;
  readonly calculationData: ProjectCalculationData;
}

export interface ProjectRepository {
  findDraft(projectId: string): Promise<ProjectDraftRecord | null>;
  saveDraft(draft: ProjectDraftRecord, expectedDraftVersion: number | null): Promise<void>;
}

export interface CalculationRunRepository {
  findById(runId: string): Promise<CalculationRun | null>;
  findResult(runId: string): Promise<CalculationResultV1 | null>;
  saveTransient(run: CalculationRun, result: CalculationResultV1): Promise<void>;
}

export interface RevisionRepository {
  findById(revisionId: string): Promise<RevisionV1 | null>;
  findByIdempotencyKey(projectId: string, idempotencyKey: string): Promise<RevisionV1 | null>;
  save(revision: RevisionV1, expectedLatestRevisionNumber: number): Promise<void>;
}

export interface SnapshotRepository {
  findActiveCatalogSnapshot(): Promise<SnapshotReference | null>;
  findActiveRuleSnapshot(): Promise<SnapshotReference | null>;
  activateCatalog(
    snapshot: SnapshotReference,
    expectedActiveSnapshotId: string | null
  ): Promise<void>;
  activateRules(
    snapshot: SnapshotReference,
    expectedActiveSnapshotId: string | null
  ): Promise<void>;
}

export interface TransactionManager {
  inTransaction<T>(operation: () => Promise<T>): Promise<T>;
}
