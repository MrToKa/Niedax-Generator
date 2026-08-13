#!/bin/sh
set -eu

read_secret() {
  value=$(tr -d '\r\n' < "$1")
  if [ -z "$value" ]; then
    echo "A required database role secret is empty." >&2
    exit 1
  fi
  printf '%s' "$value"
}

app_password=$(read_secret /run/secrets/postgres_app_password)
migrator_password=$(read_secret /run/secrets/postgres_migrator_password)
backup_password=$(read_secret /run/secrets/postgres_backup_password)

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$app_password" \
  --set=migrator_password="$migrator_password" \
  --set=backup_password="$backup_password" <<'SQL'
SELECT format('CREATE ROLE niedax_generator_app LOGIN PASSWORD %L', :'app_password')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'niedax_generator_app') \gexec
SELECT format('CREATE ROLE niedax_generator_migrator LOGIN PASSWORD %L', :'migrator_password')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'niedax_generator_migrator') \gexec
SELECT format('CREATE ROLE niedax_generator_backup LOGIN PASSWORD %L', :'backup_password')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'niedax_generator_backup') \gexec

ALTER ROLE niedax_generator_app PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE niedax_generator_migrator PASSWORD :'migrator_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE niedax_generator_backup PASSWORD :'backup_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

GRANT CONNECT ON DATABASE niedax_generator TO niedax_generator_app, niedax_generator_migrator, niedax_generator_backup;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO niedax_generator_migrator;
GRANT USAGE ON SCHEMA public TO niedax_generator_app, niedax_generator_backup;

ALTER DEFAULT PRIVILEGES FOR ROLE niedax_generator_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO niedax_generator_app;
ALTER DEFAULT PRIVILEGES FOR ROLE niedax_generator_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO niedax_generator_app;
ALTER DEFAULT PRIVILEGES FOR ROLE niedax_generator_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO niedax_generator_backup;
SQL
