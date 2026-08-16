export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  readonly correlationId: string;
  readonly operation: string;
  readonly actorId: string | null;
  readonly projectId: string | null;
  readonly revisionId: string | null;
}

export interface StructuredLogger {
  log(
    level: LogLevel,
    event: string,
    context: LogContext,
    attributes: StructuredLogAttributes
  ): void;
}

export interface StructuredLogAttributes {
  readonly outcome?: "succeeded" | "rejected" | "failed";
  readonly durationMs?: number;
  readonly errorCode?: string;
  readonly calculationRunId?: string;
  readonly inputFingerprint?: string;
  readonly catalogSnapshotId?: string;
  readonly ruleSnapshotId?: string;
  readonly importId?: string;
  readonly exportId?: string;
  readonly itemCount?: number;
}

export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly actorId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly outcome: "succeeded" | "rejected";
  readonly reasonCode: string | null;
}

export interface AuditTrail {
  append(event: AuditEvent): Promise<void>;
}

export interface IdempotencyRecord {
  readonly scope: string;
  readonly key: string;
  readonly requestHash: string;
  readonly resourceId: string;
  readonly responseStatus: number;
}

export interface IdempotencyStore {
  find(scope: string, key: string): Promise<IdempotencyRecord | null>;
  save(record: IdempotencyRecord): Promise<void>;
}

export interface FingerprintService {
  canonicalSha256(value: unknown): string;
}

export interface IdGenerator {
  create(): string;
}

export interface Clock {
  nowUtc(): string;
}
