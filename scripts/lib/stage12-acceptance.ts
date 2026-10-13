import { createHash } from "node:crypto";
import {
  canonicalJson,
  type JsonValue
} from "../../packages/calculation-engine/src/stable/canonical-json.js";
import { assertStage10Run } from "./stage11-config.js";

export const STAGE12_IDENTITY_KEYS = [
  "applicationVersion",
  "deployedCommit",
  "buildTimestamp",
  "sourceFingerprint",
  "sourceState",
  "environmentId",
  "testUrl",
  "frontendImage",
  "backendImage",
  "gatewayImage",
  "postgresImage",
  "migrationsImage",
  "backupImage",
  "lockfileHash",
  "migrationHistoryHash",
  "catalogId",
  "catalogVersion",
  "catalogHash",
  "ruleId",
  "ruleVersion",
  "ruleHash",
  "engineVersion",
  "formulaCatalogVersion",
  "formulaCatalogHash",
  "exportTemplateVersion",
  "exportTemplateHash",
  "exportMappingVersion",
  "exportMappingHash",
  "exportRendererVersion",
  "exportRendererHash",
  "featureFlagsHash",
  "regressionManifestHash",
  "scenarioInputsHash",
  "expectedResultsHash",
  "demoDatasetHash",
  "savedRevisionsHash",
  "exportsHash"
] as const;
export const STAGE12_CRITERION_IDS = [
  "E01",
  "E02",
  "E03",
  "E04",
  "E05",
  "E06",
  "E07",
  "E08",
  "E09",
  "E10",
  "E11"
] as const;
export type Stage12Status = "pass" | "fail" | "pending" | "blocked";
export type Stage12EvidenceKind =
  | "automated-check"
  | "document-review"
  | "remote-ci"
  | "deployment"
  | "smoke"
  | "image-security"
  | "domain-review"
  | "performance-review"
  | "backup-restore"
  | "native-excel";
export interface Stage12Evidence {
  reference: string;
  sha256: string;
  observedAt: string;
  kind: Stage12EvidenceKind;
  scope: "candidate" | "implementation";
  environmentId: string | null;
  deployedCommit: string | null;
  run?: Parameters<typeof assertStage10Run>[0];
}
export interface Stage12Criterion {
  id: (typeof STAGE12_CRITERION_IDS)[number];
  status: Stage12Status;
  candidateDigest: string | null;
  evidence: Stage12Evidence[];
  responsibleRole: string;
  nextAction: string;
}
export interface Stage12HumanRecord {
  name: string;
  role: string;
  at: string;
  reference: string;
}
export interface Stage12Defect {
  id: string;
  severity: 1 | 2 | 3 | 4 | null;
  blocking: boolean;
  status: "open" | "fixed" | "verified" | "accepted";
  baselineId: string;
  reference: string;
  residualAcceptance: Stage12HumanRecord | null;
}
export interface Stage12Signoff extends Stage12HumanRecord {
  role: "product-owner/domain-reviewer" | "technical-owner";
  candidateId: string;
  candidateDigest: string;
  evidenceDigest: string;
  decision: "GO" | "NO-GO";
}
export interface Stage12Artifact {
  id: string;
  path: string;
  sha256: string;
  hashMode: "file-bytes" | "normalized-text" | "canonical-json";
}
/** Fixed source bindings cannot be changed by renaming an artifact or hashing another file.
 * Runtime/database inventories and the private original template have separate evidence scopes. */
export const STAGE12_REPOSITORY_HASH_BINDINGS = {
  lockfileHash: { path: "pnpm-lock.yaml", hashMode: "file-bytes" },
  formulaCatalogHash: {
    path: "packages/calculation-engine/src/trace/formula-catalog.ts",
    hashMode: "normalized-text"
  },
  regressionManifestHash: {
    path: "docs/testing/stage10-regression-manifest.json",
    hashMode: "normalized-text"
  },
  expectedResultsHash: {
    path: "packages/calculation-engine/tests/fixtures/stage10-expected.json",
    hashMode: "canonical-json"
  },
  scenarioInputsHash: {
    path: "docs/testing/stage12-scenario-identities.json",
    hashMode: "canonical-json"
  },
  demoDatasetHash: {
    path: "apps/backend/src/stage11-demo-projects.ts",
    hashMode: "normalized-text"
  },
  exportMappingHash: {
    path: "docs/testing/stage12-export-mapping.json",
    hashMode: "canonical-json"
  },
  exportRendererHash: { path: "packages/export/src/renderer.ts", hashMode: "normalized-text" }
} as const satisfies Partial<
  Record<(typeof STAGE12_IDENTITY_KEYS)[number], Pick<Stage12Artifact, "path" | "hashMode">>
>;
export interface Stage12Acceptance {
  schemaVersion: "stage12-acceptance/v1";
  hashing: { algorithm: "sha256"; canonicalization: "engine-canonical-json/v1" };
  authoring: Record<string, JsonValue>;
  candidate: {
    id: string;
    createdAt: string;
    identity: Record<(typeof STAGE12_IDENTITY_KEYS)[number], string | null>;
    operationallyAccepted: boolean;
    freeze: {
      status: "provisional" | "frozen";
      frozenAt: string | null;
      evidenceDigest: string | null;
    };
  };
  artifacts: Stage12Artifact[];
  criteria: Stage12Criterion[];
  defects: Stage12Defect[];
  signoffs: Stage12Signoff[];
}
export interface Stage12Report {
  schemaVersion: "stage12-report/v1";
  valid: boolean;
  decision: "GO" | "NO-GO";
  candidateId: string | null;
  candidateDigest: string | null;
  evidenceDigest: string | null;
  freezeStatus: "provisional" | "frozen" | null;
  errors: string[];
  blockers: string[];
}

const HASH = /^sha256:[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const KINDS = [
  "automated-check",
  "document-review",
  "remote-ci",
  "deployment",
  "smoke",
  "image-security",
  "domain-review",
  "performance-review",
  "backup-restore",
  "native-excel"
];
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function record(value: unknown, label: string): Record<string, unknown> {
  requireValue(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label}: expected object`
  );
  return value as Record<string, unknown>;
}
function shape(
  value: unknown,
  keys: readonly string[],
  label: string,
  optional: string[] = []
): Record<string, unknown> {
  const result = record(value, label);
  requireValue(
    keys.every((key) => Object.hasOwn(result, key)) &&
      Object.keys(result).every((key) => keys.includes(key) || optional.includes(key)),
    `${label}: unexpected or missing fields`
  );
  return result;
}
function text(value: unknown, label: string): asserts value is string {
  requireValue(
    typeof value === "string" &&
      !!value.trim() &&
      Array.from(value).every((character) => character.charCodeAt(0) > 31),
    `${label}: expected nonempty safe text`
  );
}
function nullableText(value: unknown, label: string): void {
  if (value !== null) text(value, label);
}
function hash(value: unknown, label: string): void {
  requireValue(
    typeof value === "string" && HASH.test(value) && !/^sha256:([a-f0-9])\1{63}$/u.test(value),
    `${label}: expected genuine SHA256 digest`
  );
}
function timestamp(value: unknown, label: string): void {
  requireValue(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().replace(".000Z", "Z") === value.replace(".000Z", "Z"),
    `${label}: expected UTC timestamp`
  );
}
function list(value: unknown, label: string): unknown[] {
  requireValue(Array.isArray(value), `${label}: expected array`);
  return value;
}
function unique(values: readonly { id: string }[], label: string): void {
  requireValue(
    new Set(values.map((item) => item.id)).size === values.length,
    `${label}: duplicate IDs`
  );
}
function human(
  value: unknown,
  label: string,
  extra: readonly string[] = []
): Record<string, unknown> {
  const result = shape(value, ["name", "role", "at", "reference", ...extra], label);
  for (const key of ["name", "role", "reference"]) text(result[key], `${label}.${key}`);
  timestamp(result.at, `${label}.at`);
  return result;
}

/** Restricted source/sanitized-evidence paths; never resolve data, secrets or arbitrary host files. */
export function safeStage12ArtifactPath(value: string): boolean {
  if (
    value === "Niedax_Implementation_Plan_to_Test_Phase_BG.docx" ||
    value === "packages/export/tests/fixtures/change-order-control.xlsx"
  )
    return true;
  return (
    !value.includes("\\") &&
    !value.split("/").some((part) => !part || part === "." || part === "..") &&
    /^(?:(?:docs|scripts|packages|apps|database|catalogue|gateway|\.github)\/|\.artifacts\/stage\d+\/safe\/|(?:package\.json|pnpm-lock\.yaml|compose(?:\.test)?\.yaml|AGENTS\.md|README\.md)$)/u.test(
      value
    ) &&
    /\.(?:md|json|ts|tsx|js|mjs|yaml|yml|sql|csv|conf|html|css)$/u.test(value) &&
    !/(?:^|\/)(?:secrets?|credentials?|\.env)(?:[./]|$)/iu.test(value)
  );
}

function parseAcceptance(value: unknown): Stage12Acceptance {
  const root = shape(
    value,
    [
      "schemaVersion",
      "hashing",
      "authoring",
      "candidate",
      "artifacts",
      "criteria",
      "defects",
      "signoffs"
    ],
    "package"
  );
  requireValue(root.schemaVersion === "stage12-acceptance/v1", "Unsupported Stage 12 schema");
  const hashing = shape(root.hashing, ["algorithm", "canonicalization"], "hashing");
  requireValue(
    hashing.algorithm === "sha256" && hashing.canonicalization === "engine-canonical-json/v1",
    "Unsupported hash procedure"
  );
  record(root.authoring, "authoring");
  const candidate = shape(
    root.candidate,
    ["id", "createdAt", "identity", "operationallyAccepted", "freeze"],
    "candidate"
  );
  text(candidate.id, "candidate.id");
  timestamp(candidate.createdAt, "candidate.createdAt");
  requireValue(
    typeof candidate.operationallyAccepted === "boolean",
    "candidate.operationallyAccepted: expected boolean"
  );
  const identity = shape(candidate.identity, STAGE12_IDENTITY_KEYS, "candidate.identity");
  for (const key of STAGE12_IDENTITY_KEYS) {
    const item = identity[key];
    nullableText(item, `identity.${key}`);
    if (item === null) continue;
    if (key.endsWith("Hash") || key.endsWith("Image") || key === "sourceFingerprint")
      hash(item, `identity.${key}`);
    if (key === "deployedCommit")
      requireValue(
        typeof item === "string" && COMMIT.test(item),
        "identity.deployedCommit: expected full Git SHA"
      );
    if (key === "buildTimestamp") timestamp(item, "identity.buildTimestamp");
    if (key === "sourceState")
      requireValue(
        item === "clean" || item === "dirty",
        "identity.sourceState: expected clean/dirty"
      );
    if (key === "testUrl") {
      const url = new URL(item as string);
      requireValue(
        ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash,
        "identity.testUrl: expected verified HTTP URL without credentials"
      );
    }
  }
  const freeze = shape(candidate.freeze, ["status", "frozenAt", "evidenceDigest"], "freeze");
  requireValue(
    ["provisional", "frozen"].includes(freeze.status as string),
    "freeze: invalid status"
  );
  if (freeze.frozenAt !== null) timestamp(freeze.frozenAt, "freeze.frozenAt");
  if (freeze.evidenceDigest !== null) hash(freeze.evidenceDigest, "freeze.evidenceDigest");
  if (freeze.status === "provisional")
    requireValue(
      freeze.frozenAt === null && freeze.evidenceDigest === null,
      "Provisional baseline cannot carry freeze claims"
    );
  for (const [index, value] of list(root.artifacts, "artifacts").entries()) {
    const artifact = shape(value, ["id", "path", "sha256", "hashMode"], `artifacts[${index}]`);
    text(artifact.id, "artifact.id");
    text(artifact.path, "artifact.path");
    requireValue(safeStage12ArtifactPath(artifact.path), "Unsafe artifact path");
    hash(artifact.sha256, "artifact.sha256");
    requireValue(
      ["file-bytes", "normalized-text", "canonical-json"].includes(artifact.hashMode as string),
      "Invalid artifact hashMode"
    );
  }
  for (const [index, value] of list(root.criteria, "criteria").entries()) {
    const criterion = shape(
      value,
      ["id", "status", "candidateDigest", "evidence", "responsibleRole", "nextAction"],
      `criteria[${index}]`
    );
    requireValue(
      STAGE12_CRITERION_IDS.includes(criterion.id as Stage12Criterion["id"]),
      "Unknown entry criterion"
    );
    requireValue(
      ["pass", "fail", "pending", "blocked"].includes(criterion.status as string),
      "Invalid criterion status"
    );
    if (criterion.candidateDigest !== null)
      hash(criterion.candidateDigest, "criterion.candidateDigest");
    text(criterion.responsibleRole, "criterion.responsibleRole");
    text(criterion.nextAction, "criterion.nextAction");
    for (const value of list(criterion.evidence, "criterion.evidence")) {
      const evidence = shape(
        value,
        ["reference", "sha256", "observedAt", "kind", "scope", "environmentId", "deployedCommit"],
        "evidence",
        ["run"]
      );
      text(evidence.reference, "evidence.reference");
      hash(evidence.sha256, "evidence.sha256");
      timestamp(evidence.observedAt, "evidence.observedAt");
      requireValue(KINDS.includes(evidence.kind as string), "Unknown evidence kind");
      requireValue(
        ["candidate", "implementation"].includes(evidence.scope as string),
        "Unknown evidence scope"
      );
      nullableText(evidence.environmentId, "evidence.environmentId");
      nullableText(evidence.deployedCommit, "evidence.deployedCommit");
      if (evidence.deployedCommit !== null)
        requireValue(
          typeof evidence.deployedCommit === "string" && COMMIT.test(evidence.deployedCommit),
          "Evidence requires full Git SHA"
        );
      if (evidence.kind === "remote-ci") {
        const run = shape(
          evidence.run,
          ["status", "conclusion", "head_sha", "head_branch", "event", "path", "head_repository"],
          "evidence.run"
        );
        shape(run.head_repository, ["full_name"], "evidence.run.head_repository");
      } else requireValue(evidence.run === undefined, "CI run attached to non-CI evidence");
    }
  }
  for (const value of list(root.defects, "defects")) {
    const defect = shape(
      value,
      ["id", "severity", "blocking", "status", "baselineId", "reference", "residualAcceptance"],
      "defect"
    );
    for (const key of ["id", "baselineId", "reference"]) text(defect[key], `defect.${key}`);
    requireValue(
      defect.severity === null || [1, 2, 3, 4].includes(defect.severity as number),
      "Invalid defect severity"
    );
    requireValue(typeof defect.blocking === "boolean", "defect.blocking: expected boolean");
    requireValue(
      ["open", "fixed", "verified", "accepted"].includes(defect.status as string),
      "Invalid defect status"
    );
    if (defect.residualAcceptance !== null) human(defect.residualAcceptance, "residualAcceptance");
  }
  for (const value of list(root.signoffs, "signoffs")) {
    const signoff = human(value, "signoff", [
      "candidateId",
      "candidateDigest",
      "evidenceDigest",
      "decision"
    ]);
    requireValue(
      ["product-owner/domain-reviewer", "technical-owner"].includes(signoff.role as string),
      "Invalid sign-off role"
    );
    text(signoff.candidateId, "signoff.candidateId");
    hash(signoff.candidateDigest, "signoff.candidateDigest");
    hash(signoff.evidenceDigest, "signoff.evidenceDigest");
    requireValue(["GO", "NO-GO"].includes(signoff.decision as string), "Invalid sign-off decision");
  }
  const accepted = root as unknown as Stage12Acceptance;
  unique(accepted.artifacts, "artifacts");
  requireValue(
    new Set(accepted.artifacts.map((item) => item.path)).size === accepted.artifacts.length,
    "artifacts: duplicate paths"
  );
  unique(accepted.criteria, "criteria");
  unique(accepted.defects, "defects");
  requireValue(
    accepted.criteria.length === STAGE12_CRITERION_IDS.length,
    "All E01–E11 mandatory criteria are required"
  );
  requireValue(
    new Set(accepted.signoffs.map((item) => item.role)).size === accepted.signoffs.length,
    "Duplicate human sign-off role"
  );
  return accepted;
}

export function stage12Hash(value: JsonValue): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}
export function stage12CandidateDigest(value: Stage12Acceptance): string {
  const { id, createdAt, identity, operationallyAccepted } = value.candidate;
  return stage12Hash({ id, createdAt, identity, operationallyAccepted });
}
export function stage12EvidenceDigest(value: Stage12Acceptance): string {
  return stage12Hash(
    JSON.parse(
      JSON.stringify({
        candidateDigest: stage12CandidateDigest(value),
        hashing: value.hashing,
        artifacts: value.artifacts,
        criteria: value.criteria,
        defects: value.defects
      })
    ) as JsonValue
  );
}

/** Checks supplied records only. It cannot authenticate humans, reach TEST or grant UAT admission. */
export function evaluateStage12Acceptance(value: unknown): Stage12Report {
  const report: Stage12Report = {
    schemaVersion: "stage12-report/v1",
    valid: false,
    decision: "NO-GO",
    candidateId: null,
    candidateDigest: null,
    evidenceDigest: null,
    freezeStatus: null,
    errors: [],
    blockers: []
  };
  let packageValue: Stage12Acceptance;
  try {
    packageValue = parseAcceptance(value);
  } catch (error) {
    report.errors.push((error as Error).message);
    return report;
  }
  const { candidate, criteria, artifacts, defects, signoffs } = packageValue;
  const candidateDigest = stage12CandidateDigest(packageValue);
  const evidenceDigest = stage12EvidenceDigest(packageValue);
  Object.assign(report, {
    candidateId: candidate.id,
    candidateDigest,
    evidenceDigest,
    freezeStatus: candidate.freeze.status
  });
  const incomplete = STAGE12_IDENTITY_KEYS.filter((key) => candidate.identity[key] === null);
  if (incomplete.length)
    report.blockers.push(`Candidate identity incomplete: ${incomplete.join(", ")}`);
  if (candidate.identity.sourceState !== "clean")
    report.blockers.push("Accepted deployed source must be clean");
  if (!candidate.operationallyAccepted)
    report.blockers.push("Accepted TEST deployment is unverified");
  if (candidate.operationallyAccepted && incomplete.length)
    report.errors.push("Operational acceptance requires complete deployed identity");
  const requiredKinds: Partial<Record<Stage12Criterion["id"], Stage12EvidenceKind[]>> = {
    E01: ["deployment", "smoke"],
    E04: ["domain-review"],
    E07: ["automated-check", "native-excel"],
    E11: [
      "remote-ci",
      "image-security",
      "domain-review",
      "performance-review",
      "deployment",
      "backup-restore"
    ]
  };
  for (const [key, binding] of Object.entries(STAGE12_REPOSITORY_HASH_BINDINGS)) {
    const identity = candidate.identity[key as keyof typeof STAGE12_REPOSITORY_HASH_BINDINGS];
    if (identity === null) continue;
    const bound = artifacts.find((artifact) => artifact.path === binding.path);
    if (!bound || bound.hashMode !== binding.hashMode || bound.sha256 !== identity)
      report.errors.push(
        `Identity ${key} requires matching ${binding.hashMode} artifact at ${binding.path}`
      );
  }
  for (const artifact of artifacts) {
    const identity = candidate.identity[artifact.id as (typeof STAGE12_IDENTITY_KEYS)[number]];
    if (
      identity &&
      (artifact.id.endsWith("Hash") || artifact.id === "sourceFingerprint") &&
      identity !== artifact.sha256
    )
      report.errors.push(`Artifact ${artifact.id} differs from candidate identity`);
  }
  for (const criterion of criteria) {
    if (criterion.candidateDigest !== null && criterion.candidateDigest !== candidateDigest)
      report.errors.push(`${criterion.id}: candidate digest mismatch`);
    if (criterion.status !== "pass")
      report.blockers.push(
        `${criterion.id}: ${criterion.status}; ${criterion.responsibleRole}: ${criterion.nextAction}`
      );
    else {
      if (
        criterion.candidateDigest !== candidateDigest ||
        !criterion.evidence.length ||
        criterion.evidence.some((item) => item.scope !== "candidate")
      )
        report.errors.push(`${criterion.id}: pass requires exact candidate evidence`);
      for (const kind of requiredKinds[criterion.id] ?? [])
        if (!criterion.evidence.some((item) => item.kind === kind && item.scope === "candidate"))
          report.errors.push(`${criterion.id}: pass requires ${kind} evidence`);
    }
    for (const evidence of criterion.evidence) {
      if (
        evidence.scope === "candidate" &&
        (!candidate.identity.deployedCommit ||
          !candidate.identity.environmentId ||
          evidence.deployedCommit !== candidate.identity.deployedCommit ||
          evidence.environmentId !== candidate.identity.environmentId)
      )
        report.errors.push(`${criterion.id}: evidence deployment/environment mismatch`);
      if (evidence.kind === "remote-ci") {
        try {
          requireValue(
            evidence.scope === "candidate" && !!candidate.identity.deployedCommit,
            "Successful remote candidate CI required"
          );
          assertStage10Run(evidence.run!, candidate.identity.deployedCommit);
        } catch {
          report.errors.push(`${criterion.id}: successful exact remote Stage 10 CI required`);
        }
      }
      const localPath = evidence.reference.split("#")[0]!;
      const local = artifacts.find((artifact) => artifact.path === localPath);
      const localLooking =
        !/^[a-z][a-z0-9+.-]*:/iu.test(localPath) &&
        (localPath.includes("/") ||
          /\.(?:md|json|ts|tsx|js|mjs|yaml|yml|sql|csv|conf|html|css|docx|xlsx)$/iu.test(
            localPath
          ));
      if (localLooking && !local)
        report.errors.push(`${criterion.id}: local evidence must identify a listed artifact`);
      if (local && local.sha256 !== evidence.sha256)
        report.errors.push(`${criterion.id}: evidence artifact digest mismatch`);
    }
  }
  for (const defect of defects) {
    if (defect.baselineId !== candidate.id) report.errors.push(`${defect.id}: baseline mismatch`);
    if (
      defect.status === "accepted" &&
      (defect.blocking ||
        defect.severity === null ||
        defect.severity <= 2 ||
        !defect.residualAcceptance)
    )
      report.errors.push(`${defect.id}: mandatory/high-risk blocker cannot be waived`);
    if (defect.status !== "verified" && defect.status !== "accepted")
      report.blockers.push(
        `${defect.id}: ${
          defect.blocking || (defect.severity !== null && defect.severity <= 2)
            ? "unresolved blocking defect"
            : "unreviewed residual defect"
        } (${defect.status})`
      );
  }
  if (
    criteria.find((item) => item.id === "E05")?.status === "pass" &&
    report.blockers.some((item) =>
      /unresolved blocking defect|unreviewed residual defect/u.test(item)
    )
  )
    report.errors.push("E05: pass conflicts with unresolved blockers");
  if (candidate.freeze.status === "provisional")
    report.blockers.push("Candidate baseline is provisional");
  else if (
    incomplete.length ||
    !candidate.operationallyAccepted ||
    criteria.some((item) => item.status !== "pass") ||
    report.blockers.length ||
    !candidate.freeze.frozenAt ||
    candidate.freeze.evidenceDigest !== evidenceDigest
  )
    report.errors.push(
      "Frozen baseline requires complete matching accepted evidence without blockers"
    );
  const latestEvidenceAt = Math.max(
    Date.parse(candidate.createdAt),
    ...criteria.flatMap((item) =>
      item.evidence
        .filter((evidence) => evidence.scope === "candidate")
        .map((evidence) => Date.parse(evidence.observedAt))
    )
  );
  if (candidate.freeze.frozenAt && Date.parse(candidate.freeze.frozenAt) < latestEvidenceAt)
    report.errors.push("Freeze predates candidate evidence");
  for (const role of ["product-owner/domain-reviewer", "technical-owner"] as const) {
    const signoff = signoffs.find((item) => item.role === role);
    if (!signoff) {
      report.blockers.push(`Missing human sign-off: ${role}`);
      continue;
    }
    if (
      signoff.candidateId !== candidate.id ||
      signoff.candidateDigest !== candidateDigest ||
      signoff.evidenceDigest !== evidenceDigest ||
      Date.parse(signoff.at) < latestEvidenceAt ||
      (candidate.freeze.frozenAt && Date.parse(signoff.at) < Date.parse(candidate.freeze.frozenAt))
    )
      report.errors.push(`${role}: stale or mismatched sign-off`);
    if (signoff.decision !== "GO") report.blockers.push(`${role}: signed NO-GO`);
  }
  report.valid = report.errors.length === 0;
  if (report.valid && !report.blockers.length) report.decision = "GO";
  return report;
}

export function stage12ExitCode(report: Stage12Report, requireGo = false): 0 | 1 | 2 {
  return !report.valid ? 1 : requireGo && report.decision !== "GO" ? 2 : 0;
}
