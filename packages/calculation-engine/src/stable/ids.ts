function encodePart(part: string): string {
  return `${part.length}:${part}`;
}

export function stableKey(parts: readonly string[]): string {
  return parts.map(encodePart).join("|");
}

export function stableId(prefix: string, parts: readonly string[]): string {
  const value = stableKey(parts);
  let hash = 14_695_981_039_346_656_037n;
  const prime = 1_099_511_628_211n;
  const mask = 18_446_744_073_709_551_615n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return `${prefix}-${hash.toString(16).padStart(16, "0")}`;
}
