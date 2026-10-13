import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  captureTestImages,
  collectTestDeploymentIdentity,
  parseTestDeploymentDatabaseIdentity,
  TEST_DEPLOYMENT_IDENTITY_SQL,
  TEST_IMAGE_SERVICES,
  type TestImageIdentity,
  type TestImageService
} from "../lib/stage11-identity.js";
import { TEST_RESTORE_SNAPSHOT_SQL } from "../lib/stage11-backup.js";

const hash = (character: string) => `sha256:${character.repeat(64)}`;
const catalogId = "10000000-0000-4000-8000-000000000001";
const ruleId = "10000000-0000-4000-8000-000000000002";
const projectId = "10000000-0000-4000-8000-000000000003";
const revisionId = "10000000-0000-4000-8000-000000000004";
const artifactId = "10000000-0000-4000-8000-000000000005";

function databaseEvidence() {
  return {
    snapshot: {
      activeCatalogs: [`${catalogId}:2022-p0:${hash("a")}`],
      activeRules: [`${ruleId}:2022-p0:${hash("b")}`],
      roleAccounts: 4,
      projects: 1,
      revisions: 1,
      fingerprint: "c".repeat(64),
      migrationFingerprint: "d".repeat(64)
    },
    activeCatalogs: [{ id: catalogId, scope: "p0", version: "2022-p0", contentHash: hash("a") }],
    activeRules: [
      {
        id: ruleId,
        scope: "p0",
        version: "2022-p0",
        catalogVersionId: catalogId,
        contentHash: hash("b")
      }
    ],
    revisions: [
      {
        projectId,
        revisionId,
        revisionNumber: 1,
        status: "calculated",
        engineVersion: "0.1.0",
        inputFingerprint: hash("e"),
        catalogSnapshot: { id: catalogId, version: "2022-p0", contentHash: hash("a") },
        ruleSnapshot: { id: ruleId, version: "2022-p0", contentHash: hash("b") },
        checksums: {
          projectChecksum: hash("1"),
          inputChecksum: hash("2"),
          snapshotChecksum: hash("3"),
          resultChecksum: hash("4"),
          bomChecksum: hash("5"),
          warningsChecksum: hash("6"),
          revisionChecksum: hash("7")
        }
      }
    ],
    readyExports: [
      {
        artifactId,
        revisionId,
        contentHash: hash("8"),
        contentLength: 1000,
        cacheIdentity: hash("9"),
        revisionChecksum: hash("7"),
        capturedLifecycleStatus: "calculated",
        templateId: "change-order-clients-scope-26",
        templateSha256: hash("a"),
        mappingVersion: "change-order-clients-scope-26-1",
        rendererVersion: "stage9-exceljs-2"
      }
    ]
  };
}

function fixtureContext() {
  const imageReferences = Object.fromEntries(
    TEST_IMAGE_SERVICES.map((service) => [
      service,
      service === "postgres"
        ? `postgres:18.6-alpine3.23@${hash("f")}`
        : `niedax-test/${service}:${"a".repeat(40)}`
    ])
  ) as Record<TestImageService, string>;
  const imagesBeforeOperations: TestImageIdentity[] = TEST_IMAGE_SERVICES.map((service, index) => ({
    service,
    configuredReference: imageReferences[service],
    imageId: hash(String(index + 1)),
    repositoryDigests: service === "postgres" ? [`postgres@${hash("f")}`] : []
  }));
  const runDocker = vi.fn(async (args: readonly string[]) => {
    const service = TEST_IMAGE_SERVICES.find(
      (item) => args.at(-1) === imageReferences[item] || args.at(-1) === `niedax-test-${item}`
    );
    if (!service) throw new Error("Unexpected Docker target");
    const image = imagesBeforeOperations.find((item) => item.service === service)!;
    return JSON.stringify(
      args[0] === "image"
        ? {
            imageId: image.imageId,
            repositoryDigests: image.repositoryDigests,
            unrelatedEnvironment: "discard this field"
          }
        : { imageId: image.imageId, running: true }
    );
  });
  const evidence = databaseEvidence();
  return {
    assertSafe: vi.fn(async () => undefined),
    imageReferences,
    imagesBeforeOperations,
    runDocker,
    runCompose: vi.fn<(args: readonly string[]) => Promise<string>>(async () =>
      JSON.stringify(evidence)
    ),
    lockfileHash: hash("a"),
    observedFeatureFlags: { operationalMetrics: true },
    observedActiveVersions: { catalogues: evidence.activeCatalogs, ruleSets: evidence.activeRules }
  };
}

describe("Stage 11 deployment identity evidence", () => {
  it("runs the TEST guard before Docker or database observations", async () => {
    const context = fixtureContext();
    context.assertSafe.mockRejectedValue(new Error("unsafe topology"));
    await expect(captureTestImages(context)).rejects.toThrow("unsafe topology");
    await expect(collectTestDeploymentIdentity(context)).rejects.toThrow("unsafe topology");
    expect(context.runDocker).not.toHaveBeenCalled();
    expect(context.runCompose).not.toHaveBeenCalled();
  });

  it("captures immutable IDs for every runtime and deployment tool without full inspect data", async () => {
    const context = fixtureContext();
    const images = await captureTestImages(context);
    expect(images).toEqual(context.imagesBeforeOperations);
    expect(images.map((item) => item.service)).toEqual(TEST_IMAGE_SERVICES);
    for (const [args] of context.runDocker.mock.calls) {
      expect(args.slice(0, 3)).toEqual(["image", "inspect", "--format"]);
      expect(args[3]).toBe('{"imageId":{{json .Id}},"repositoryDigests":{{json .RepoDigests}}}');
      expect(args.join(" ")).not.toContain(".Config");
    }
    expect(JSON.stringify(images)).not.toContain("unrelatedEnvironment");
  });

  it("allows local images without a registry digest but never invents one", async () => {
    const context = fixtureContext();
    context.runDocker.mockResolvedValue(
      JSON.stringify({ imageId: hash("1"), repositoryDigests: null })
    );
    expect(
      (await captureTestImages(context)).every((image) => image.repositoryDigests.length === 0)
    ).toBe(true);
    context.runDocker.mockResolvedValue(
      JSON.stringify({ imageId: "mutable-tag", repositoryDigests: [] })
    );
    await expect(captureTestImages(context)).rejects.toThrow("Invalid immutable TEST");
  });

  it("rejects changed migration or backup images before asserting database evidence", async () => {
    for (const service of ["migrations", "backup"] as const) {
      const context = fixtureContext();
      const previous = context.imagesBeforeOperations.find((image) => image.service === service)!;
      const captured = context.imagesBeforeOperations.map((image) =>
        image === previous ? { ...image, imageId: hash("f") } : image
      );
      await expect(
        collectTestDeploymentIdentity({ ...context, imagesBeforeOperations: captured })
      ).rejects.toThrow("changed during deployment");
      expect(context.runCompose).not.toHaveBeenCalled();
    }
  });

  it.each([true, false])(
    "rejects a wrong or stopped actual runtime container (running=%s)",
    async (running) => {
      const context = fixtureContext();
      const original = context.runDocker.getMockImplementation()!;
      context.runDocker.mockImplementation(async (args) =>
        args[0] === "container"
          ? JSON.stringify({ imageId: running ? hash("f") : hash("1"), running })
          : original(args)
      );
      await expect(collectTestDeploymentIdentity(context)).rejects.toThrow(
        "Running TEST backend image differs"
      );
      expect(context.runCompose).not.toHaveBeenCalled();
    }
  );

  it("captures stored revision/result/export identities and observed flags without attributing old snapshots to a build", async () => {
    const context = fixtureContext();
    const identity = await collectTestDeploymentIdentity(context);
    expect(identity.lockfileHash).toBe(hash("a"));
    expect(identity.migrationHistoryHash).toBe(hash("d"));
    expect(identity.activeCatalogs).toEqual(databaseEvidence().activeCatalogs);
    expect(identity.activeRules).toEqual(databaseEvidence().activeRules);
    expect(identity.savedRevisions).toEqual(databaseEvidence().revisions);
    expect(identity.readyExports).toEqual(databaseEvidence().readyExports);
    expect(identity.representativeRecordsHash).toBe(hash("c"));
    expect(identity.featureFlagsHash).toBe(
      `sha256:${createHash("sha256").update('{"operationalMetrics":true}').digest("hex")}`
    );
    expect(identity.snapshotBuildAttribution).toBe(
      "existing-snapshots-not-attributed-to-observed-build"
    );
    expect(identity.images.filter((image) => image.containerImageId !== null)).toHaveLength(4);
    expect(
      identity.images
        .filter((image) => image.containerImageId === null)
        .map((image) => image.service)
    ).toEqual(["migrations", "backup"]);
    expect(Number.isFinite(Date.parse(identity.observedAt))).toBe(true);
    expect(context.runCompose.mock.calls[0]?.[0].at(-1)).toContain("SET TIME ZONE 'UTC'");
  });

  it("reuses the backup graph query in a single read-only observation", () => {
    expect(TEST_DEPLOYMENT_IDENTITY_SQL).toContain(TEST_RESTORE_SNAPSHOT_SQL);
    expect(TEST_DEPLOYMENT_IDENTITY_SQL).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/u
    );
    expect(TEST_DEPLOYMENT_IDENTITY_SQL).not.toContain("e.content_bytes");
    expect(TEST_DEPLOYMENT_IDENTITY_SQL).not.toContain("r.input_snapshot");
  });

  it("discards unrelated input payloads while preserving the explicit safe identities", () => {
    const evidence = databaseEvidence();
    expect(
      parseTestDeploymentDatabaseIdentity({
        ...evidence,
        unexpected: { privateValue: "omit" },
        revisions: evidence.revisions.map((item) => ({ ...item, privateDescription: "omit" }))
      })
    ).toEqual(evidence);
  });

  it("rejects inconsistent active catalog, migration, saved revision and ready export metadata", () => {
    for (const change of [
      (value: ReturnType<typeof databaseEvidence>) => {
        value.snapshot.migrationFingerprint = "missing";
      },
      (value: ReturnType<typeof databaseEvidence>) => {
        value.activeCatalogs[0]!.contentHash = hash("f");
      },
      (value: ReturnType<typeof databaseEvidence>) => {
        value.activeRules[0]!.catalogVersionId = artifactId;
      },
      (value: ReturnType<typeof databaseEvidence>) => {
        value.revisions = [];
      },
      (value: ReturnType<typeof databaseEvidence>) => {
        value.readyExports[0]!.revisionChecksum = hash("f");
      },
      (value: ReturnType<typeof databaseEvidence>) => {
        value.readyExports[0]!.contentLength = 0;
      }
    ]) {
      const evidence = databaseEvidence();
      change(evidence);
      expect(() => parseTestDeploymentDatabaseIdentity(evidence)).toThrow("payload withheld");
    }
  });

  it("rejects a catalog identity changed between HTTP smoke and database capture", async () => {
    const context = fixtureContext();
    context.observedActiveVersions.catalogues[0]!.id = artifactId;
    await expect(collectTestDeploymentIdentity(context)).rejects.toThrow("payload withheld");
  });

  it("withholds child and parse error payloads", async () => {
    const context = fixtureContext();
    const marker = "unrelated sensitive diagnostic contents";
    context.runDocker.mockRejectedValue(new Error(marker));
    await expect(captureTestImages(context)).rejects.toThrow("Cannot observe immutable TEST");
    try {
      await captureTestImages(context);
    } catch (error) {
      expect(String(error)).not.toContain(marker);
    }
    expect(() => parseTestDeploymentDatabaseIdentity({ snapshot: marker })).toThrow(
      "payload withheld"
    );
  });
});
