import { ErrorEnvelopeV1Schema } from "@niedax/domain";

async function api(
  path: string,
  options: { readonly method?: string; readonly body?: unknown } = {}
): Promise<Response> {
  const request: RequestInit = {
    method: options.method ?? "GET",
    headers: {
      host: "127.0.0.1:3001",
      origin: "http://127.0.0.1:3001",
      "x-niedax-csrf": "1",
      ...(options.body === undefined ? {} : { "content-type": "application/json" })
    }
  };
  if (options.body !== undefined) request.body = JSON.stringify(options.body);
  return fetch(`http://127.0.0.1:3001${path}`, request);
}

async function requirePublicError(
  response: Response,
  status: number,
  code: "AUTHENTICATION_REQUIRED"
): Promise<void> {
  const body = ErrorEnvelopeV1Schema.safeParse(await response.json());
  if (response.status !== status || !body.success || body.data.error.code !== code) {
    throw new Error(`Expected ${status} ${code} from the authentication boundary`);
  }
}

await requirePublicError(await api("/api/v1/auth/me"), 401, "AUTHENTICATION_REQUIRED");
await requirePublicError(await api("/api/v1/admin/users?limit=1"), 401, "AUTHENTICATION_REQUIRED");
await requirePublicError(await api("/api/v1/projects"), 401, "AUTHENTICATION_REQUIRED");

const registration = await api("/api/v1/auth/register", {
  method: "POST",
  body: {
    username: "container.registration.must-not-exist",
    password: "Not-A-Real-Registration-42!"
  }
});
if (registration.status !== 404) {
  throw new Error(`Unexpected public registration response ${registration.status}`);
}

process.stdout.write(
  "Container read-only authentication boundary passed: protected identity, user administration, and projects require a session; public registration is absent. Credentialed four-role/session tests run only in disposable db:check infrastructure.\n"
);
