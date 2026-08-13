#!/bin/sh
set -eu

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=migrator_password="$MIGRATOR_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE niedax_generator_migrator LOGIN PASSWORD %L', :'migrator_password')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'niedax_generator_migrator') \gexec
ALTER SCHEMA public OWNER TO niedax_generator_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
