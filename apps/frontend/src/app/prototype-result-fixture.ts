/**
 * Presentation-only sample copied from the calculation-engine golden result named below.
 * It is intentionally static and must never be presented as a calculation of current UI input.
 */
export const sampleBomFixture = {
  id: "connected-routes-6m-support-continuation",
  source:
    "packages/calculation-engine/tests/golden/expected/connected-routes-6m-support-continuation.json",
  schemaVersion: "calculation-result/v2",
  engineVersion: "0.1.0",
  formulaCatalogVersion: "1.0.0",
  inputFingerprint: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
  catalogSnapshot: {
    id: "catalog-snapshot-v2",
    version: "2.0.0",
    contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
  },
  ruleSnapshot: {
    id: "rule-snapshot-v2",
    version: "2.0.0",
    contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222"
  },
  summary: {
    bomLineCount: "4",
    warningCount: "2",
    engineeringReviewRequired: true
  },
  rows: [
    {
      id: "bom-42a46d5c146ec784",
      category: "Linear section",
      productCode: "NX STRAIGHT",
      description: "Straight cable ladder",
      unit: "m",
      technicalQuantity: "24",
      packageIncrement: "6 m",
      packageCount: "5",
      orderedQuantity: "30",
      spareQuantity: "6",
      status: "calculated",
      warningCount: "0"
    },
    {
      id: "bom-63f341a6b43201cc",
      category: "Connector",
      productCode: "NX JOINT",
      description: "Straight-run joint",
      unit: "pcs",
      technicalQuantity: "3",
      packageIncrement: "2 pcs",
      packageCount: "2",
      orderedQuantity: "4",
      spareQuantity: "1",
      status: "catalogConfirmed",
      warningCount: "0"
    },
    {
      id: "bom-02e11ae7f0b0b5ff",
      category: "Support",
      productCode: "NX SUPPORT",
      description: "Wall support",
      unit: "pcs",
      technicalQuantity: "9",
      packageIncrement: "1 pcs",
      packageCount: "10",
      orderedQuantity: "10",
      spareQuantity: "1",
      status: "calculated",
      warningCount: "0"
    },
    {
      id: "bom-7f964b66aeeb1a3d",
      category: "Endpoint material",
      productCode: "NX END CAP",
      description: "Compatible end cap",
      unit: "pcs",
      technicalQuantity: "1",
      packageIncrement: "1 pcs",
      packageCount: "2",
      orderedQuantity: "2",
      spareQuantity: "1",
      status: "catalogConfirmed",
      warningCount: "0"
    }
  ]
} as const;
