import { spawn } from "node:child_process";

/** Never replay raw child errors: Docker and database errors can contain credentials. */
export async function runTestCommand(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  input?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    const collect = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes <= 16 * 1024 * 1024) chunks.push(chunk);
      else child.kill();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", () => {
      /* Deliberately omit raw diagnostic output. */
    });
    child.stdin.on("error", () => {
      /* Exit status is authoritative. */
    });
    child.once("error", () => reject(new Error(`${command} could not start`)));
    child.once("close", (code) =>
      code === 0 && bytes <= 16 * 1024 * 1024
        ? resolve(Buffer.concat(chunks).toString("utf8").trim())
        : reject(
            new Error(
              `${command} failed (exit ${code ?? "unknown"}); inspect bounded TEST service logs locally`
            )
          )
    );
    child.stdin.end(input);
  });
}
