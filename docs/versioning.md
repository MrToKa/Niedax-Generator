# Versioning

- Application `0.1.0`: root `package.json`
- Catalogue `0.1.0` draft: `catalogue/manifest.json` (unknown edition/hash remain `null`)
- Calculation rules `0.1.0` draft: `rules/manifest.json`

Backend, Frontend, and calculation-engine import these sources. Tests enforce SemVer and rules
consistency. Future project revisions and BOM snapshots must retain exact catalogue and rules
versions so results remain attributable.

Stage 3 public contract majors are independent of package SemVer:

- `calculation-input/v1` and `calculation-result/v1`;
- command schemas for calculate, project draft, validation, save revision, check, approve,
  activation, and export under their respective `*/v1` literals;
- response schemas including `error-envelope/v1`, `validation-result/v1`,
  `catalog-import-validation-result/v1`, and `english-export-model/v1`;
- HTTP operations under `/api/v1`.

Breaking contract changes use a new payload major and preserve readers for retained v1 revision
snapshots. Exact canonicalization and endpoint behavior are documented in `docs/architecture`.

Dependencies are exact in package manifests and the lockfile. Base images use explicit tags plus
manifest-list digests. To update, consult official release/compatibility notes, inspect a candidate
digest with `docker buildx imagetools inspect <image:tag>`, update every Dockerfile/Compose reference,
recreate the lockfile intentionally, and run `pnpm validate:full`. A digest update is a reviewed
supply-chain change, not an automatic runtime check.
