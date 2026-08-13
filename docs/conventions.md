# Conventions

Repository prose, code, filenames, logs, and commits are English. Product UI has a Bulgarian/English
switch foundation. Use strict TypeScript, explicit public package APIs, JSON logs, schema-validated
HTTP handlers, relative same-origin browser requests, and Conventional Commits.

Do not duplicate version literals across layers; import the root package or the relevant manifest.
Do not add a dependency to the calculation engine unless it remains deterministic and I/O-free.
Do not write runtime output outside `data`; normal Compose contains no source bind mounts.
