import { randomBytes } from "node:crypto";

import { run } from "./lib/process.js";

const project = `niedax-dbcheck-${process.pid}-${Date.now()}`.toLowerCase();
const composeFile = "database/tests/compose.check.yaml";
const environment = {
  ...process.env,
  DB_CHECK_PASSWORD: randomBytes(32).toString("base64url")
};

try {
  run("docker", ["compose", "-p", project, "-f", composeFile, "build", "migrations", "verify"], {
    env: environment
  });
  run(
    "docker",
    ["compose", "-p", project, "-f", composeFile, "up", "--detach", "--wait", "postgres"],
    { env: environment }
  );
  run(
    "docker",
    ["compose", "-p", project, "-f", composeFile, "run", "--rm", "--no-deps", "migrations"],
    { env: environment }
  );
  run(
    "docker",
    ["compose", "-p", project, "-f", composeFile, "run", "--rm", "--no-deps", "verify"],
    { env: environment }
  );
  run(
    "docker",
    ["compose", "-p", project, "-f", composeFile, "down", "--volumes", "--remove-orphans"],
    { env: environment }
  );
  run(
    "docker",
    ["compose", "-p", project, "-f", composeFile, "up", "--detach", "--wait", "postgres"],
    { env: environment }
  );
  run(
    "docker",
    ["compose", "-p", project, "-f", composeFile, "run", "--rm", "--no-deps", "migrations"],
    { env: environment }
  );
  run(
    "docker",
    ["compose", "-p", project, "-f", composeFile, "run", "--rm", "--no-deps", "verify"],
    { env: environment }
  );
} finally {
  run(
    "docker",
    ["compose", "-p", project, "-f", composeFile, "down", "--volumes", "--remove-orphans"],
    { env: environment, allowFailure: true }
  );
}
