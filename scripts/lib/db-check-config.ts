import { resolve } from "node:path";

export const databaseCheckComposeFile = "database/tests/compose.check.yaml";

interface Service {
  image?: string;
  build?: { context?: string; dockerfile?: string; target?: string };
  container_name?: string;
  ports?: unknown[];
  privileged?: boolean;
  network_mode?: string;
  networks?: Record<string, unknown>;
  environment?: Record<string, string>;
  volumes?: Array<{ type: string; source: string; target: string; read_only?: boolean }>;
}

export interface DatabaseCheckConfig {
  name: string;
  services: Record<string, Service>;
  networks: Record<string, { name?: string; internal?: boolean; external?: boolean }>;
  volumes?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
}

export function validateDatabaseCheckTarget(
  project: string,
  composeFile: string,
  workspace: string
): void {
  if (
    !/^niedax-dbcheck-[0-9]+-[0-9]{13}$/u.test(project) ||
    resolve(composeFile) !== resolve(workspace, databaseCheckComposeFile)
  ) {
    throw new Error("Refusing an unrecognized disposable database project or Compose path");
  }
}

/** Config is parsed in memory: its ephemeral password is never returned or logged. */
export function validateDatabaseCheckConfig(
  config: DatabaseCheckConfig,
  project: string,
  workspace: string
): void {
  validateDatabaseCheckTarget(project, databaseCheckComposeFile, workspace);
  const refuse = () => {
    throw new Error("Refusing unsafe disposable database Compose configuration");
  };
  if (
    config.name !== project ||
    Object.keys(config.services).sort().join() !==
      "migrations,postgres,stage7-acceptance,stage8-acceptance,verify" ||
    Object.keys(config.networks).join() !== "database" ||
    Object.keys(config.volumes ?? {}).length ||
    Object.keys(config.secrets ?? {}).length
  )
    refuse();
  const network = config.networks.database;
  if (
    !network?.internal ||
    network.external ||
    (network.name && network.name !== `${project}_database`)
  )
    refuse();
  for (const [name, service] of Object.entries(config.services)) {
    if (
      service.container_name ||
      service.privileged ||
      service.network_mode ||
      service.ports?.length ||
      Object.keys(service.networks ?? {}).join() !== "database"
    )
      refuse();
    if (name === "postgres") {
      if (
        service.image !==
          "postgres:18.4-alpine3.23@sha256:996d0920e4ff9df1fc19dacb904492f3c1ec0ec1cc338f0ad7123be7731c5f5e" ||
        service.build ||
        service.environment?.POSTGRES_DB !== "niedax_generator" ||
        service.environment.POSTGRES_USER !== "postgres"
      )
        refuse();
      const mount = service.volumes?.[0];
      if (
        service.volumes?.length !== 1 ||
        mount?.type !== "bind" ||
        !mount.read_only ||
        mount.target !== "/docker-entrypoint-initdb.d/010-test-role.sh" ||
        resolve(mount.source) !== resolve(workspace, "database/scripts/initialize-test.sh")
      )
        refuse();
    } else {
      if (
        service.volumes?.length ||
        service.environment?.PGHOST !== "postgres" ||
        service.environment.PGDATABASE !== "niedax_generator" ||
        service.environment.PGUSER !== "niedax_generator_migrator" ||
        service.environment.NODE_ENV !== "test"
      )
        refuse();
      if (
        resolve(service.build?.context ?? ".") !== resolve(workspace) ||
        service.build?.dockerfile !==
          (name === "stage7-acceptance"
            ? "apps/backend/Dockerfile"
            : "database/Dockerfile.migrations") ||
        (name === "stage7-acceptance" && service.build?.target !== "acceptance")
      )
        refuse();
      if (service.image && service.image !== `${project}-${name}`) refuse();
    }
  }
  if (config.services["stage7-acceptance"]?.environment?.STAGE7_ACCEPTANCE !== "1") refuse();
}
