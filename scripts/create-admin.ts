import { compose } from "./lib/process.js";
import { prepareLocalData } from "./lib/setup.js";

await prepareLocalData();
compose(["up", "--detach", "postgres", "migrations", "backend"]);
compose(["exec", "backend", "node", "dist/cli/create-admin.js"]);
