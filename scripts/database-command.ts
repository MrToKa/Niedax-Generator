import { compose } from "./lib/process.js";
import { prepareLocalData } from "./lib/setup.js";

const command = process.argv[2];
if (command !== "up" && command !== "status" && command !== "seed")
  throw new Error("Database command must be up, status, or seed");
await prepareLocalData();
compose(["up", "--detach", "postgres"]);
if (command === "seed") {
  compose(["run", "--rm", "migrations", "node", "dist/migrate.js", "up"]);
  compose(["run", "--rm", "migrations", "node", "dist/seed.js"]);
} else {
  compose(["run", "--rm", "migrations", "node", "dist/migrate.js", command]);
}
