import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SECRET_FILES = [
  "postgres_admin_password",
  "postgres_app_password",
  "postgres_migrator_password",
  "postgres_backup_password",
  "session_pepper"
] as const;

function projectPath(...segments: string[]): string {
  const root = path.resolve(process.cwd());
  const resolved = path.resolve(root, ...segments);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Refusing a path outside the project workspace");
  }
  return resolved;
}

export async function prepareLocalData(): Promise<void> {
  const directories = [
    projectPath("data"),
    projectPath("data", "postgres"),
    projectPath("data", "backups"),
    projectPath("data", "secrets")
  ];
  for (const directory of directories) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await chmod(directory, 0o700);
  }

  for (const name of SECRET_FILES) {
    const target = projectPath("data", "secrets", name);
    try {
      await writeFile(target, `${randomBytes(48).toString("base64url")}\n`, {
        flag: "wx",
        mode: 0o600
      });
      process.stdout.write(`Created data/secrets/${name}\n`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = (await readFile(target, "utf8")).trim();
      if (existing.length < 32)
        throw new Error(`Existing secret data/secrets/${name} is too short`);
    }
    if (process.platform !== "win32") await chmod(target, 0o600);
  }
  if (process.platform === "win32") {
    process.stdout.write(
      "Windows note: POSIX mode bits are not enforceable; protect data/secrets with the current user's NTFS ACL.\n"
    );
  }
  process.stdout.write(
    "Local data directories and secret files are ready; no values were displayed.\n"
  );
}
