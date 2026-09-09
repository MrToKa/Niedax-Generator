import { resolve } from "node:path";

export interface BrowserEnvironmentState {
  project: string;
  port: number;
}
interface VolumeMount {
  type: string;
  source: string;
  target: string;
  read_only?: boolean;
}
export interface BrowserComposeService {
  container_name?: string;
  image?: string;
  build?: Record<string, unknown>;
  environment?: Record<string, string>;
  volumes?: VolumeMount[];
  ports?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}
export interface BrowserComposeConfig {
  name: string;
  services: Record<string, BrowserComposeService>;
  secrets: Record<string, { file: string; external?: boolean }>;
  networks: Record<string, { name?: string; internal?: boolean; external?: boolean }>;
  volumes?: Record<string, { name?: string; external?: boolean }>;
}

const serviceNames = ["backend", "browser-seed", "frontend", "gateway", "migrations", "postgres"];
const secretNames = [
  "postgres_admin_password",
  "postgres_app_password",
  "postgres_backup_password",
  "postgres_migrator_password",
  "session_pepper"
];
const databaseTarget = "/var/lib/postgresql/18/docker";

export function checkBrowserState(state: BrowserEnvironmentState): void {
  if (!/^niedax-stage9-browser-[0-9]+$/u.test(state.project) || state.port !== 18089) {
    throw new Error("Refusing an unrecognized disposable browser environment");
  }
}

export function deriveBrowserConfig(
  source: BrowserComposeConfig,
  state: BrowserEnvironmentState,
  workspace: string,
  directory: string
): BrowserComposeConfig {
  checkBrowserState(state);
  const config = structuredClone(source);
  config.name = state.project;
  delete config.services["backup"];
  for (const [name, service] of Object.entries(config.services)) {
    service.container_name = `${state.project}-${name}`;
    if (service.build) service.image = `${state.project}/${name}:local`;
  }
  for (const network of Object.values(config.networks)) delete network.name;
  config.volumes = { disposable_database: {} };
  const postgres = config.services["postgres"];
  if (
    !postgres ||
    postgres.environment?.PGDATA !== databaseTarget ||
    postgres.volumes?.filter((volume) => volume.target === databaseTarget).length !== 1
  ) {
    throw new Error("The production database mount layout changed; disposable setup refused");
  }
  postgres.volumes = postgres.volumes.map((volume) =>
    volume.target === databaseTarget
      ? { type: "volume", source: "disposable_database", target: volume.target }
      : volume
  );
  const gateway = config.services["gateway"];
  if (!gateway) throw new Error("The production gateway is missing");
  gateway.ports = [{ target: 8080, published: "18089", host_ip: "127.0.0.1", protocol: "tcp" }];
  for (const [name, secret] of Object.entries(config.secrets)) {
    if (!secretNames.includes(name)) throw new Error("Unexpected production secret definition");
    secret.file = resolve(directory, `${name}.secret`);
  }
  config.services["browser-seed"] = {
    container_name: `${state.project}-browser-seed`,
    image: `${state.project}/browser-seed:local`,
    build: {
      context: resolve(workspace),
      dockerfile: "apps/backend/Dockerfile",
      target: "acceptance"
    },
    profiles: ["seed"],
    networks: ["backend"],
    environment: {
      NODE_ENV: "test",
      STAGE7_ACCEPTANCE: "1",
      PGHOST: "postgres",
      PGDATABASE: "niedax_generator",
      PGUSER: "niedax_generator_migrator",
      PGPASSWORD: "${STAGE9_MIGRATOR_PASSWORD:?ephemeral password required}"
    }
  };
  validateBrowserConfig(config, state, workspace, directory);
  return config;
}

/** Recheck before all operations, including down --volumes, against the saved local config. */
export function validateBrowserConfig(
  config: BrowserComposeConfig,
  state: BrowserEnvironmentState,
  workspace: string,
  directory: string
): void {
  checkBrowserState(state);
  const refuse = () => {
    throw new Error("Refusing unsafe disposable browser Compose configuration");
  };
  if (
    config.name !== state.project ||
    Object.keys(config.services).sort().join() !== serviceNames.join() ||
    Object.keys(config.secrets).sort().join() !== secretNames.join() ||
    Object.keys(config.networks).sort().join() !== "backend,edge,ingress" ||
    Object.keys(config.volumes ?? {}).join() !== "disposable_database" ||
    Object.keys(config.volumes?.disposable_database ?? {}).length !== 0
  )
    refuse();
  for (const network of Object.values(config.networks)) {
    if (network.name || network.external) refuse();
  }
  if (!config.networks.backend?.internal || !config.networks.edge?.internal) refuse();
  for (const [name, secret] of Object.entries(config.secrets)) {
    if (secret.external || resolve(secret.file) !== resolve(directory, `${name}.secret`)) refuse();
  }
  let databaseMounts = 0;
  for (const [name, service] of Object.entries(config.services)) {
    if (
      service.container_name !== `${state.project}-${name}` ||
      (service.build && service.image !== `${state.project}/${name}:local`)
    )
      refuse();
    if (name === "gateway") {
      const port = service.ports?.[0];
      if (
        service.ports?.length !== 1 ||
        port?.target !== 8080 ||
        port?.published !== "18089" ||
        port?.host_ip !== "127.0.0.1"
      )
        refuse();
    } else if (service.ports?.length) refuse();
    if (service.network_mode || service.privileged) refuse();
    for (const volume of service.volumes ?? []) {
      if (
        name === "postgres" &&
        volume.type === "volume" &&
        volume.source === "disposable_database" &&
        volume.target === databaseTarget
      ) {
        databaseMounts += 1;
        continue;
      }
      const allowedBind =
        name === "postgres" && volume.target === "/docker-entrypoint-initdb.d/010-niedax-roles.sh"
          ? "database/scripts/initialize.sh"
          : name === "gateway" && volume.target === "/etc/caddy/Caddyfile"
            ? "gateway/Caddyfile"
            : null;
      if (
        !allowedBind ||
        volume.type !== "bind" ||
        !volume.read_only ||
        resolve(volume.source) !== resolve(workspace, allowedBind)
      )
        refuse();
    }
  }
  if (databaseMounts !== 1 || config.services.postgres?.environment?.PGDATA !== databaseTarget)
    refuse();
  for (const name of ["backend", "migrations", "browser-seed"]) {
    if (
      config.services[name]?.environment?.PGHOST !== "postgres" ||
      config.services[name]?.environment?.PGDATABASE !== "niedax_generator"
    )
      refuse();
  }
}
