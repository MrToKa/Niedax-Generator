# MVP Input Contract v1 — Proposed

Contract ID: `niedax-generator-mvp-input-v1`  
Document version: `1.0.0-proposed`  
Prototype implementation: `stage-2-ux-1.0.0`  
Status date: 2026-08-16

This contract is **Proposed**, not Frozen. The repository does not contain the approved Stage 1
functional field specification, and open decisions affect stored data, product resolution, and
calculation behavior. The prototype implements the shape below for review without claiming those
decisions are approved.

## Contract envelope

```ts
interface MvpInputV1 {
  contractVersion: "1.0.0";
  project: ProjectInput;
  system: SystemSelection;
  routes: RouteInput[];
  connections: ConnectionInput[];
  supports: SupportInput;
  loadAndAccessories: LoadAndAccessoriesInput;
  sourceVersions: {
    catalogue: string;
    rules: string;
  };
}
```

`prototype.activeStep` and `prototype.scenario` are intentionally excluded. UI language is a
device/session preference unless Stage 1 later requires it in project revisions.

## Proposed normalized input shape

```ts
interface ProjectInput {
  id: string; // stable ID
  code: string; // required user-facing identity
  name: string; // required
  description: string | null; // intentional null when absent
  defaultReservePercent: number; // 0..100
  status: "draft" | "review" | "approved";
  revision: string; // explicit revision only
}

interface SystemSelection {
  seriesId: string;
  dimensionId: string;
  finishId: string;
  variantId: string; // unresolved null is allowed only in draft UX, not calculation
}

interface RouteInput {
  id: string;
  code: string;
  name: string;
  description: string;
  system: SystemSelection;
  sectionLengthM: 3 | 6;
  startPoint: string;
  endPoint: string;
  startEndpointType: EndpointType;
  endEndpointType: EndpointType;
  additionalSupportsAroundFittingsPcs: number;
  geometry: GeometryItemInput[]; // array order is authoritative
}

type EndpointType = "free" | "endCap" | "equipment" | "continuation" | "splice" | "custom";

type GeometryItemInput =
  | { id: string; kind: "straight"; lengthM: number }
  | {
      id: string;
      kind: "fitting";
      fittingType: "horizontalBend" | "verticalBend" | "tee" | "transition" | "custom";
    };

interface ConnectionInput {
  id: string;
  type:
    "continuation" | "splice" | "horizontalBend" | "verticalBend" | "tee" | "transition" | "custom";
  participants: Array<`${string}:start` | `${string}:end`>;
  materialBehavior: "automatic" | "none" | "manual";
  supportBehavior: "shared" | "separate";
  supportsBeforePcs: number;
  supportsAfterPcs: number;
  manualConnectorCorrectionPcs: number;
  manualProduct: ManualProductReference | null;
  reason: string;
  note: string | null;
}

interface SupportInput {
  spacingM: number;
  supportType: "wall" | "ceiling" | "floor" | "custom";
  templateId: string;
  connectionBehavior: "shared" | "separate";
  additionalSupportCountPcs: number;
  anchorModelId: string | null;
  anchorSizeMm: number | null;
  anchorsPerMountingPointPcs: number;
  substrate: "concrete" | "steel" | "masonry" | "unknown";
  manualAnchorOverride: boolean;
  manualAnchorQuantityPcs: number | null;
  wstbMode: "one" | "two" | "manual";
  wstbManualQuantityPerSupportPcs: number | null;
}

interface LoadAndAccessoriesInput {
  cableLoadKgM: number | null; // OPEN-01 decides calculation readiness
  accessoryIds: string[];
  manualItems: ManualItemInput[];
}

interface ManualProductReference {
  kind: "catalog" | "freeText";
  productCode: string | null;
  descriptionEn: string;
  quantity: number;
  unit: "pcs" | "m" | "kg";
}

interface ManualItemInput extends ManualProductReference {
  id: string;
  reason: string;
  note: string | null;
  reserveBehavior: "project" | "off" | "custom";
  reservePercent: number | null;
  packagingRounding: "on" | "off";
  packageSize: number;
  manuallyAdjusted: boolean;
}
```

The TypeScript above is the proposed normalized transport/persistence shape. The current in-memory
prototype keeps anchor model/size as review strings and connection manual product fields flattened;
production must migrate them to the normalized references only after `OPEN-02`, `OPEN-05`, and
`OPEN-06` are resolved.

## Contract invariants

1. IDs are stable, opaque, and used by relationships. User-facing codes/names may change.
2. Project route codes are non-empty and case-insensitively unique.
3. Every route has code, name, description, explicit system selection, endpoints, and ordered
   geometry before calculation readiness.
4. Straight `lengthM > 0`. Units are stored as `m`; catalogue dimensions/anchor sizes use `mm`.
5. A route uses either 3 m or 6 m deliverable straight sections; default 6 m; no automatic mixing.
6. Connections contain exactly two distinct-route endpoints, except T connections contain three.
7. Logical continuation adds no physical material.
8. Physical material is added only from a confirmed versioned catalogue/rule or an explicit manual
   item. An unresolved rule never invents a product code.
9. Support/anchor quantities retain their source (template, design rule, user, manual override, or
   calculation) and manual changes retain reason/note where required.
10. WSTB supports one, two, or manual per support. Two is the provisional default and must retain
    Design assumption status until `OPEN-07` closes.
11. Exact anchor model and size are user selections. Suitability for substrate/load always requires
    engineering review in MVP.
12. Project reserve is independently selectable/off/custom per manual BOM row.
13. For linear sections, determine required deliverable sections first, apply reserve second, and
    round to whole deliverable sections last.
14. Packaging rounding and package size are distinct from technical quantity and reserve.
15. Included accessories/fasteners are versioned catalogue data and must not be duplicated.
16. English export terms/descriptions are separate from translated UI strings.
17. Only explicitly created revisions are retained. BOM snapshots bind application/catalogue/rules
    versions and validation/manual state.
18. Approval may be performed only by Administrator or Reviewer; approved revisions are read-only.

## Proposed calculation readiness

The UI can move through review states even when engineering items are unresolved. A future backend
calculation-readiness response should separate:

```ts
interface ReadinessResult {
  blockingErrors: ValidationIssue[];
  warnings: ValidationIssue[];
  engineeringReview: ValidationIssue[];
  canCalculate: boolean;
  canApprove: boolean;
}
```

- `canCalculate` is false for required identity/system/route/geometry/connection errors.
- The behavior for missing cable load is intentionally unspecified pending `OPEN-01`.
- `canApprove` is false while any product code, anchor selection, catalogue compatibility, source
  version, or engineering-review item is unresolved.

## Versioned BOM snapshot requirements

A future retained BOM snapshot must include the project revision ID, application/catalogue/rules
versions, normalized inputs, per-row product code or explicit unresolved null, English description,
technical quantity/unit, package size/count, order/spare quantity, included-item references, source
and rule IDs, status, warning IDs/messages, manual override flag, and reproducible Why trace.

## Blockers to Frozen status

| Blocker                                                           | Affects stored contract | Affects calculation/result | Required owner decision           |
| ----------------------------------------------------------------- | ----------------------- | -------------------------- | --------------------------------- |
| `OPEN-01` missing-load severity                                   | Yes (`null` readiness)  | Yes                        | Product/engineering               |
| `OPEN-02` catalogue IDs/codes/package/included/compatibility data | Yes                     | Yes                        | Niedax catalogue owner            |
| `OPEN-03` endpoint/connection material rules                      | Yes                     | Yes                        | Niedax engineering/catalogue      |
| `OPEN-04` support rules                                           | Yes                     | Yes                        | Structural/electrical engineering |
| `OPEN-05` mounting templates/anchor counts                        | Yes                     | Yes                        | Engineering                       |
| `OPEN-06` anchor model/size/suitability                           | Yes                     | Yes                        | Engineering                       |
| `OPEN-07` WSTB default confirmation                               | Yes                     | Yes                        | Niedax                            |
| `OPEN-08` reserve/packaging precision and rounding                | Yes                     | Yes                        | Product/catalogue                 |
| `OPEN-09` revision/approval workflow                              | Yes                     | Snapshot/approval          | Product/security                  |
| `OPEN-10` authoritative Stage 1 functional field list             | Yes                     | Yes                        | Product owner                     |

When every blocker is closed, update the schema, fixtures, validation register, automatic-action
contract, tests, and this version together. Only then may the heading become
`MVP Input Contract v1 — Frozen`.
