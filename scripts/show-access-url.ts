import { privateLanAddresses } from "./lib/network.js";

process.stdout.write("Local: http://localhost:8080\n");
const addresses = privateLanAddresses();
if (addresses.length === 0) {
  process.stdout.write("No usable private IPv4 LAN address was detected.\n");
} else {
  for (const address of addresses) process.stdout.write(`LAN:   http://${address}:8080\n`);
}
