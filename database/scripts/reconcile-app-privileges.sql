-- Reapply application-role exceptions that are not preserved by portable --no-acl dumps.
-- Keep this policy synchronized with migrations that grant or revoke table privileges.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'niedax_generator_app') THEN
    RETURN;
  END IF;

  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM niedax_generator_app';
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.users FROM niedax_generator_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.users TO niedax_generator_app';
    EXECUTE 'GRANT UPDATE (role, enabled, updated_at, updated_by) ON TABLE public.users TO niedax_generator_app';
  END IF;

  IF to_regclass('public.sessions') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.sessions FROM niedax_generator_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.sessions TO niedax_generator_app';
    EXECUTE 'GRANT UPDATE (revoked_at, last_seen_at) ON TABLE public.sessions TO niedax_generator_app';
  END IF;

  IF to_regclass('public.revisions') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.revisions FROM niedax_generator_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.revisions TO niedax_generator_app';
    EXECUTE 'GRANT UPDATE (status, checked_at, approved_at, archived_at, updated_at) ON TABLE public.revisions TO niedax_generator_app';
  END IF;

  IF to_regclass('public.bom_lines') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.bom_lines FROM niedax_generator_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.bom_lines TO niedax_generator_app';
  END IF;

  IF to_regclass('public.approvals') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.approvals FROM niedax_generator_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.approvals TO niedax_generator_app';
  END IF;

  IF to_regclass('public.idempotency_records') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.idempotency_records FROM niedax_generator_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.idempotency_records TO niedax_generator_app';
  END IF;

  IF to_regclass('public.warnings') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warnings TO niedax_generator_app';
  END IF;

  IF to_regclass('public.project_audit_events') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.project_audit_events FROM niedax_generator_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.project_audit_events TO niedax_generator_app';
  END IF;

  IF to_regclass('public.revision_bom_lines_v2') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.revision_bom_lines_v2 FROM niedax_generator_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.revision_bom_lines_v2 TO niedax_generator_app';
  END IF;

  IF to_regclass('public.revision_warnings_v2') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.revision_warnings_v2 FROM niedax_generator_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.revision_warnings_v2 TO niedax_generator_app';
  END IF;

  IF to_regclass('public.revision_lifecycle_events') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.revision_lifecycle_events FROM niedax_generator_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.revision_lifecycle_events TO niedax_generator_app';
  END IF;

  IF to_regclass('public.user_administration_audit_events') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.user_administration_audit_events FROM niedax_generator_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.user_administration_audit_events TO niedax_generator_app';
  END IF;
END
$$;
