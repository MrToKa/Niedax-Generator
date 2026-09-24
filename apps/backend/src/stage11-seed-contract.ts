export const stage11AccountRoles = ["administrator", "designer", "reviewer", "viewer"] as const;
export type Stage11Role = (typeof stage11AccountRoles)[number];
export type Stage11Accounts = Record<Stage11Role, { username: string; password: string }>;

/** Reject foreign credentials without ever including their contents in an error. */
export function parseStage11Accounts(value: unknown): Stage11Accounts {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid TEST account file");
  const accounts = value as Stage11Accounts;
  if (Object.keys(accounts).sort().join() !== [...stage11AccountRoles].sort().join())
    throw new Error("TEST account file must contain exactly the four canonical roles");
  for (const role of stage11AccountRoles) {
    const account = accounts[role];
    if (
      !account ||
      account.username !== `test.${role}` ||
      typeof account.password !== "string" ||
      account.password.length < 32 ||
      account.password.length > 1024 ||
      !/[a-z]/u.test(account.password) ||
      !/[A-Z]/u.test(account.password) ||
      !/[0-9]/u.test(account.password) ||
      !/[^A-Za-z0-9]/u.test(account.password)
    )
      throw new Error("Invalid persistent TEST account configuration");
  }
  return accounts;
}

export function assertStage11SeedEnvironment(environment: NodeJS.ProcessEnv): void {
  if (
    environment.NIEDAX_ENV !== "test" ||
    environment.NIEDAX_TEST_PROJECT !== "niedax-test" ||
    environment.PGHOST !== "postgres" ||
    environment.PGUSER !== "niedax_generator_app"
  )
    throw new Error("Refusing seed outside the validated persistent TEST environment");
}
