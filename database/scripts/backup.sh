#!/bin/sh
set -eu

DATABASE_NAME=niedax_generator
BACKUP_USER=niedax_generator_backup
MIGRATOR_USER=niedax_generator_migrator
BACKUP_DIR=/backups
PATTERN='^[0-9]{8}T[0-9]{6}Z_niedax_generator_pg18\.dump$'

password_from() {
  value=$(tr -d '\r\n' < "$1")
  [ -n "$value" ] || { echo "Required database secret is empty." >&2; exit 1; }
  printf '%s' "$value"
}

valid_name() {
  name=$1
  [ "$(basename "$name")" = "$name" ] && printf '%s' "$name" | grep -Eq "$PATTERN"
}

verify_file() {
  name=$1
  valid_name "$name" || { echo "Invalid backup filename." >&2; return 1; }
  [ -f "$BACKUP_DIR/$name" ] && [ -f "$BACKUP_DIR/$name.sha256" ] || { echo "Backup or checksum is missing." >&2; return 1; }
  line_count=$(awk 'END { print NR }' "$BACKUP_DIR/$name.sha256")
  [ "$line_count" -eq 1 ] || { echo "Checksum sidecar must contain exactly one record." >&2; return 1; }
  checksum_line=$(cat "$BACKUP_DIR/$name.sha256")
  expected_checksum=${checksum_line%% *}
  checksum_suffix=${checksum_line#"$expected_checksum"}
  [ "${#expected_checksum}" -eq 64 ] || { echo "Checksum is not SHA-256." >&2; return 1; }
  case "$expected_checksum" in
    *[!0-9a-f]*) echo "Checksum is not lowercase hexadecimal." >&2; return 1 ;;
  esac
  [ "$checksum_suffix" = "  $name" ] || { echo "Checksum sidecar does not name the selected backup." >&2; return 1; }
  actual_checksum=$(sha256sum "$BACKUP_DIR/$name" | awk '{ print $1 }')
  [ "$actual_checksum" = "$expected_checksum" ] || { echo "Backup checksum does not match." >&2; return 1; }
  pg_restore --list "$BACKUP_DIR/$name" >/dev/null
}

create_backup() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  name="${stamp}_${DATABASE_NAME}_pg18.dump"
  while [ -e "$BACKUP_DIR/$name" ]; do
    sleep 1
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    name="${stamp}_${DATABASE_NAME}_pg18.dump"
  done
  temporary="$BACKUP_DIR/.${name}.partial"
  trap 'rm -f "$temporary"' EXIT INT TERM
  PGPASSWORD=$(password_from /run/secrets/postgres_backup_password)
  export PGPASSWORD
  pg_dump --host=postgres --username="$BACKUP_USER" --dbname="$DATABASE_NAME" \
    --format=custom --compress=6 --no-owner --no-acl --file="$temporary" || return 1
  pg_restore --list "$temporary" >/dev/null || return 1
  mv "$temporary" "$BACKUP_DIR/$name" || return 1
  if ! (cd "$BACKUP_DIR" && sha256sum "$name" > "$name.sha256"); then
    rm -f "$BACKUP_DIR/$name" "$BACKUP_DIR/$name.sha256"
    return 1
  fi
  if ! verify_file "$name"; then
    rm -f "$BACKUP_DIR/$name" "$BACKUP_DIR/$name.sha256"
    return 1
  fi
  trap - EXIT INT TERM
  echo "$name"
}

prune_verified() {
  for file in "$BACKUP_DIR"/*_niedax_generator_pg18.dump; do
    [ -e "$file" ] || continue
    name=$(basename "$file")
    if [ "$(find "$file" -mtime +28 -print)" ] && verify_file "$name"; then
      rm -f "$file" "$file.sha256"
      echo "Pruned $name"
    fi
  done
}

action=${1:-help}
case "$action" in
  create)
    create_backup
    prune_verified
    ;;
  list)
    for file in "$BACKUP_DIR"/*_niedax_generator_pg18.dump; do
      [ -e "$file" ] || continue
      name=$(basename "$file")
      size=$(du -h "$file" | awk '{print $1}')
      modified=$(date -u -r "$file" +%Y-%m-%dT%H:%M:%SZ)
      if verify_file "$name"; then state=valid; else state=INVALID; fi
      age_days=$(( ($(date -u +%s) - $(date -u -r "$file" +%s)) / 86400 ))
      printf '%s  size=%s  checksum=%s  age=%sd  modified=%s\n' "$name" "$size" "$state" "$age_days" "$modified"
    done
    ;;
  verify)
    name=${2:-}
    verify_file "$name"
    echo "Verified $name"
    ;;
  prune-preview)
    find "$BACKUP_DIR" -maxdepth 1 -type f -name '*_niedax_generator_pg18.dump' -mtime +28 -print | sed 's#^.*/##'
    ;;
  prune-confirmed)
    [ "${PRUNE_CONFIRMATION:-}" = "PRUNE $DATABASE_NAME" ] || { echo "Prune confirmation mismatch." >&2; exit 1; }
    prune_verified
    ;;
  restore-confirmed)
    restore_name=${2:-}
    verify_file "$restore_name"
    [ "${RESTORE_CONFIRMATION:-}" = "$DATABASE_NAME $restore_name" ] || { echo "Restore confirmation mismatch." >&2; exit 1; }
    safety=$(create_backup)
    valid_name "$safety" || { echo "Safety backup returned an invalid filename." >&2; exit 1; }
    verify_file "$safety"
    echo "Safety backup created: $safety"
    PGPASSWORD=$(password_from /run/secrets/postgres_migrator_password)
    export PGPASSWORD
    pg_restore --host=postgres --username="$MIGRATOR_USER" --dbname="$DATABASE_NAME" \
      --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction \
      "$BACKUP_DIR/$restore_name"
    psql --host=postgres --username="$MIGRATOR_USER" --dbname="$DATABASE_NAME" \
      --set=ON_ERROR_STOP=1 --single-transaction \
      --file=/usr/local/share/niedax-generator/reconcile-app-privileges.sql \
      >/dev/null
    psql --host=postgres --username="$MIGRATOR_USER" --dbname="$DATABASE_NAME" \
      --set=ON_ERROR_STOP=1 --single-transaction >/dev/null <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM public.schema_migrations) THEN
    RAISE EXCEPTION 'restored migration metadata is empty';
  END IF;
  IF has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'SELECT')
     OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'INSERT')
     OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'UPDATE')
     OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'DELETE')
  THEN
    RAISE EXCEPTION 'application role can access restored migration metadata';
  END IF;
  IF to_regclass('public.revisions') IS NOT NULL
     AND (has_table_privilege('niedax_generator_app', 'public.revisions', 'UPDATE')
       OR has_table_privilege('niedax_generator_app', 'public.revisions', 'DELETE')
       OR has_table_privilege('niedax_generator_app', 'public.revisions', 'TRUNCATE')
       OR NOT has_table_privilege('niedax_generator_app', 'public.revisions', 'SELECT')
       OR NOT has_table_privilege('niedax_generator_app', 'public.revisions', 'INSERT')
       OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'status', 'UPDATE')
       OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'checked_at', 'UPDATE')
       OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'approved_at', 'UPDATE')
       OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'archived_at', 'UPDATE')
       OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'updated_at', 'UPDATE'))
  THEN
    RAISE EXCEPTION 'application role has an invalid restored revisions access policy';
  END IF;
  IF to_regclass('public.bom_lines') IS NOT NULL
     AND (has_table_privilege('niedax_generator_app', 'public.bom_lines', 'UPDATE')
       OR has_table_privilege('niedax_generator_app', 'public.bom_lines', 'DELETE')
       OR has_table_privilege('niedax_generator_app', 'public.bom_lines', 'TRUNCATE')
       OR NOT has_table_privilege('niedax_generator_app', 'public.bom_lines', 'SELECT')
       OR NOT has_table_privilege('niedax_generator_app', 'public.bom_lines', 'INSERT'))
  THEN
    RAISE EXCEPTION 'application role has an invalid restored immutable BOM access policy';
  END IF;
  IF to_regclass('public.approvals') IS NOT NULL
     AND (has_table_privilege('niedax_generator_app', 'public.approvals', 'UPDATE')
       OR has_table_privilege('niedax_generator_app', 'public.approvals', 'DELETE')
       OR has_table_privilege('niedax_generator_app', 'public.approvals', 'TRUNCATE')
       OR NOT has_table_privilege('niedax_generator_app', 'public.approvals', 'SELECT')
       OR NOT has_table_privilege('niedax_generator_app', 'public.approvals', 'INSERT'))
  THEN
    RAISE EXCEPTION 'application role has an invalid restored append-only approvals access policy';
  END IF;
  IF to_regclass('public.users') IS NOT NULL
     AND (has_table_privilege('niedax_generator_app', 'public.users', 'UPDATE')
       OR has_table_privilege('niedax_generator_app', 'public.users', 'DELETE')
       OR has_table_privilege('niedax_generator_app', 'public.users', 'TRUNCATE')
       OR NOT has_column_privilege('niedax_generator_app', 'public.users', 'role', 'UPDATE')
       OR NOT has_column_privilege('niedax_generator_app', 'public.users', 'enabled', 'UPDATE')
       OR has_column_privilege('niedax_generator_app', 'public.users', 'password_hash', 'UPDATE'))
  THEN
    RAISE EXCEPTION 'application role has an invalid restored user-security access policy';
  END IF;
  IF to_regclass('public.sessions') IS NOT NULL
     AND (has_table_privilege('niedax_generator_app', 'public.sessions', 'UPDATE')
       OR has_table_privilege('niedax_generator_app', 'public.sessions', 'DELETE')
       OR has_table_privilege('niedax_generator_app', 'public.sessions', 'TRUNCATE')
       OR NOT has_column_privilege('niedax_generator_app', 'public.sessions', 'revoked_at', 'UPDATE')
       OR NOT has_column_privilege('niedax_generator_app', 'public.sessions', 'last_seen_at', 'UPDATE'))
  THEN
    RAISE EXCEPTION 'application role has an invalid restored session access policy';
  END IF;
  IF to_regclass('public.warnings') IS NOT NULL
     AND (NOT has_table_privilege('niedax_generator_app', 'public.warnings', 'SELECT')
       OR NOT has_table_privilege('niedax_generator_app', 'public.warnings', 'INSERT')
       OR NOT has_table_privilege('niedax_generator_app', 'public.warnings', 'UPDATE')
       OR NOT has_table_privilege('niedax_generator_app', 'public.warnings', 'DELETE'))
  THEN
    RAISE EXCEPTION 'application role has an invalid restored warnings access policy';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM unnest(ARRAY[
        'idempotency_records',
        'revision_bom_lines_v2',
        'revision_warnings_v2',
        'revision_lifecycle_events',
        'user_administration_audit_events'
      ]) AS protected(table_name)
     WHERE to_regclass('public.' || protected.table_name) IS NOT NULL
       AND (
         has_table_privilege(
           'niedax_generator_app', 'public.' || protected.table_name, 'UPDATE'
         )
         OR has_table_privilege(
           'niedax_generator_app', 'public.' || protected.table_name, 'DELETE'
         )
         OR has_table_privilege(
           'niedax_generator_app', 'public.' || protected.table_name, 'TRUNCATE'
         )
         OR NOT has_table_privilege(
           'niedax_generator_app', 'public.' || protected.table_name, 'SELECT'
         )
         OR NOT has_table_privilege(
           'niedax_generator_app', 'public.' || protected.table_name, 'INSERT'
         )
       )
  ) THEN
    RAISE EXCEPTION 'application role has an invalid restored Stage 8 protected-table access policy';
  END IF;
END
$$;
SQL
    echo "Restored database and reconciled protected application-role privileges for $restore_name"
    ;;
  *)
    echo "Usage: backup.sh {create|list|verify <file>|prune-preview|prune-confirmed|restore-confirmed <file>}" >&2
    exit 2
    ;;
esac
