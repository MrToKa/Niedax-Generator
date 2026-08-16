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
  IF (SELECT count(*) FROM schema_migrations) <> 3 THEN RAISE EXCEPTION 'unexpected migration count'; END IF;
END
$$;
