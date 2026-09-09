/** Synthetic transport/browser evidence only; these are not confirmed Niedax products. */
export const stage10Catalog = {
  catalog: "a1000000-0000-4000-8000-000000000001",
  rules: "a1000000-0000-4000-8000-000000000002",
  source: "a1000000-0000-4000-8000-000000000003",
  straight: "a1000000-0000-4000-8000-000000000004",
  support: "a1000000-0000-4000-8000-000000000005",
  connector: "a1000000-0000-4000-8000-000000000006",
  template: "a1000000-0000-4000-8000-000000000007",
  anchor: "a1000000-0000-4000-8000-000000000008",
  version: "stage10-synthetic-v1",
  system: "S10-SYN",
  supply: "supply:a1000000-0000-4000-8000-000000000004:6000"
} as const;

export const stage10AccountNames = [
  "administrator",
  "designer",
  "reviewer",
  "viewer",
  "otherDesigner"
] as const;
export type Stage10AccountName = (typeof stage10AccountNames)[number];
export type Stage10Accounts = Record<Stage10AccountName, { username: string; password: string }>;

export function readStage10Accounts(): Stage10Accounts {
  const value = process.env.STAGE10_ACCOUNTS_JSON;
  if (!value)
    throw new Error("Generated Stage 10 accounts are required; use test:e2e orchestration");
  const accounts = JSON.parse(value) as Stage10Accounts;
  for (const name of stage10AccountNames) {
    if (!accounts[name]?.username.startsWith("stage10.") || !accounts[name]?.password)
      throw new Error("Invalid synthetic account configuration");
  }
  return accounts;
}
