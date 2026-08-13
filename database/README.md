# Database operations

SQL migrations are forward-only and applied lexically by the dedicated migration role. The runner
records each filename and SHA-256 checksum under an advisory lock, and rejects missing, renamed,
reordered, or edited history. See `docs/migrations.md` for commands.

The PostgreSQL 18 data directory is `data/postgres`; custom-format manual dumps and checksum
sidecars are in `data/backups`. Restore is destructive and is mediated by an exact typed
confirmation plus a pre-restore safety backup. See `docs/backups.md`.
