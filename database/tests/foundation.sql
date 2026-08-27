DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN RAISE EXCEPTION 'users table missing'; END IF;
  IF to_regclass('public.sessions') IS NULL THEN RAISE EXCEPTION 'sessions table missing'; END IF;
  IF to_regclass('public.catalog_versions') IS NULL THEN RAISE EXCEPTION 'catalog_versions table missing'; END IF;
  IF to_regclass('public.products') IS NULL THEN RAISE EXCEPTION 'products table missing'; END IF;
  IF to_regclass('public.route_connections') IS NULL THEN RAISE EXCEPTION 'route_connections table missing'; END IF;
  IF to_regclass('public.revisions') IS NULL THEN RAISE EXCEPTION 'revisions table missing'; END IF;
  IF to_regclass('public.bom_lines') IS NULL THEN RAISE EXCEPTION 'bom_lines table missing'; END IF;
  IF to_regclass('public.schema_migrations') IS NULL THEN RAISE EXCEPTION 'migration metadata missing'; END IF;
  IF (SELECT count(*) FROM schema_migrations) <> 6 THEN RAISE EXCEPTION 'unexpected migration count'; END IF;
  IF has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'SELECT')
     OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'INSERT')
     OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'UPDATE')
     OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'DELETE')
  THEN
    RAISE EXCEPTION 'application role can access migration metadata';
  END IF;
  IF has_table_privilege('niedax_generator_app', 'public.revisions', 'UPDATE')
     OR has_table_privilege('niedax_generator_app', 'public.revisions', 'DELETE')
     OR has_table_privilege('niedax_generator_app', 'public.revisions', 'TRUNCATE')
  THEN
    RAISE EXCEPTION 'application role has table-wide revision mutation privileges';
  END IF;
  IF NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'status', 'UPDATE')
     OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'checked_at', 'UPDATE')
     OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'approved_at', 'UPDATE')
     OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'archived_at', 'UPDATE')
     OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'updated_at', 'UPDATE')
  THEN
    RAISE EXCEPTION 'application role is missing the allowed revision lifecycle updates';
  END IF;
  IF has_table_privilege('niedax_generator_app', 'public.bom_lines', 'UPDATE')
     OR has_table_privilege('niedax_generator_app', 'public.bom_lines', 'DELETE')
     OR has_table_privilege('niedax_generator_app', 'public.bom_lines', 'TRUNCATE')
  THEN
    RAISE EXCEPTION 'application role can mutate immutable BOM lines';
  END IF;
  IF has_table_privilege('niedax_generator_app', 'public.approvals', 'UPDATE')
     OR has_table_privilege('niedax_generator_app', 'public.approvals', 'DELETE')
     OR has_table_privilege('niedax_generator_app', 'public.approvals', 'TRUNCATE')
  THEN
    RAISE EXCEPTION 'application role can mutate append-only approvals';
  END IF;
  IF NOT has_table_privilege('niedax_generator_app', 'public.warnings', 'UPDATE')
     OR NOT has_table_privilege('niedax_generator_app', 'public.warnings', 'DELETE')
  THEN
    RAISE EXCEPTION 'application role is missing draft-warning mutation privileges';
  END IF;
END
$$;
