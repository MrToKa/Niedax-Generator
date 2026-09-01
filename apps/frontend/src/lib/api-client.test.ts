import { afterEach, describe, expect, it, vi } from "vitest";

import { requestJson } from "./api-client";

const passthroughSchema = { parse: (value: unknown) => value as { readonly ok: boolean } };

afterEach(() => vi.unstubAllGlobals());

describe("JSON API adapter", () => {
  it("adds same-origin mutation safety and request identity headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestJson("/api/v1/example", passthroughSchema, {
      method: "POST",
      body: { value: "1.25" },
      idempotencyKey: "request-key-1",
      correlationId: "correlation-1"
    });

    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/v1/example");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", body: '{"value":"1.25"}' });
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "x-niedax-csrf": "1",
      "idempotency-key": "request-key-1",
      "x-correlation-id": "correlation-1"
    });
    expect(init).not.toHaveProperty("idempotencyKey");
  });

  it("parses the shared error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            schemaVersion: "error-envelope/v1",
            correlationId: "correlation-2",
            error: {
              code: "CONFLICT_STALE_VERSION",
              message: "A newer draft exists",
              details: { kind: "conflict", expectedVersion: "2", actualVersion: "3" }
            }
          }),
          { status: 409, headers: { "content-type": "application/json" } }
        )
      )
    );

    await expect(requestJson("/api/v1/example", passthroughSchema)).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT_STALE_VERSION",
      correlationId: "correlation-2"
    });
  });
});
