import { readFileSync } from "node:fs";

export interface RuntimeConfig {
  readonly host: string;
  readonly port: number;
  readonly cookieSecure: boolean;
  readonly sessionPepper: string;
  readonly database: {
    readonly host: string;
    readonly port: number;
    readonly database: string;
    readonly user: string;
    readonly password: string;
    readonly max: number;
  };
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Required configuration ${name} is missing`);
  return value;
}

function readSecretFile(name: string): string {
  const file = required(name);
  const value = readFileSync(file, "utf8").trim();
  if (!value) throw new Error(`Secret file configured by ${name} is empty`);
  return value;
}

export function loadRuntimeConfig(): RuntimeConfig {
  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? "3001"),
    cookieSecure: process.env.COOKIE_SECURE === "true",
    sessionPepper: readSecretFile("SESSION_PEPPER_FILE"),
    database: {
      host: required("PGHOST", "postgres"),
      port: Number(process.env.PGPORT ?? "5432"),
      database: required("PGDATABASE", "niedax_generator"),
      user: required("PGUSER", "niedax_generator_app"),
      password: readSecretFile("PGPASSWORD_FILE"),
      max: Number(process.env.PGPOOL_MAX ?? "10")
    }
  };
}
