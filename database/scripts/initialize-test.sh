#!/bin/sh
set -eu

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=migrator_password="$MIGRATOR_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE niedax_generator_migrator LOGIN PASSWORD %L', :'migrator_password')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'niedax_generator_migrator') \gexec
CREATE ROLE niedax_generator_app NOLOGIN;
GRANT niedax_generator_app TO niedax_generator_migrator;
ALTER SCHEMA public OWNER TO niedax_generator_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO niedax_generator_app;
ALTER DEFAULT PRIVILEGES FOR ROLE niedax_generator_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO niedax_generator_app;
SQL
