# Versioning

- Application `0.1.0`: root `package.json`
- Catalogue `0.1.0` draft: `catalogue/manifest.json` (unknown edition/hash remain `null`)
- Calculation rules `0.1.0` draft: `rules/manifest.json`

Backend, Frontend, and calculation-engine import these sources. Tests enforce SemVer and rules
consistency. Future project revisions and BOM snapshots must retain exact catalogue and rules
versions so results remain attributable.

Dependencies are exact in package manifests and the lockfile. Base images use explicit tags plus
manifest-list digests. To update, consult official release/compatibility notes, inspect a candidate
digest with `docker buildx imagetools inspect <image:tag>`, update every Dockerfile/Compose reference,
recreate the lockfile intentionally, and run `pnpm validate:full`. A digest update is a reviewed
supply-chain change, not an automatic runtime check.
