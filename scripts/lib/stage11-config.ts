import assert from "node:assert/strict";
import { lstat, readdir, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { BrowserComposeConfig } from "./stage9-browser-config.js";
import { resolveFeatureFlags } from "../../packages/domain/src/schemas/v1/system.js";

export const TEST_PROJECT = "niedax-test";
export const TEST_SECRET_NAMES = [
  "postgres_admin_password",
  "postgres_app_password",
  "postgres_backup_password",
  "postgres_migrator_password",
  "session_pepper"
] as const;
export interface TestBuild {
  gitCommit: string;
  buildTimestamp: string;
  tag: string;
}
export interface TestTopologyOptions {
  workspace: string;
  port: number;
  bind: string;
  build: TestBuild;
}

const dockerfiles: Record<string, string> = {
  backend: "apps/backend/Dockerfile",
  frontend: "apps/frontend/Dockerfile",
  gateway: "gateway/Dockerfile",
  migrations: "database/Dockerfile.migrations",
  backup: "database/Dockerfile.backup"
};

/** Independent allow-list for the fully resolved merged Compose model. */
export function validateTestTopology(
  config: BrowserComposeConfig,
  options: TestTopologyOptions
): void {
  const check = (condition: unknown) =>
    assert(condition, "Refusing unsafe persistent TEST topology");
  const keys = (value: object) => Object.keys(value).sort().join();
  check(
    Object.keys(config).every((key) =>
      ["name", "services", "networks", "secrets", "volumes", "x-hardened", "x-logging"].includes(
        key
      )
    )
  );
  check(config.name === TEST_PROJECT);
  check(keys(config.services) === "backend,backup,frontend,gateway,migrations,postgres");
  check(keys(config.secrets) === [...TEST_SECRET_NAMES].sort().join());
  check(keys(config.networks) === "backend,edge,ingress" && !keys(config.volumes ?? {}));
  check(Number.isInteger(options.port) && options.port >= 1024 && options.port <= 65535);
  check(["0.0.0.0", "127.0.0.1"].includes(options.bind));
  check(/^[a-f0-9]{40}$/u.test(options.build.gitCommit));
  check(options.build.tag === options.build.gitCommit);
  check(Number.isFinite(Date.parse(options.build.buildTimestamp)));
  for (const [name, network] of Object.entries(config.networks)) {
    check(network.name === `${TEST_PROJECT}-${name}` && !network.external);
    check(name === "ingress" ? !network.internal : network.internal === true);
    check(Object.keys(network).every((key) => ["name", "internal", "ipam"].includes(key)));
    check(!("ipam" in network) || keys(network.ipam as object) === "");
  }
  for (const [name, secret] of Object.entries(config.secrets)) {
    check(
      !secret.external &&
        resolve(secret.file) === resolve(options.workspace, "data/test/secrets", name)
    );
    check(Object.keys(secret).every((key) => ["name", "file"].includes(key)));
  }
  const mounts: Record<string, Array<[string, string, boolean]>> = {
    postgres: [
      ["data/test/postgres", "/var/lib/postgresql/18/docker", false],
      ["database/scripts/initialize.sh", "/docker-entrypoint-initdb.d/010-niedax-roles.sh", true]
    ],
    gateway: [["gateway/Caddyfile", "/etc/caddy/Caddyfile", true]],
    backup: [["data/test/backups", "/backups", false]]
  };
  const allowedSecrets: Record<string, string[]> = {
    postgres: TEST_SECRET_NAMES.filter((name) => name !== "session_pepper"),
    backend: ["postgres_app_password", "session_pepper"],
    migrations: ["postgres_migrator_password"],
    backup: ["postgres_backup_password", "postgres_migrator_password"],
    frontend: [],
    gateway: []
  };
  const fixedEnvironments: Record<string, Record<string, string>> = {
    postgres: {
      POSTGRES_DB: "niedax_generator",
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD_FILE: "/run/secrets/postgres_admin_password",
      POSTGRES_INITDB_ARGS: "--encoding=UTF8",
      PGDATA: "/var/lib/postgresql/18/docker",
      TZ: "Europe/Sofia",
      PGTZ: "Europe/Sofia"
    },
    migrations: {
      PGHOST: "postgres",
      PGPORT: "5432",
      PGDATABASE: "niedax_generator",
      PGUSER: "niedax_generator_migrator",
      PGPASSWORD_FILE: "/run/secrets/postgres_migrator_password",
      PGSSLMODE: "disable",
      TZ: "Europe/Sofia"
    },
    backend: {
      HOST: "0.0.0.0",
      PORT: "3001",
      NODE_ENV: "production",
      NIEDAX_ENV: "test",
      NIEDAX_TEST_PROJECT: TEST_PROJECT,
      PGHOST: "postgres",
      PGPORT: "5432",
      PGDATABASE: "niedax_generator",
      PGUSER: "niedax_generator_app",
      PGPASSWORD_FILE: "/run/secrets/postgres_app_password",
      PGSSLMODE: "disable",
      PGPOOL_MAX: "10",
      SESSION_PEPPER_FILE: "/run/secrets/session_pepper",
      COOKIE_SECURE: "false",
      TZ: "Europe/Sofia"
    },
    frontend: {
      HOSTNAME: "0.0.0.0",
      PORT: "3000",
      NODE_ENV: "production",
      NIEDAX_ENV: "test",
      NEXT_TELEMETRY_DISABLED: "1",
      TZ: "Europe/Sofia"
    },
    backup: {
      PGHOST: "postgres",
      PGPORT: "5432",
      PGDATABASE: "niedax_generator",
      PGSSLMODE: "disable",
      TZ: "Europe/Sofia"
    },
    gateway: {}
  };
  const temporaryFilesystems: Record<string, string[]> = {
    postgres: ["/tmp:rw,noexec,nosuid,size=64m", "/run/postgresql:rw,nosuid,size=16m"],
    migrations: ["/tmp:rw,noexec,nosuid,size=32m"],
    backend: ["/tmp:rw,noexec,nosuid,size=64m"],
    frontend: ["/tmp:rw,noexec,nosuid,size=64m"],
    gateway: [
      "/config:rw,noexec,nosuid,size=16m",
      "/data:rw,noexec,nosuid,size=16m",
      "/tmp:rw,noexec,nosuid,size=16m"
    ],
    backup: ["/tmp:rw,noexec,nosuid,size=64m"]
  };
  const dependencyConditions: Record<string, Record<string, string>> = {
    postgres: {},
    frontend: {},
    migrations: { postgres: "service_healthy" },
    backup: { postgres: "service_healthy" },
    backend: { postgres: "service_healthy", migrations: "service_completed_successfully" },
    gateway: { backend: "service_healthy", frontend: "service_healthy" }
  };
  const healthCommands: Record<string, string[]> = {
    postgres: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -U postgres -d niedax_generator"],
    backend: [
      "CMD",
      "node",
      "-e",
      "fetch('http://127.0.0.1:3001/api/v1/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
    ],
    frontend: [
      "CMD",
      "node",
      "-e",
      "fetch('http://127.0.0.1:3000').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
    ],
    gateway: [
      "CMD",
      "wget",
      "--quiet",
      "--tries=1",
      "--spider",
      "http://127.0.0.1:8080/api/v1/health/live"
    ]
  };
  for (const [name, service] of Object.entries(config.services)) {
    check(
      Object.keys(service).every((key) =>
        [
          "container_name",
          "image",
          "build",
          "restart",
          "read_only",
          "security_opt",
          "cap_drop",
          "cap_add",
          "environment",
          "secrets",
          "volumes",
          "tmpfs",
          "healthcheck",
          "networks",
          "logging",
          "depends_on",
          "user",
          "ports",
          "profiles",
          "command",
          "entrypoint"
        ].includes(key)
      )
    );
    check(service.container_name === `${TEST_PROJECT}-${name}`);
    check(service.read_only === true && JSON.stringify(service.cap_drop) === '["ALL"]');
    check(JSON.stringify(service.security_opt) === '["no-new-privileges:true"]');
    check(
      !service.privileged &&
        !service.network_mode &&
        !service.pid &&
        !service.ipc &&
        !service.devices &&
        !service.volumes_from &&
        !service.entrypoint &&
        !service.command &&
        !service.env_file &&
        !service.extra_hosts
    );
    const capabilities =
      name === "postgres" ? ["CHOWN", "DAC_OVERRIDE", "FOWNER", "SETGID", "SETUID"] : [];
    check(JSON.stringify(service.cap_add ?? []) === JSON.stringify(capabilities));
    check(JSON.stringify(service.tmpfs) === JSON.stringify(temporaryFilesystems[name]));
    check(service.user === (name === "gateway" ? "1000:1000" : undefined));
    check(service.restart === (["backup", "migrations"].includes(name) ? "no" : "unless-stopped"));
    check(
      JSON.stringify(service.profiles ?? []) === JSON.stringify(name === "backup" ? ["tools"] : [])
    );
    const dependencies = (service.depends_on ?? {}) as Record<
      string,
      { condition?: string; required?: boolean; restart?: boolean }
    >;
    check(keys(dependencies) === keys(dependencyConditions[name]!));
    for (const [dependency, condition] of Object.entries(dependencyConditions[name]!)) {
      const settings = dependencies[dependency]!;
      check(settings.condition === condition && settings.required !== false && !settings.restart);
      check(
        Object.keys(settings).every((key) => ["condition", "required", "restart"].includes(key))
      );
    }
    const healthcheck = service.healthcheck as
      | {
          test?: string[];
          timeout?: string;
          interval?: string;
          retries?: number;
          start_period?: string;
        }
      | undefined;
    if (healthCommands[name]) {
      check(
        healthcheck &&
          Object.keys(healthcheck).sort().join() === "interval,retries,start_period,test,timeout"
      );
      check(JSON.stringify(healthcheck?.test) === JSON.stringify(healthCommands[name]));
      check(
        healthcheck?.interval === "5s" &&
          healthcheck.timeout === "3s" &&
          healthcheck.retries === 20 &&
          healthcheck.start_period === (["postgres", "frontend"].includes(name) ? "15s" : "10s")
      );
    } else check(!healthcheck);
    const logging = service.logging as
      { driver?: string; options?: Record<string, string> } | undefined;
    check(
      logging?.driver === "json-file" &&
        logging.options?.["max-size"] === "10m" &&
        logging.options["max-file"] === "5"
    );
    check(
      keys(logging ?? {}) === "driver,options" &&
        keys(logging?.options ?? {}) === "max-file,max-size"
    );
    const networks = Array.isArray(service.networks)
      ? service.networks
      : Object.keys((service.networks as object) ?? {});
    check(
      [...networks].sort().join() ===
        (name === "gateway" ? "backend,edge,ingress" : name === "frontend" ? "edge" : "backend")
    );
    if (!Array.isArray(service.networks))
      check(
        Object.values(service.networks as object).every(
          (attachment) => attachment === null || keys(attachment as object) === ""
        )
      );
    const secrets = (service.secrets ?? []) as Array<string | { source: string; target?: string }>;
    check(
      secrets
        .map((secret) => (typeof secret === "string" ? secret : secret.source))
        .sort()
        .join() === allowedSecrets[name]!.sort().join()
    );
    for (const secret of secrets)
      if (typeof secret !== "string") {
        check(
          !secret.target ||
            secret.target === secret.source ||
            secret.target === `/run/secrets/${secret.source}`
        );
        check(Object.keys(secret).every((key) => ["source", "target"].includes(key)));
      }
    const expectedMounts = mounts[name] ?? [];
    check((service.volumes ?? []).length === expectedMounts.length);
    for (const [source, target, readOnly] of expectedMounts) {
      const volume = service.volumes?.find((mount) => mount.target === target);
      check(
        volume?.type === "bind" &&
          resolve(volume.source) === resolve(options.workspace, source) &&
          !!volume.read_only === readOnly
      );
      check(
        Object.keys(volume ?? {}).every((key) =>
          ["type", "source", "target", "read_only", "bind"].includes(key)
        )
      );
      const bind = (volume as unknown as { bind?: { create_host_path?: boolean } }).bind;
      if (bind) check(keys(bind) === "create_host_path" && bind.create_host_path === true);
    }
    if (name === "gateway") {
      const port = service.ports?.[0];
      check(
        service.ports?.length === 1 &&
          port?.target === 8080 &&
          String(port.published) === String(options.port) &&
          port.host_ip === options.bind &&
          port.protocol === "tcp"
      );
      check(
        Object.keys(port ?? {}).every((key) =>
          ["target", "published", "host_ip", "protocol", "mode"].includes(key)
        )
      );
      check(!port?.mode || port.mode === "ingress");
    } else check(!service.ports?.length);
    if (name === "postgres") {
      check(
        service.image ===
          "postgres:18.4-alpine3.23@sha256:996d0920e4ff9df1fc19dacb904492f3c1ec0ec1cc338f0ad7123be7731c5f5e" &&
          !service.build
      );
      check(
        service.environment?.PGDATA === "/var/lib/postgresql/18/docker" &&
          service.environment.POSTGRES_PASSWORD_FILE === "/run/secrets/postgres_admin_password" &&
          service.environment.POSTGRES_DB === "niedax_generator"
      );
    } else {
      check(service.image === `${TEST_PROJECT}/${name}:${options.build.tag}`);
      check(
        resolve(String(service.build?.context)) === resolve(options.workspace) &&
          service.build?.dockerfile === dockerfiles[name]
      );
      check(
        service.build?.target === (["backend", "frontend"].includes(name) ? "runtime" : undefined)
      );
      check(
        Object.keys(service.build ?? {}).every((key) =>
          ["context", "dockerfile", "target", "args"].includes(key)
        )
      );
      const args = service.build?.args ?? {};
      const expectedArgs =
        name === "backend"
          ? {
              NIEDAX_BUILD_TIMESTAMP: options.build.buildTimestamp,
              NIEDAX_GIT_COMMIT: options.build.gitCommit
            }
          : {};
      check(
        keys(args) === keys(expectedArgs) &&
          Object.entries(expectedArgs).every(
            ([key, value]) => (args as Record<string, unknown>)[key] === value
          )
      );
    }
    const env = service.environment ?? {};
    const expectedEnvironment = fixedEnvironments[name]!;
    check(
      Object.keys(env).every(
        (key) =>
          Object.hasOwn(expectedEnvironment, key) ||
          (name === "backend" && key === "NIEDAX_FEATURE_FLAGS")
      )
    );
    check(Object.entries(expectedEnvironment).every(([key, value]) => env[key] === value));
    if (name === "backend") {
      try {
        resolveFeatureFlags("test", JSON.parse(env.NIEDAX_FEATURE_FLAGS ?? "{}"));
      } catch {
        check(false);
      }
    }
    check(
      !Object.keys(env).some((key) => /^(?:DATABASE_URL|PGPASSWORD|POSTGRES_PASSWORD)$/u.test(key))
    );
    if (["backend", "migrations", "backup"].includes(name))
      check(
        env.PGHOST === "postgres" &&
          env.PGDATABASE === "niedax_generator" &&
          env.PGSSLMODE === "disable"
      );
    if (["backend", "frontend"].includes(name))
      check(env.NIEDAX_ENV === "test" && env.NODE_ENV === "production");
    if (name === "backend")
      check(
        env.NIEDAX_TEST_PROJECT === TEST_PROJECT &&
          env.PGUSER === "niedax_generator_app" &&
          env.PGPASSWORD_FILE === "/run/secrets/postgres_app_password" &&
          env.SESSION_PEPPER_FILE === "/run/secrets/session_pepper"
      );
    if (name === "migrations")
      check(
        env.PGUSER === "niedax_generator_migrator" &&
          env.PGPASSWORD_FILE === "/run/secrets/postgres_migrator_password"
      );
  }
  const dependencies = config.services.backend!.depends_on as Record<string, { condition: string }>;
  check(
    dependencies?.postgres?.condition === "service_healthy" &&
      dependencies?.migrations?.condition === "service_completed_successfully"
  );
}

/** Refuse symlinks/junctions and hard-linked secrets before writes or Docker mounts. */
export async function assertTestPaths(workspace: string): Promise<void> {
  const root = resolve(workspace);
  const actualRoot = await realpath(root);
  const protectedPaths = [
    "data",
    "data/test",
    "data/test/postgres",
    "data/test/backups",
    "data/test/secrets",
    "data/test/deployment",
    ...TEST_SECRET_NAMES.map((name) => `data/test/secrets/${name}`),
    "data/test/secrets/accounts.json"
  ];
  async function validatePath(relative: string): Promise<void> {
    const path = resolve(root, relative);
    assert(path.startsWith(`${root}${sep}`));
    try {
      const info = await lstat(path);
      assert(!info.isSymbolicLink(), "TEST paths may not be links or junctions");
      const actual = await realpath(path);
      assert(actual.startsWith(`${actualRoot}${sep}`), "TEST path escaped workspace");
      if (info.isFile()) assert(info.nlink === 1, "TEST files may not be hard links");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  for (const relative of protectedPaths) await validatePath(relative);
  // Inspect entries only after validating the parent directory itself.
  // Metadata writes must not follow an existing owner/build/sign-off symlink.
  try {
    for (const filename of await readdir(resolve(root, "data/test/deployment")))
      await validatePath(`data/test/deployment/${filename}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export interface Stage10Acceptance {
  schemaVersion: string;
  reviewedCommit: string | null;
  runtimeImageSecurity: { status: string; reviewer: string | null; evidence: string | null };
  domainApproval: { status: string; reviewer: string | null; evidence: string | null };
}
export function assertStage10Acceptance(value: Stage10Acceptance, commit: string): void {
  assert(
    value.schemaVersion === "stage10-acceptance/v1" && value.reviewedCommit === commit,
    "Stage 10 sign-off must identify the exact deployment commit"
  );
  for (const approval of [value.runtimeImageSecurity, value.domainApproval]) {
    assert(
      approval?.status === "approved" && approval.reviewer?.trim() && approval.evidence?.trim(),
      "Stage 10 security/domain sign-off remains pending"
    );
  }
}

export function assertStage10Run(
  run: {
    conclusion?: string;
    status?: string;
    head_sha?: string;
    head_branch?: string;
    event?: string;
    path?: string;
    head_repository?: { full_name?: string };
  },
  commit: string
): void {
  assert(
    run.status === "completed" &&
      run.conclusion === "success" &&
      run.head_sha === commit &&
      run.head_branch === "main" &&
      ["push", "workflow_dispatch"].includes(run.event ?? "") &&
      run.path === ".github/workflows/stage10.yml" &&
      run.head_repository?.full_name === "MrToKa/Niedax-Generator",
    "Successful main Stage 10 CI for this exact commit is required"
  );
}
