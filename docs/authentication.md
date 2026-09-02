# Authentication

Accounts are individual and Administrator-created. There is no public registration endpoint. The
canonical persisted and API roles are `designer`, `reviewer`, `administrator`, and `viewer` (shown
as **View only** in English). Role and public-capability values come from the backend-owned identity
response; the browser never supplies effective capabilities.

The centralized backend policy grants these resource scopes:

- Designer can create projects and read, edit, validate, calculate, save revisions, and read history
  for owned projects only.
- Reviewer keeps those mutation rights for owned projects, can read every project and revision for
  the local review workflow, and can check or approve the latest eligible revision.
- Administrator can act across projects, check and approve revisions, and alone can administer users
  and the catalog lifecycle.
- Viewer can read projects and non-sensitive revision history but cannot mutate or administer.

User administration is bounded and Administrator-only. `GET /api/v1/admin/users` accepts a limit of
1 through 100 and an optional opaque UUID cursor. Creating an account, changing a role, and changing
enabled state use strict versioned request/response contracts. The current Administrator cannot
disable or demote the account backing the current request, and the persistence transaction locks and
preserves at least one enabled Administrator.

Disabling an account revokes all of its active sessions in the same transaction. Any role change also
revokes every session for that account, so a stale high-privilege cookie cannot retain authority. A
new login is required and subsequent requests resolve the current enabled user and role from
PostgreSQL rather than trusting role data embedded in the cookie.

Successful account creation, role changes, and enabled-state changes append an immutable
`user_administration_audit_events` record in the same transaction. It contains the actual
Administrator actor, safe actor/target snapshots, prior and resulting role/status, action,
correlation ID, outcome, and timestamp. Password hashes, credentials, cookies, session tokens and
session hashes are excluded. Audit rows are queryable by privileged backend/database workflows but
cannot be updated or deleted by the application role.

Passwords use the pinned `@node-rs/argon2` implementation of Argon2id with 19,456 KiB memory, two
iterations, parallelism one, and 32-byte output. The local policy requires at least 6 characters,
lower and upper case, a digit, a symbol, and exclusion of the username.

Login creates 32 random bytes encoded as an opaque token. Only SHA-256 of the token plus a locally
generated secret pepper is stored. Sessions expire after eight hours and support revocation. The
cookie is `HttpOnly`, `SameSite=Lax`, and intentionally lacks `Secure` while the LAN endpoint is plain
HTTP. Set `Secure` and introduce a reviewed internal TLS design together if HTTPS is added later.

State-changing API requests require `X-Niedax-CSRF: 1` and an `Origin` host matching the forwarded
request host. This same-origin validation is independent of CORS. Login is locally rate-limited to
five attempts per minute per Fastify rate-limit scope and requires no Redis.
