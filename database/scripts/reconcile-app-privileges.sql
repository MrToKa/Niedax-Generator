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

  IF to_regclass('public.warnings') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warnings TO niedax_generator_app';
  END IF;

  IF to_regclass('public.project_audit_events') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.project_audit_events FROM niedax_generator_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.project_audit_events TO niedax_generator_app';
  END IF;
END
$$;
