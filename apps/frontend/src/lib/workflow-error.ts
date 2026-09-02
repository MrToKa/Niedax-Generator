import { ApiError } from "./api-client";
import type { TranslationKey } from "./i18n";

export function workflowErrorKey(error: unknown): TranslationKey | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") return "sessionExpired";
  if (error.status === 403 || error.code === "FORBIDDEN") return "forbiddenAction";
  if (error.code === "CONFLICT_STALE_VERSION") return "revisionConflict";
  if (error.code === "INVALID_STATE_TRANSITION") return "invalidRevisionTransition";
  if (error.code === "IDEMPOTENCY_KEY_CONFLICT") return "idempotencyConflict";
  if (error.code === "INVALID_USERNAME") return "invalidUsername";
  if (error.code === "INVALID_DISPLAY_NAME") return "invalidDisplayName";
  if (error.code === "WEAK_PASSWORD") return "weakPassword";
  return null;
}
