import { ErrorEnvelopeV1Schema, type ErrorEnvelopeV1 } from "@niedax/domain";

interface RuntimeSchema<T> {
  parse(value: unknown): T;
}

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly correlationId: string | null,
    public readonly details: ErrorEnvelopeV1["error"]["details"],
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface JsonRequestOptions extends Omit<RequestInit, "body" | "headers" | "signal"> {
  readonly body?: unknown;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
  readonly signal?: AbortSignal | undefined;
}

export function newRequestKey(): string {
  return crypto.randomUUID();
}

export async function requestJson<T>(
  path: `/api/v1/${string}`,
  schema: RuntimeSchema<T>,
  options: JsonRequestOptions = {}
): Promise<T> {
  const mutation = options.method !== undefined && !["GET", "HEAD"].includes(options.method);
  const { body, correlationId, idempotencyKey, signal, ...requestOptions } = options;
  const response = await fetch(path, {
    ...requestOptions,
    cache: "no-store",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(mutation ? { "x-niedax-csrf": "1" } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      ...(correlationId ? { "x-correlation-id": correlationId } : {})
    }
  });

  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw apiErrorFromResponse(response, raw);
  }

  return schema.parse(raw);
}

export async function requestNoContent(
  path: `/api/v1/${string}`,
  options: Omit<JsonRequestOptions, "body"> = {}
): Promise<void> {
  const mutation = options.method !== undefined && !["GET", "HEAD"].includes(options.method);
  const { correlationId, idempotencyKey, signal, ...requestOptions } = options;
  const response = await fetch(path, {
    ...requestOptions,
    cache: "no-store",
    ...(signal ? { signal } : {}),
    headers: {
      ...(mutation ? { "x-niedax-csrf": "1" } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      ...(correlationId ? { "x-correlation-id": correlationId } : {})
    }
  });
  if (!response.ok) {
    const raw = await response.json().catch(() => null);
    throw apiErrorFromResponse(response, raw);
  }
}

function apiErrorFromResponse(response: Response, raw: unknown): ApiError {
  const parsed = ErrorEnvelopeV1Schema.safeParse(raw);
  if (parsed.success) {
    return new ApiError(
      response.status,
      parsed.data.error.code,
      parsed.data.correlationId,
      parsed.data.error.details,
      parsed.data.error.message
    );
  }
  return new ApiError(
    response.status,
    "INTERNAL_ERROR",
    response.headers.get("x-correlation-id"),
    null,
    "Request failed"
  );
}

export function isAuthenticationError(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED")
  );
}
