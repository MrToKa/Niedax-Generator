DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN RAISE EXCEPTION 'users table missing'; END IF;
  IF to_regclass('public.sessions') IS NULL THEN RAISE EXCEPTION 'sessions table missing'; END IF;
  IF to_regclass('public.catalog_versions') IS NULL THEN RAISE EXCEPTION 'catalog_versions table missing'; END IF;
  IF to_regclass('public.products') IS NULL THEN RAISE EXCEPTION 'products table missing'; END IF;
  IF to_regclass('public.route_connections') IS NULL THEN RAISE EXCEPTION 'route_connections table missing'; END IF;
  IF to_regclass('public.revisions') IS NULL THEN RAISE EXCEPTION 'revisions table missing'; END IF;
  IF to_regclass('public.bom_lines') IS NULL THEN RAISE EXCEPTION 'bom_lines table missing'; END IF;
  IF to_regclass('public.revision_bom_lines_v2') IS NULL THEN RAISE EXCEPTION 'v2 revision BOM table missing'; END IF;
  IF to_regclass('public.revision_warnings_v2') IS NULL THEN RAISE EXCEPTION 'v2 revision warnings table missing'; END IF;
  IF to_regclass('public.revision_lifecycle_events') IS NULL THEN RAISE EXCEPTION 'revision lifecycle audit table missing'; END IF;
  IF to_regclass('public.user_administration_audit_events') IS NULL THEN RAISE EXCEPTION 'user administration audit table missing'; END IF;
  IF to_regclass('public.schema_migrations') IS NULL THEN RAISE EXCEPTION 'migration metadata missing'; END IF;
  IF (SELECT count(*) FROM schema_migrations) <> 10 THEN RAISE EXCEPTION 'unexpected migration count'; END IF;
  IF has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'SELECT')
     OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'INSERT')
     OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'UPDATE')
     OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'DELETE')
  THEN
    RAISE EXCEPTION 'application role can access migration metadata';
  END IF;
  IF has_table_privilege('niedax_generator_app', 'public.users', 'UPDATE')
     OR has_table_privilege('niedax_generator_app', 'public.users', 'DELETE')
     OR has_table_privilege('niedax_generator_app', 'public.users', 'TRUNCATE')
     OR NOT has_table_privilege('niedax_generator_app', 'public.users', 'SELECT')
     OR NOT has_table_privilege('niedax_generator_app', 'public.users', 'INSERT')
     OR NOT has_column_privilege('niedax_generator_app', 'public.users', 'role', 'UPDATE')
     OR NOT has_column_privilege('niedax_generator_app', 'public.users', 'enabled', 'UPDATE')
     OR NOT has_column_privilege('niedax_generator_app', 'public.users', 'updated_at', 'UPDATE')
     OR NOT has_column_privilege('niedax_generator_app', 'public.users', 'updated_by', 'UPDATE')
     OR has_column_privilege('niedax_generator_app', 'public.users', 'display_name', 'UPDATE')
     OR has_column_privilege('niedax_generator_app', 'public.users', 'password_hash', 'UPDATE')
  THEN
    RAISE EXCEPTION 'application role user-security privileges are unsafe';
  END IF;
  IF has_table_privilege('niedax_generator_app', 'public.sessions', 'UPDATE')
     OR has_table_privilege('niedax_generator_app', 'public.sessions', 'DELETE')
     OR has_table_privilege('niedax_generator_app', 'public.sessions', 'TRUNCATE')
     OR NOT has_table_privilege('niedax_generator_app', 'public.sessions', 'SELECT')
     OR NOT has_table_privilege('niedax_generator_app', 'public.sessions', 'INSERT')
     OR NOT has_column_privilege('niedax_generator_app', 'public.sessions', 'revoked_at', 'UPDATE')
     OR NOT has_column_privilege('niedax_generator_app', 'public.sessions', 'last_seen_at', 'UPDATE')
     OR has_column_privilege('niedax_generator_app', 'public.sessions', 'expires_at', 'UPDATE')
  THEN
    RAISE EXCEPTION 'application role session privileges are unsafe';
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
  IF has_table_privilege('niedax_generator_app', 'public.idempotency_records', 'UPDATE')
     OR has_table_privilege('niedax_generator_app', 'public.idempotency_records', 'DELETE')
     OR has_table_privilege('niedax_generator_app', 'public.idempotency_records', 'TRUNCATE')
     OR NOT has_table_privilege('niedax_generator_app', 'public.idempotency_records', 'SELECT')
     OR NOT has_table_privilege('niedax_generator_app', 'public.idempotency_records', 'INSERT')
  THEN
    RAISE EXCEPTION 'application role idempotency-record privileges are unsafe';
  END IF;
  IF has_table_privilege('niedax_generator_app', 'public.revision_bom_lines_v2', 'UPDATE')
     OR has_table_privilege('niedax_generator_app', 'public.revision_bom_lines_v2', 'DELETE')
     OR has_table_privilege('niedax_generator_app', 'public.revision_bom_lines_v2', 'TRUNCATE')
     OR NOT has_table_privilege('niedax_generator_app', 'public.revision_bom_lines_v2', 'SELECT')
     OR NOT has_table_privilege('niedax_generator_app', 'public.revision_bom_lines_v2', 'INSERT')
  THEN
    RAISE EXCEPTION 'application role v2 revision BOM privileges are unsafe';
  END IF;
  IF has_table_privilege('niedax_generator_app', 'public.revision_warnings_v2', 'UPDATE')
     OR has_table_privilege('niedax_generator_app', 'public.revision_warnings_v2', 'DELETE')
     OR has_table_privilege('niedax_generator_app', 'public.revision_warnings_v2', 'TRUNCATE')
     OR NOT has_table_privilege('niedax_generator_app', 'public.revision_warnings_v2', 'SELECT')
     OR NOT has_table_privilege('niedax_generator_app', 'public.revision_warnings_v2', 'INSERT')
  THEN
    RAISE EXCEPTION 'application role v2 revision warning privileges are unsafe';
  END IF;
  IF has_table_privilege('niedax_generator_app', 'public.revision_lifecycle_events', 'UPDATE')
     OR has_table_privilege('niedax_generator_app', 'public.revision_lifecycle_events', 'DELETE')
     OR has_table_privilege('niedax_generator_app', 'public.revision_lifecycle_events', 'TRUNCATE')
     OR NOT has_table_privilege('niedax_generator_app', 'public.revision_lifecycle_events', 'SELECT')
     OR NOT has_table_privilege('niedax_generator_app', 'public.revision_lifecycle_events', 'INSERT')
  THEN
    RAISE EXCEPTION 'application role revision audit privileges are unsafe';
  END IF;
  IF has_table_privilege('niedax_generator_app', 'public.user_administration_audit_events', 'UPDATE')
     OR has_table_privilege('niedax_generator_app', 'public.user_administration_audit_events', 'DELETE')
     OR has_table_privilege('niedax_generator_app', 'public.user_administration_audit_events', 'TRUNCATE')
     OR NOT has_table_privilege('niedax_generator_app', 'public.user_administration_audit_events', 'SELECT')
     OR NOT has_table_privilege('niedax_generator_app', 'public.user_administration_audit_events', 'INSERT')
  THEN
    RAISE EXCEPTION 'application role user administration audit privileges are unsafe';
  END IF;
  IF NOT has_table_privilege('niedax_generator_app', 'public.warnings', 'UPDATE')
     OR NOT has_table_privilege('niedax_generator_app', 'public.warnings', 'DELETE')
  THEN
    RAISE EXCEPTION 'application role is missing draft-warning mutation privileges';
  END IF;
END
$$;
