import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  databaseCheckComposeFile,
  validateDatabaseCheckConfig,
  validateDatabaseCheckTarget,
  type DatabaseCheckConfig
} from "../lib/db-check-config.js";

const project = "niedax-dbcheck-1234-1788960000000";
const workspace = process.cwd();
function safe(): DatabaseCheckConfig {
  const config: DatabaseCheckConfig = {
    name: project,
    networks: { database: { name: `${project}_database`, internal: true } },
    services: {
      postgres: {
        image:
          "postgres:18.4-alpine3.23@sha256:996d0920e4ff9df1fc19dacb904492f3c1ec0ec1cc338f0ad7123be7731c5f5e",
        environment: { POSTGRES_DB: "niedax_generator", POSTGRES_USER: "postgres" },
        networks: { database: {} },
        volumes: [
          {
            type: "bind",
            source: resolve(workspace, "database/scripts/initialize-test.sh"),
            target: "/docker-entrypoint-initdb.d/010-test-role.sh",
            read_only: true
          }
        ]
      }
    }
  };
  for (const name of ["migrations", "verify", "stage7-acceptance", "stage8-acceptance"])
    config.services[name] = {
      build: {
        context: workspace,
        dockerfile:
          name === "stage7-acceptance"
            ? "apps/backend/Dockerfile"
            : "database/Dockerfile.migrations",
        ...(name === "stage7-acceptance" ? { target: "acceptance" } : {})
      },
      environment: {
        PGHOST: "postgres",
        PGDATABASE: "niedax_generator",
        PGUSER: "niedax_generator_migrator",
        NODE_ENV: "test",
        STAGE7_ACCEPTANCE: "1"
      },
      networks: { database: {} }
    };
  return config;
}

describe("Stage 10 disposable PostgreSQL operation guards", () => {
  it("accepts the isolated no-host-port configuration and exact Compose path", () => {
    expect(() =>
      validateDatabaseCheckTarget(project, databaseCheckComposeFile, workspace)
    ).not.toThrow();
    expect(() => validateDatabaseCheckConfig(safe(), project, workspace)).not.toThrow();
  });

  it.each(["niedax-generator", "niedax-dbcheck", "niedax-dbcheck-1234-1788960000000-extra"])(
    "rejects unrecognized project %s before any cleanup",
    (name) => {
      expect(() =>
        validateDatabaseCheckTarget(name, databaseCheckComposeFile, workspace)
      ).toThrow();
    }
  );

  it("rejects the normal Compose file even with a disposable-looking project", () => {
    expect(() => validateDatabaseCheckTarget(project, "compose.yaml", workspace)).toThrow();
  });

  it.each([
    [
      "published database port",
      (config: DatabaseCheckConfig) => {
        config.services.postgres!.ports = [{ published: 5432 }];
      }
    ],
    [
      "persistent project bind",
      (config: DatabaseCheckConfig) => {
        config.services.postgres!.volumes![0]!.source = resolve(workspace, "data/postgres");
      }
    ],
    [
      "writeable init bind",
      (config: DatabaseCheckConfig) => {
        config.services.postgres!.volumes![0]!.read_only = false;
      }
    ],
    [
      "external volume",
      (config: DatabaseCheckConfig) => {
        config.volumes = { normal_project: { external: true } };
      }
    ],
    [
      "external network",
      (config: DatabaseCheckConfig) => {
        config.networks.database!.external = true;
      }
    ],
    [
      "missing credentialed acceptance",
      (config: DatabaseCheckConfig) => {
        config.services["stage7-acceptance"]!.environment!.STAGE7_ACCEPTANCE = "0";
      }
    ],
    [
      "foreign database host",
      (config: DatabaseCheckConfig) => {
        config.services.verify!.environment!.PGHOST = "host.docker.internal";
      }
    ],
    [
      "normal container name",
      (config: DatabaseCheckConfig) => {
        config.services.postgres!.container_name = "niedax-postgres";
      }
    ]
  ] as const)("rejects %s", (_description, mutate) => {
    const config = safe();
    mutate(config);
    expect(() => validateDatabaseCheckConfig(config, project, workspace)).toThrow();
  });
});
