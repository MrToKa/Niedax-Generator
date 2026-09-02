# Versioning

- Application `0.1.0`: root `package.json`
- Catalogue `0.1.0` draft: `catalogue/manifest.json` (unknown edition/hash remain `null`)
- Calculation rules `0.1.0` draft: `rules/manifest.json`

Backend, Frontend, and calculation-engine import these sources. Tests enforce SemVer and rules
consistency. Stage 8 v2 project revisions retain the exact project, calculation input/result,
catalog/product/source, rule/template/component, BOM, warning, actor, and lifecycle evidence with
deterministic checksums. They never depend on the currently active catalogue or rules for display.

Stage 3 public contract majors are independent of package SemVer:

- `calculation-input/v1` and `calculation-result/v1`;
- command schemas for calculate, project draft, validation, save revision, check, approve,
  activation, and export under their respective `*/v1` literals;
- response schemas including `error-envelope/v1`, `validation-result/v1`,
  `catalog-import-validation-result/v1`, and `english-export-model/v1`;
- HTTP operations under `/api/v1`.

Stage 7 and Stage 8 add strict v2 payload majors on that stable HTTP base path. The canonical access
contracts use `authenticated-identity-response/v2`, `project-access-response/v2`, and strict admin
user v2 requests/responses. Revision mutations use `save-project-revision-request/v2`,
`check-project-revision-request/v2`, and `approve-project-revision-request/v2`; list, detail, and
audit responses use their explicit v2 envelopes. New rows identify themselves as `revision/v2`.
The retained `revision-snapshot/v1`, v1 commands, and v1 input/result schemas are unchanged and are
read through an explicit `revision/v1` compatibility representation whose lifecycle actions are
unsupported.

Stage 8 supersedes the current project-list response with `project-list-response/v3` because the
required nullable `nextCursor` field changes the response shape. Project items remain v2-shaped;
the endpoint emits at most 100 items in ascending project UUID `id` order and uses the last emitted
ID as the keyset cursor. `project-list-response/v2` remains an exported retained schema and is not
silently widened. The retained revision/v1 reader similarly does not widen old snapshots: it bounds
an unbounded legacy description at 10,000 characters and exposes `commentTruncated` explicitly.

Breaking contract changes use a new payload major and preserve readers for retained v1 revision
snapshots. Exact canonicalization and endpoint behavior are documented in `docs/architecture`.

Dependencies are exact in package manifests and the lockfile. Base images use explicit tags plus
manifest-list digests. To update, consult official release/compatibility notes, inspect a candidate
digest with `docker buildx imagetools inspect <image:tag>`, update every Dockerfile/Compose reference,
recreate the lockfile intentionally, and run `pnpm validate:full`. A digest update is a reviewed
supply-chain change, not an automatic runtime check.
