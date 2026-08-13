import { networkInterfaces } from "node:os";

function isPrivate(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

const SECONDARY_ADAPTER = /(docker|veth|wsl|hyper-v|virtual|vpn|tailscale|zerotier)/iu;

export function privateLanAddresses(): string[] {
  const primary: string[] = [];
  const secondary: string[] = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (
        entry.family !== "IPv4" ||
        entry.internal ||
        !isPrivate(entry.address) ||
        entry.address.startsWith("169.254.")
      )
        continue;
      (SECONDARY_ADAPTER.test(name) ? secondary : primary).push(entry.address);
    }
  }
  return [...new Set(primary.length > 0 ? primary : secondary)].sort();
}
