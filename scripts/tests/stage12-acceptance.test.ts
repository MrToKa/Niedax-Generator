import { describe, expect, it } from "vitest";
import {
  evaluateStage12Acceptance,
  safeStage12ArtifactPath,
  stage12CandidateDigest,
  stage12EvidenceDigest,
  stage12ExitCode,
  stage12Hash,
  STAGE12_CRITERION_IDS,
  STAGE12_IDENTITY_KEYS,
  STAGE12_REPOSITORY_HASH_BINDINGS,
  type Stage12Acceptance,
  type Stage12Evidence,
  type Stage12EvidenceKind
} from "../lib/stage12-acceptance.js";

// Synthetic records exercise consistency rules; they are never acceptance evidence.
const commit = "abc12345".repeat(5);
const createdAt = "2026-09-29T10:00:00Z";
function pending(): Stage12Acceptance {
  return {
    schemaVersion: "stage12-acceptance/v1",
    hashing: { algorithm: "sha256", canonicalization: "engine-canonical-json/v1" },
    authoring: { description: "Synthetic validator unit fixture" },
    candidate: {
      id: "synthetic-unit-candidate",
      createdAt,
      identity: Object.fromEntries(
        STAGE12_IDENTITY_KEYS.map((key) => [key, null])
      ) as Stage12Acceptance["candidate"]["identity"],
      operationallyAccepted: false,
      freeze: { status: "provisional", frozenAt: null, evidenceDigest: null }
    },
    artifacts: [],
    criteria: STAGE12_CRITERION_IDS.map((id) => ({
      id,
      status: "pending",
      candidateDigest: null,
      evidence: [],
      responsibleRole: "Synthetic test owner",
      nextAction: "Supply genuine candidate evidence"
    })),
    defects: [],
    signoffs: []
  };
}
function evidence(kind: Stage12EvidenceKind): Stage12Evidence {
  return {
    reference: `internal-record:synthetic-${kind}`,
    sha256: stage12Hash(kind),
    observedAt: "2026-09-29T11:00:00Z",
    kind,
    scope: "candidate",
    environmentId: "synthetic-test-environment",
    deployedCommit: commit,
    ...(kind === "remote-ci"
      ? {
          run: {
            status: "completed",
            conclusion: "success",
            head_sha: commit,
            head_branch: "main",
            event: "workflow_dispatch",
            path: ".github/workflows/stage10.yml",
            head_repository: { full_name: "MrToKa/Niedax-Generator" }
          }
        }
      : {})
  };
}
function ready(): Stage12Acceptance {
  const value = pending();
  for (const key of STAGE12_IDENTITY_KEYS)
    value.candidate.identity[key] =
      key.endsWith("Hash") || key.endsWith("Image") || key === "sourceFingerprint"
        ? stage12Hash(key)
        : `synthetic-${key}`;
  Object.assign(value.candidate.identity, {
    deployedCommit: commit,
    buildTimestamp: createdAt,
    sourceState: "clean",
    testUrl: "http://192.0.2.10:8080",
    environmentId: "synthetic-test-environment"
  });
  value.candidate.operationallyAccepted = true;
  value.artifacts = Object.entries(STAGE12_REPOSITORY_HASH_BINDINGS).map(([key, binding]) => ({
    id: key,
    ...binding,
    sha256: value.candidate.identity[key as keyof typeof STAGE12_REPOSITORY_HASH_BINDINGS]!
  }));
  const required: Record<string, Stage12EvidenceKind[]> = {
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
  for (const criterion of value.criteria) {
    criterion.status = "pass";
    criterion.candidateDigest = stage12CandidateDigest(value);
    criterion.evidence = (required[criterion.id] ?? ["automated-check"]).map(evidence);
  }
  sign(value);
  return value;
}
function sign(value: Stage12Acceptance): void {
  const candidateDigest = stage12CandidateDigest(value);
  const evidenceDigest = stage12EvidenceDigest(value);
  value.candidate.freeze = { status: "frozen", frozenAt: "2026-09-29T12:00:00Z", evidenceDigest };
  value.signoffs = (["product-owner/domain-reviewer", "technical-owner"] as const).map((role) => ({
    name: "Synthetic unit-test reviewer",
    role,
    at: "2026-09-29T13:00:00Z",
    reference: "docs/testing/synthetic-signoff.md",
    candidateId: value.candidate.id,
    candidateDigest,
    evidenceDigest,
    decision: "GO"
  }));
}

describe("Stage 12 acceptance record consistency", () => {
  it("reports a valid incomplete package as NO-GO without claiming acceptance", () => {
    const report = evaluateStage12Acceptance(pending());
    expect(report.valid).toBe(true);
    expect(report.decision).toBe("NO-GO");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        "Accepted TEST deployment is unverified",
        "Candidate baseline is provisional",
        "Missing human sign-off: technical-owner"
      ])
    );
    expect(stage12ExitCode(report)).toBe(0);
    expect(stage12ExitCode(report, true)).toBe(2);
  });

  it("evaluates supplied complete frozen matching records as GO", () => {
    const report = evaluateStage12Acceptance(ready());
    expect(report).toMatchObject({ valid: true, decision: "GO", errors: [], blockers: [] });
    expect(stage12ExitCode(report, true)).toBe(0);
  });

  it("requires every mandatory criterion exactly once and rejects incompatible schema", () => {
    const omitted = pending();
    omitted.criteria.pop();
    expect(evaluateStage12Acceptance(omitted).valid).toBe(false);
    const duplicate = pending();
    duplicate.criteria[1]!.id = "E01";
    expect(evaluateStage12Acceptance(duplicate).errors.join()).toContain("duplicate");
    expect(evaluateStage12Acceptance({ ...pending(), schemaVersion: "other/v1" }).valid).toBe(
      false
    );
    expect(evaluateStage12Acceptance(null).valid).toBe(false);
  });

  it("rejects mandatory pass without evidence or with implementation-only evidence", () => {
    for (const missing of [true, false]) {
      const value = ready();
      if (missing) value.criteria[2]!.evidence = [];
      else value.criteria[2]!.evidence[0]!.scope = "implementation";
      sign(value);
      const report = evaluateStage12Acceptance(value);
      expect(report.errors.join()).toContain("E03: pass requires exact candidate evidence");
      expect(stage12ExitCode(report)).toBe(1);
    }
  });

  it("rejects mismatched candidate, deployed commit and environment evidence", () => {
    const changes = [
      (value: Stage12Acceptance) => {
        value.criteria[1]!.candidateDigest = stage12Hash("other candidate");
      },
      (value: Stage12Acceptance) => {
        value.criteria[1]!.evidence[0]!.deployedCommit = "def67890".repeat(5);
      },
      (value: Stage12Acceptance) => {
        value.criteria[1]!.evidence[0]!.environmentId = "different TEST";
      }
    ];
    for (const mutate of changes) {
      const value = ready();
      mutate(value);
      sign(value);
      expect(evaluateStage12Acceptance(value).errors.join()).toContain("mismatch");
    }
  });

  it("keeps the required Stage 10 successful remote CI gate exact", () => {
    for (const change of [
      { conclusion: "cancelled" },
      { conclusion: "skipped" },
      { status: "in_progress" },
      { head_sha: "def67890".repeat(5) },
      { head_branch: "feature" },
      { event: "pull_request" },
      { path: ".github/workflows/stage11-test.yml" }
    ]) {
      const value = ready();
      const remote = value.criteria
        .find((item) => item.id === "E11")!
        .evidence.find((item) => item.kind === "remote-ci")!;
      Object.assign(remote.run!, change);
      sign(value);
      expect(evaluateStage12Acceptance(value).errors.join()).toContain(
        "successful exact remote Stage 10 CI required"
      );
    }
  });

  it("requires scoped native Excel and dependency evidence rather than a generic check", () => {
    for (const [id, kind] of [
      ["E07", "native-excel"],
      ["E11", "image-security"],
      ["E01", "deployment"]
    ]) {
      const value = ready();
      const criterion = value.criteria.find((item) => item.id === id)!;
      criterion.evidence = criterion.evidence.filter((item) => item.kind !== kind);
      sign(value);
      expect(evaluateStage12Acceptance(value).errors.join()).toContain(
        `pass requires ${kind} evidence`
      );
    }
  });

  it("prevents freezing incomplete or nonaccepted deployments", () => {
    const value = pending();
    value.candidate.freeze = {
      status: "frozen",
      frozenAt: "2026-09-29T12:00:00Z",
      evidenceDigest: stage12EvidenceDigest(value)
    };
    expect(evaluateStage12Acceptance(value).errors.join()).toContain("Frozen baseline requires");
    const local = ready();
    local.candidate.operationallyAccepted = false;
    sign(local);
    expect(evaluateStage12Acceptance(local).valid).toBe(false);
  });

  it("detects signoffs made before reviewed evidence and approvals for an old digest", () => {
    const oldDate = ready();
    oldDate.signoffs[0]!.at = createdAt;
    expect(evaluateStage12Acceptance(oldDate).errors.join()).toContain(
      "stale or mismatched sign-off"
    );
    const changedEvidence = ready();
    changedEvidence.criteria[2]!.evidence[0]!.sha256 = stage12Hash("new result");
    expect(evaluateStage12Acceptance(changedEvidence).errors.join()).toContain(
      "stale or mismatched sign-off"
    );
    const changedBuild = ready();
    changedBuild.candidate.identity.engineVersion = "synthetic-new-engine";
    expect(evaluateStage12Acceptance(changedBuild).errors.join()).toContain(
      "stale or mismatched sign-off"
    );
  });

  it("keeps authoring metadata separate from reviewed application and evidence identities", () => {
    const value = ready();
    const before = [stage12CandidateDigest(value), stage12EvidenceDigest(value)];
    value.authoring = { packageCommit: "new documentation-only authoring identity" };
    expect([stage12CandidateDigest(value), stage12EvidenceDigest(value)]).toEqual(before);
    expect(evaluateStage12Acceptance(value).decision).toBe("GO");
  });

  it("retains open and fixed-unverified blockers and forbids severity waivers", () => {
    for (const status of ["open", "fixed"] as const) {
      const value = pending();
      value.defects.push({
        id: "UNIT-BLOCKER",
        severity: 2,
        blocking: true,
        status,
        baselineId: value.candidate.id,
        reference: "docs/testing/synthetic-defect.md",
        residualAcceptance: null
      });
      expect(evaluateStage12Acceptance(value).blockers.join()).toContain(
        "unresolved blocking defect"
      );
    }
    const waived = pending();
    waived.defects.push({
      id: "UNIT-WAIVER",
      severity: 1,
      blocking: false,
      status: "accepted",
      baselineId: waived.candidate.id,
      reference: "docs/testing/synthetic-defect.md",
      residualAcceptance: {
        name: "Synthetic reviewer",
        role: "technical-owner",
        at: createdAt,
        reference: "synthetic-record"
      }
    });
    expect(evaluateStage12Acceptance(waived).errors.join()).toContain("cannot be waived");
    const contradicting = ready();
    contradicting.defects.push({
      id: "UNIT-OPEN",
      severity: null,
      blocking: true,
      status: "open",
      baselineId: contradicting.candidate.id,
      reference: "docs/testing/synthetic-defect.md",
      residualAcceptance: null
    });
    sign(contradicting);
    expect(evaluateStage12Acceptance(contradicting).errors.join()).toContain("E05: pass conflicts");
  });

  it("accepts a signed NO-GO record as valid while entry stays closed", () => {
    const value = pending();
    value.signoffs = (["product-owner/domain-reviewer", "technical-owner"] as const).map(
      (role) => ({
        name: "Synthetic reviewer",
        role,
        at: "2026-09-29T13:00:00Z",
        reference: "synthetic-record",
        candidateId: value.candidate.id,
        candidateDigest: stage12CandidateDigest(value),
        evidenceDigest: stage12EvidenceDigest(value),
        decision: "NO-GO"
      })
    );
    expect(evaluateStage12Acceptance(value)).toMatchObject({ valid: true, decision: "NO-GO" });
  });

  it("requires genuine residual acceptance for lower severity workarounds", () => {
    const value = ready();
    value.defects.push({
      id: "UNIT-RESIDUAL",
      severity: 3,
      blocking: false,
      status: "open",
      baselineId: value.candidate.id,
      reference: "docs/testing/synthetic-defect.md",
      residualAcceptance: null
    });
    sign(value);
    expect(evaluateStage12Acceptance(value).blockers.join()).toContain(
      "unreviewed residual defect"
    );
    value.defects[0]!.status = "accepted";
    value.defects[0]!.residualAcceptance = {
      name: "Synthetic unit-test reviewer",
      role: "technical-owner",
      at: "2026-09-29T12:00:00Z",
      reference: "docs/testing/synthetic-disposition.md"
    };
    sign(value);
    expect(evaluateStage12Acceptance(value)).toMatchObject({ valid: true, decision: "GO" });
  });

  it("rejects repeated-digit hashes, unsafe references and false UTC dates", () => {
    const placeholder = pending();
    placeholder.candidate.identity.catalogHash = `sha256:${"1".repeat(64)}`;
    expect(evaluateStage12Acceptance(placeholder).valid).toBe(false);
    const badDate = pending();
    badDate.candidate.createdAt = "2026-02-30T10:00:00Z";
    expect(evaluateStage12Acceptance(badDate).valid).toBe(false);
    for (const path of [
      "data/secrets/accounts.json",
      "docs/../data/password.json",
      "C:/secrets.json",
      "docs\\testing\\file.json",
      ".artifacts/raw/state.json"
    ])
      expect(safeStage12ArtifactPath(path), path).toBe(false);
    expect(safeStage12ArtifactPath("docs/testing/stage12-baseline.json")).toBe(true);
    expect(safeStage12ArtifactPath(".artifacts/stage10/safe/summary.json")).toBe(true);
    expect(safeStage12ArtifactPath("Niedax_Implementation_Plan_to_Test_Phase_BG.docx")).toBe(true);
    expect(
      safeStage12ArtifactPath("packages/export/tests/fixtures/change-order-control.xlsx")
    ).toBe(true);
    expect(safeStage12ArtifactPath("packages/export/tests/fixtures/customer.xlsx")).toBe(false);
  });

  it("reuses stable canonical JSON hashing and detects artifact identity drift", () => {
    expect(stage12Hash({ b: [1, 2], a: "value" })).toBe(stage12Hash({ a: "value", b: [1, 2] }));
    const value = pending();
    value.candidate.identity.lockfileHash = stage12Hash("old lockfile");
    value.artifacts.push({
      id: "lockfileHash",
      path: "pnpm-lock.yaml",
      sha256: stage12Hash("new lockfile"),
      hashMode: "file-bytes"
    });
    expect(evaluateStage12Acceptance(value).errors.join()).toContain(
      "differs from candidate identity"
    );
  });

  it("requires local pass evidence to bind an available artifact digest", () => {
    const value = ready();
    value.criteria[2]!.evidence[0]!.reference = "docs/testing/synthetic-unit-results.md";
    sign(value);
    expect(evaluateStage12Acceptance(value).errors.join()).toContain(
      "local evidence must identify a listed artifact"
    );
    value.artifacts.push({
      id: "unit-results",
      path: "docs/testing/synthetic-unit-results.md",
      sha256: value.criteria[2]!.evidence[0]!.sha256,
      hashMode: "file-bytes"
    });
    sign(value);
    expect(evaluateStage12Acceptance(value)).toMatchObject({ valid: true, decision: "GO" });
    value.artifacts.find((artifact) => artifact.id === "unit-results")!.sha256 =
      stage12Hash("different file");
    sign(value);
    expect(evaluateStage12Acceptance(value).errors.join()).toContain(
      "evidence artifact digest mismatch"
    );
  });

  it("binds declared repository identities to exact file, procedure and digest regardless of artifact name", () => {
    for (const [key, binding] of Object.entries(STAGE12_REPOSITORY_HASH_BINDINGS)) {
      for (const change of [
        "renamed-mismatch",
        "missing",
        "different-path",
        "different-mode"
      ] as const) {
        const value = ready();
        const index = value.artifacts.findIndex((artifact) => artifact.path === binding.path);
        const artifact = value.artifacts[index]!;
        if (change === "renamed-mismatch") {
          artifact.id = "renamed-artifact";
          value.candidate.identity[key as keyof typeof STAGE12_REPOSITORY_HASH_BINDINGS] =
            stage12Hash("wrong declared file");
          for (const criterion of value.criteria)
            criterion.candidateDigest = stage12CandidateDigest(value);
        } else if (change === "missing") value.artifacts.splice(index, 1);
        else if (change === "different-path") artifact.path = "README.md";
        else
          artifact.hashMode = binding.hashMode === "file-bytes" ? "normalized-text" : "file-bytes";
        sign(value);
        expect(evaluateStage12Acceptance(value).errors.join(), `${key}: ${change}`).toContain(
          `Identity ${key} requires matching`
        );
      }
    }
    const renamed = ready();
    renamed.artifacts[0]!.id = "arbitrary-readable-name";
    sign(renamed);
    expect(evaluateStage12Acceptance(renamed)).toMatchObject({ valid: true, decision: "GO" });
  });
});
