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
  (cd "$BACKUP_DIR" && sha256sum -c "$name.sha256" >/dev/null)
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
    --format=custom --compress=6 --no-owner --no-acl --file="$temporary"
  pg_restore --list "$temporary" >/dev/null
  mv "$temporary" "$BACKUP_DIR/$name"
  (cd "$BACKUP_DIR" && sha256sum "$name" > "$name.sha256")
  verify_file "$name"
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
    name=${2:-}
    verify_file "$name"
    [ "${RESTORE_CONFIRMATION:-}" = "$DATABASE_NAME $name" ] || { echo "Restore confirmation mismatch." >&2; exit 1; }
    safety=$(create_backup | head -n 1)
    echo "Safety backup created: $safety"
    PGPASSWORD=$(password_from /run/secrets/postgres_migrator_password)
    export PGPASSWORD
    pg_restore --host=postgres --username="$MIGRATOR_USER" --dbname="$DATABASE_NAME" \
      --clean --if-exists --no-owner --no-acl --exit-on-error "$BACKUP_DIR/$name"
    psql --host=postgres --username="$MIGRATOR_USER" --dbname="$DATABASE_NAME" \
      --set=ON_ERROR_STOP=1 --command="SELECT count(*) FROM schema_migrations" >/dev/null
    echo "Restored and checked $name"
    ;;
  *)
    echo "Usage: backup.sh {create|list|verify <file>|prune-preview|prune-confirmed|restore-confirmed <file>}" >&2
    exit 2
    ;;
esac
