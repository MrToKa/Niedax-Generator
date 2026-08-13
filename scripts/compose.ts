import { compose } from "./lib/process.js";
import { prepareLocalData } from "./lib/setup.js";

type Action = "dev" | "logs" | "restart" | "start" | "status" | "stop";
const action = process.argv[2] as Action | undefined;

async function start(): Promise<void> {
  await prepareLocalData();
  compose(["--profile", "tools", "build"]);
  compose(["up", "--detach", "--remove-orphans"]);
  compose(["ps"]);
}

switch (action) {
  case "dev":
    await prepareLocalData();
    compose(["-f", "compose.yaml", "-f", "compose.dev.yaml", "up", "--build", "--remove-orphans"]);
    break;
  case "start":
    await start();
    break;
  case "stop":
    compose(["down", "--remove-orphans"]);
    break;
  case "restart":
    compose(["down", "--remove-orphans"]);
    await start();
    break;
  case "status":
    compose(["ps"]);
    break;
  case "logs":
    compose(["logs", "--tail", "200"]);
    break;
  default:
    throw new Error("Usage: compose.ts {dev|start|stop|restart|status|logs}");
}
