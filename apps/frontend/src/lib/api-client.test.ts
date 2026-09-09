import { afterEach, describe, expect, it, vi } from "vitest";

import { newRequestKey, requestJson, requestNoContent } from "./api-client";

const passthroughSchema = { parse: (value: unknown) => value as { readonly ok: boolean } };

afterEach(() => vi.unstubAllGlobals());

describe("JSON API adapter", () => {
  it("uses native UUID generation where the browser exposes it", () => {
    const randomUUID = vi.fn().mockReturnValue("77a5f96b-1fd7-4fd6-b8be-364a661b50f8");
    vi.stubGlobal("crypto", { randomUUID });
    expect(newRequestKey()).toBe("77a5f96b-1fd7-4fd6-b8be-364a661b50f8");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("generates UUIDv4 keys from secure random bytes on LAN HTTP without randomUUID", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0xff);
      return bytes;
    });
    vi.stubGlobal("crypto", { getRandomValues });
    expect(newRequestKey()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(getRandomValues).toHaveBeenCalledExactlyOnceWith(expect.any(Uint8Array));
  });

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

  it.each(["INVALID_USERNAME", "INVALID_DISPLAY_NAME", "WEAK_PASSWORD"] as const)(
    "preserves the bounded authentication error code %s",
    async (code) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              schemaVersion: "error-envelope/v1",
              correlationId: "authentication-validation-error",
              error: {
                code,
                message: "Authentication input validation failed",
                details: null
              }
            }),
            { status: 400, headers: { "content-type": "application/json" } }
          )
        )
      );

      await expect(requestJson("/api/v1/admin/users", passthroughSchema)).rejects.toMatchObject({
        status: 400,
        code,
        correlationId: "authentication-validation-error"
      });
    }
  );

  it("supports a CSRF-protected successful no-content mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestNoContent("/api/v1/auth/logout", { method: "POST" })
    ).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/v1/auth/logout",
      {
        method: "POST",
        cache: "no-store",
        headers: { "x-niedax-csrf": "1" }
      }
    ]);
  });
});
