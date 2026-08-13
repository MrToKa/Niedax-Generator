DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN RAISE EXCEPTION 'users table missing'; END IF;
  IF to_regclass('public.sessions') IS NULL THEN RAISE EXCEPTION 'sessions table missing'; END IF;
  IF to_regclass('public.schema_migrations') IS NULL THEN RAISE EXCEPTION 'migration metadata missing'; END IF;
  IF (SELECT count(*) FROM schema_migrations) <> 1 THEN RAISE EXCEPTION 'unexpected migration count'; END IF;
END
$$;
