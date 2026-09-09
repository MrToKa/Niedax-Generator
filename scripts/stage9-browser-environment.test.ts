import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkBrowserState,
  deriveBrowserConfig,
  validateBrowserConfig,
  type BrowserComposeConfig
} from "./lib/stage9-browser-config.js";
import { deriveStage10Config, validateStage10Config } from "./lib/stage10-browser-environment.js";

const workspace = resolve(".");
const directory = resolve(workspace, ".artifacts/stage9-browser");
const state = { project: "niedax-stage9-browser-123456789", port: 18089 };

function productionFixture(): BrowserComposeConfig {
  const config: BrowserComposeConfig = {
    name: "niedax-generator",
    services: {
      postgres: {
        container_name: "niedax-postgres",
        image: "postgres:pinned",
        environment: { PGDATA: "/var/lib/postgresql/18/docker" },
        volumes: [
          {
            type: "bind",
            source: resolve(workspace, "data/postgres"),
            target: "/var/lib/postgresql/18/docker"
          },
          {
            type: "bind",
            source: resolve(workspace, "database/scripts/initialize.sh"),
            target: "/docker-entrypoint-initdb.d/010-niedax-roles.sh",
            read_only: true
          }
        ]
      },
      migrations: {
        build: {},
        image: "niedax-generator/migrations:0.1.0",
        environment: { PGHOST: "postgres", PGDATABASE: "niedax_generator" }
      },
      backend: {
        build: {},
        image: "niedax-generator/backend:0.1.0",
        environment: { PGHOST: "postgres", PGDATABASE: "niedax_generator" }
      },
      frontend: { build: {}, image: "niedax-generator/frontend:0.1.0" },
      gateway: {
        build: {},
        image: "niedax-generator/gateway:0.1.0",
        ports: [{ target: 8080, published: "8080", host_ip: "0.0.0.0" }],
        volumes: [
          {
            type: "bind",
            source: resolve(workspace, "gateway/Caddyfile"),
            target: "/etc/caddy/Caddyfile",
            read_only: true
          }
        ]
      },
      backup: {
        volumes: [{ type: "bind", source: resolve(workspace, "data/backups"), target: "/backups" }]
      }
    },
    secrets: Object.fromEntries(
      [
        "postgres_admin_password",
        "postgres_app_password",
        "postgres_backup_password",
        "postgres_migrator_password",
        "session_pepper"
      ].map((name) => [name, { file: resolve(workspace, "data/secrets", name) }])
    ),
    networks: {
      backend: { name: "niedax-generator-backend", internal: true },
      edge: { name: "niedax-generator-edge", internal: true },
      ingress: { name: "niedax-generator-ingress" }
    }
  };
  return config;
}

describe("disposable Stage 9 browser environment containment", () => {
  it("replaces persistent storage, names, images, secrets and gateway exposure without editing the source config", () => {
    const source = productionFixture();
    const original = structuredClone(source);
    const config = deriveBrowserConfig(source, state, workspace, directory);
    expect(source).toEqual(original);
    expect(config.services["postgres"]?.volumes?.[0]).toEqual({
      type: "volume",
      source: "disposable_database",
      target: "/var/lib/postgresql/18/docker"
    });
    expect(config.services["gateway"]?.ports).toEqual([
      { target: 8080, published: "18089", host_ip: "127.0.0.1", protocol: "tcp" }
    ]);
    expect(config.services["backup"]).toBeUndefined();
    expect(config.networks).toEqual({
      backend: { internal: true },
      edge: { internal: true },
      ingress: {}
    });
    expect(config.services["backend"]?.image).toBe(`${state.project}/backend:local`);
    expect(config.services["browser-seed"]?.environment?.PGPASSWORD).toBe(
      "${STAGE9_MIGRATOR_PASSWORD:?ephemeral password required}"
    );
    expect(Object.values(config.secrets).every((secret) => secret.file.startsWith(directory))).toBe(
      true
    );
  });

  it("refuses layout drift before a normal database bind could survive the derivation", () => {
    const source = productionFixture();
    source.services["postgres"]!.volumes![0]!.target = "/var/lib/postgresql/new-location";
    expect(() => deriveBrowserConfig(source, state, workspace, directory)).toThrow(
      "mount layout changed"
    );
  });

  it.each([
    [
      "normal project name",
      (config: BrowserComposeConfig) => {
        config.name = "niedax-generator";
      }
    ],
    [
      "normal container",
      (config: BrowserComposeConfig) => {
        config.services["postgres"]!.container_name = "niedax-postgres";
      }
    ],
    [
      "normal database bind",
      (config: BrowserComposeConfig) => {
        config.services["postgres"]!.volumes![0] = {
          type: "bind",
          source: resolve(workspace, "data/postgres"),
          target: "/var/lib/postgresql/18/docker"
        };
      }
    ],
    [
      "normal named volume",
      (config: BrowserComposeConfig) => {
        config.volumes!.disposable_database = { name: "niedax-generator-database" };
      }
    ],
    [
      "external network",
      (config: BrowserComposeConfig) => {
        config.networks.backend!.external = true;
      }
    ],
    [
      "normal network",
      (config: BrowserComposeConfig) => {
        config.networks.backend!.name = "niedax-generator-backend";
      }
    ],
    [
      "normal secrets",
      (config: BrowserComposeConfig) => {
        config.secrets.postgres_app_password!.file = resolve(
          workspace,
          "data/secrets/postgres_app_password"
        );
      }
    ],
    [
      "database host port",
      (config: BrowserComposeConfig) => {
        config.services.postgres!.ports = [{ target: 5432, published: "5432" }];
      }
    ],
    [
      "public gateway",
      (config: BrowserComposeConfig) => {
        config.services.gateway!.ports![0]!.host_ip = "0.0.0.0";
      }
    ],
    [
      "host networking",
      (config: BrowserComposeConfig) => {
        config.services.backend!.network_mode = "host";
      }
    ],
    [
      "production database host",
      (config: BrowserComposeConfig) => {
        config.services["browser-seed"]!.environment!.PGHOST = "host.docker.internal";
      }
    ],
    [
      "unrecognized writable bind",
      (config: BrowserComposeConfig) => {
        config.services.frontend!.volumes = [
          { type: "bind", source: workspace, target: "/workspace" }
        ];
      }
    ]
  ])("refuses saved config with %s before status/down", (_name, mutate) => {
    const config = deriveBrowserConfig(productionFixture(), state, workspace, directory);
    mutate(config);
    expect(() => validateBrowserConfig(config, state, workspace, directory)).toThrow(
      "unsafe disposable"
    );
  });

  it("requires the reserved project prefix and loopback test port", () => {
    expect(() => checkBrowserState({ project: "niedax-generator", port: 18089 })).toThrow();
    expect(() => checkBrowserState({ project: state.project, port: 8080 })).toThrow();
  });
});

describe("automated Stage 10 browser environment containment", () => {
  const project = "niedax-stage10-1234-56789";
  const path = resolve(workspace, ".artifacts/stage10-browser", project);
  const port = 49123;
  it("retains hardened topology while isolating generated secrets and the loopback gateway", () => {
    const source = productionFixture();
    const original = structuredClone(source);
    const config = deriveStage10Config(source, project, port, workspace, path);
    expect(source).toEqual(original);
    expect(config.services.gateway?.ports).toEqual([
      { target: 8080, published: String(port), host_ip: "127.0.0.1", protocol: "tcp" }
    ]);
    expect(config.services["browser-seed"]?.environment).not.toHaveProperty("PGPASSWORD");
    expect(config.services["browser-seed"]?.read_only).toBe(true);
    expect(config.services["browser-seed"]?.cap_drop).toEqual(["ALL"]);
    expect(config.services["browser-seed"]?.environment?.STAGE10_ACCOUNTS_JSON).toBe(
      "${STAGE10_ACCOUNTS_JSON:?generated accounts required}"
    );
    expect(config.services.postgres?.volumes?.[0]?.source).toBe("disposable_database");
    validateStage10Config(config, project, port, workspace, path);
  });
  it.each([
    ["normal project", "niedax-generator", path, port],
    ["outside directory", project, resolve(workspace, "data/postgres"), port],
    ["invalid port", project, path, 70000],
    ["privileged port", project, path, 80]
  ])("refuses %s before any disposable command", (_label, name, directory, selectedPort) => {
    expect(() =>
      deriveStage10Config(
        productionFixture(),
        String(name),
        Number(selectedPort),
        workspace,
        String(directory)
      )
    ).toThrow();
  });
  it.each([
    [
      "public gateway",
      (config: BrowserComposeConfig) => {
        config.services.gateway!.ports![0]!.host_ip = "0.0.0.0";
      }
    ],
    [
      "normal database bind",
      (config: BrowserComposeConfig) => {
        config.services.postgres!.volumes![0]!.type = "bind";
        config.services.postgres!.volumes![0]!.source = resolve(workspace, "data/postgres");
      }
    ],
    [
      "normal container name",
      (config: BrowserComposeConfig) => {
        config.services.postgres!.container_name = "niedax-postgres";
      }
    ],
    [
      "external volume",
      (config: BrowserComposeConfig) => {
        config.volumes!.disposable_database = { external: true };
      }
    ],
    [
      "host database port",
      (config: BrowserComposeConfig) => {
        config.services.postgres!.ports = [{ target: 5432, published: "5432" }];
      }
    ],
    [
      "normal secret path",
      (config: BrowserComposeConfig) => {
        config.secrets.postgres_app_password!.file = resolve(
          workspace,
          "data/secrets/postgres_app_password"
        );
      }
    ]
  ])("rechecks and rejects %s before down --volumes", (_label, mutate) => {
    const config = deriveStage10Config(productionFixture(), project, port, workspace, path);
    mutate(config);
    expect(() => validateStage10Config(config, project, port, workspace, path)).toThrow();
  });
});
