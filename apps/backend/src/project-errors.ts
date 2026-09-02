import { AppError } from "./auth-service.js";

export type ProjectErrorDetails =
  | {
      readonly kind: "validation";
      readonly issues: readonly {
        readonly path: readonly (string | number)[];
        readonly code: string;
        readonly message: string;
      }[];
    }
  | {
      readonly kind: "conflict";
      readonly expectedVersion: string;
      readonly actualVersion: string | null;
    }
  | {
      readonly kind: "stateTransition";
      readonly currentStatus: "draft" | "calculated" | "checked" | "approved" | "archived";
      readonly requestedStatus: "draft" | "calculated" | "checked" | "approved" | "archived";
    }
  | null;

export class ProjectApplicationError extends AppError {
  public constructor(
    statusCode: number,
    code:
      | "VALIDATION_FAILED"
      | "CONFLICT_STALE_VERSION"
      | "INVALID_STATE_TRANSITION"
      | "AUTHENTICATION_REQUIRED"
      | "FORBIDDEN"
      | "RESOURCE_NOT_FOUND"
      | "CATALOG_SNAPSHOT_MISSING"
      | "RULE_SNAPSHOT_MISSING"
      | "UNSUPPORTED_SCHEMA_VERSION"
      | "IDEMPOTENCY_KEY_CONFLICT"
      | "CALCULATION_FAILED"
      | "INTERNAL_ERROR",
    message: string,
    public readonly details: ProjectErrorDetails = null
  ) {
    super(statusCode, code, message);
  }
}
