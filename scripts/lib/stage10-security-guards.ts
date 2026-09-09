import assert from "node:assert/strict";

/** Decide before opening a path; generated credentials must never reach the scanner. */
export function classifySecuritySource(path: string): "reject" | "scan" | "skip" {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  if (
    (/\/(?:\.env(?:\.[^/]+)?)$/u.test(`/${normalized}`) &&
      !normalized.endsWith("/.env.example") &&
      normalized !== ".env.example") ||
    /^(?:data\/)|\.(?:dump|secret|pem|key|pfx|p12)$|storage-state[^/]*\.json$/u.test(normalized)
  )
    return "reject";
  return /\.(?:ts|tsx|js|jsx|cjs|mjs|json|yaml|yml|md|txt|html|css|scss|sql|csv|sh|ps1|toml|ini|conf|config)$|(?:^|\/)(?:dockerfile|caddyfile)(?:\.[^/]+)?$|(?:^|\/)\.env\.example$/u.test(
    normalized
  )
    ? "scan"
    : "skip";
}

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /(?:ghp|gho|github_pat)_[A-Za-z0-9_]{30,}/u,
  /AKIA[0-9A-Z]{16}/u,
  /postgres(?:ql)?:\/\/[^\s/:]+:[^\s/@]+@/u
];

/** Return bounded categories only, never the matching credential or surrounding content. */
export function securityTextFindings(path: string, content: string, built = false): string[] {
  const categories: string[] = [];
  if (secretPatterns.some((pattern) => pattern.test(content)))
    categories.push(built ? "built-credential-signature" : "credential-signature");
  const runtimeSource = /^(?:apps\/[^/]+\/src\/|packages\/[^/]+\/src\/|gateway\/)/u.test(
    path.replaceAll("\\", "/")
  );
  if (
    (built || runtimeSource) &&
    /(?:src|href)=["']https?:\/\/|url\(["']?https?:\/\/|(?:from|import)\s*["']https?:\/\//u.test(
      content
    )
  )
    categories.push(built ? "built-external-asset" : "external-runtime-asset");
  return categories;
}

export function assertBuiltAssetDiscovery(
  frontend: readonly string[],
  backend: readonly string[]
): void {
  assert(frontend.length > 0, "Frontend runtime asset scan discovered zero files");
  assert(backend.length > 0, "Backend runtime asset scan discovered zero files");
}
