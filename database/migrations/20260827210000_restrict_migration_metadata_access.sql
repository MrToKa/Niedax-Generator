-- The application role must not read or mutate the checksum-protected migration ledger.
REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM niedax_generator_app;
