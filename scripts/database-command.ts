import { compose } from "./lib/process.js";
import { prepareLocalData } from "./lib/setup.js";

const command = process.argv[2];
if (command !== "up" && command !== "status")
  throw new Error("Database command must be up or status");
await prepareLocalData();
compose(["up", "--detach", "postgres"]);
compose(["run", "--rm", "migrations", "node", "dist/migrate.js", command]);
