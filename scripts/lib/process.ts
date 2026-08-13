import { spawnSync } from "node:child_process";

export interface RunOptions {
  readonly capture?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly allowFailure?: boolean;
}

export function run(command: string, args: readonly string[], options: RunOptions = {}): string {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    shell: false
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0 && !options.allowFailure) {
    const detail = options.capture ? `\n${result.stderr.trim()}` : "";
    throw new Error(`${command} exited with status ${result.status ?? "unknown"}${detail}`);
  }
  return options.capture ? result.stdout.trim() : "";
}

export function compose(args: readonly string[], options: RunOptions = {}): string {
  return run("docker", ["compose", ...args], options);
}
