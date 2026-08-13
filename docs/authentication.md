# Authentication

Accounts are individual and administrator-created. There is no public registration endpoint. Roles
are `administrator` and `reviewer`; every administrative handler explicitly checks the former.
Disabling a user revokes all active sessions. The current administrator cannot disable or demote the
account backing the current request.

Passwords use the pinned `@node-rs/argon2` implementation of Argon2id with 19,456 KiB memory, two
iterations, parallelism one, and 32-byte output. The local policy requires at least 14 characters,
lower and upper case, a digit, a symbol, and exclusion of the username.

Login creates 32 random bytes encoded as an opaque token. Only SHA-256 of the token plus a locally
generated secret pepper is stored. Sessions expire after eight hours and support revocation. The
cookie is `HttpOnly`, `SameSite=Lax`, and intentionally lacks `Secure` while the LAN endpoint is plain
HTTP. Set `Secure` and introduce a reviewed internal TLS design together if HTTPS is added later.

State-changing API requests require `X-Niedax-CSRF: 1` and an `Origin` host matching the forwarded
request host. This same-origin validation is independent of CORS. Login is locally rate-limited to
five attempts per minute per Fastify rate-limit scope and requires no Redis.
