import {
  runStage10Command,
  withStage10BrowserEnvironment
} from "./lib/stage10-browser-environment.js";

if (![undefined, "test"].includes(process.argv[2])) throw new Error("Usage: pnpm test:e2e");
await withStage10BrowserEnvironment(async (environment) => {
  const output = await runStage10Command(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(3)],
    environment.processEnv,
    Object.values(environment.accounts).map((account) => account.password)
  );
  process.stdout.write(`${output}\n`);
});
