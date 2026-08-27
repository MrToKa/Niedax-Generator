# Manual backups

Backups run only through an ephemeral Compose `tools` service; no scheduler exists. `backup:create`
uses the read-only backup role, PostgreSQL 18 custom format, archive-list validation, and SHA-256. A
file is named `YYYYMMDDTHHMMSSZ_niedax_generator_pg18.dump` with a `.sha256` sidecar. Output is
restricted to `data/backups`.

Create, list, and verify regularly. Successful creation prunes only verified dumps strictly older
than 28 days. Manual prune gives a preview and exact confirmation. Corrupt or unmatched files are
never pruned automatically.

Restore is destructive. The root command validates the exact basename and checksum/archive, then
requires `niedax_generator <exact-filename>`. It builds the current migration runner, stops
Backend/Gateway, makes a safety backup of the current database, restores atomically without foreign
ownership/ACL metadata as the schema-owning migration role, reapplies the protected migration-ledger
ACL, and applies/verifies the current forward-only migration history before restarting services. If
restore or migration verification fails, Backend and Gateway remain stopped for manual inspection.
Never rename a dump without regenerating and reviewing its checksum.

Backups are deliberately unencrypted. They can contain password hashes and application data, so
protect the directory with local filesystem access control and do not email, sync, or upload it.
