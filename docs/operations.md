# Operations

Setup is idempotent and does not overwrite secrets. `pnpm start` performs a Compose build/up;
`pnpm stop` removes only containers and networks while retaining bind-mounted data. `pnpm status`
shows health, and bounded logs go to Docker's JSON log driver (10 MiB, five files). Applications log
structured JSON to stdout/stderr and never persist log files.

Long-running services use `unless-stopped`; migrations and backup jobs never restart forever. Health
checks cover PostgreSQL, Backend readiness, Frontend, and Gateway routing. SIGTERM/SIGINT makes
Backend stop accepting requests and close Fastify plus its PostgreSQL pool.

No arbitrary CPU or RAM limits are set. Observe `docker stats --no-stream` during realistic use and
introduce reviewed limits only when measurements justify them. Current foundation validation prints
one no-stream sample.
