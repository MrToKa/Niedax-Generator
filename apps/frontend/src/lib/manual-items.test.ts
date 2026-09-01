import type { ProjectManualItemDraftV2 } from "@niedax/domain";
import { describe, expect, it } from "vitest";

import { createEmptyProjectDraft } from "./editor-state";
import { isManualItemValid, removeManualItem, upsertManualItem } from "./manual-items";

type FreeTextManualItem = Extract<ProjectManualItemDraftV2, { readonly kind: "freeText" }>;

const item = (descriptionEn: string): FreeTextManualItem => ({
  id: crypto.randomUUID(),
  kind: "freeText",
  productId: null,
  productCode: null,
  descriptionEn,
  quantity: { value: "2", unit: "pcs" },
  reason: "Installation allowance",
  note: null,
  reservePolicy: { mode: "projectDefault" },
  packagingPolicy: { mode: "disabled", metadata: null },
  quantityOverride: null
});

describe("manual BOM item transitions", () => {
  it("validates, adds, edits, and removes a traceable manual input", () => {
    const original = item("Manual bracket");
    expect(isManualItemValid(original)).toBe(true);

    const added = upsertManualItem(createEmptyProjectDraft("P-01", "Plant"), original);
    const edited = upsertManualItem(added, { ...original, descriptionEn: "Edited bracket" });
    expect(edited.manualItems).toHaveLength(1);
    expect(edited.manualItems[0]).toMatchObject({ descriptionEn: "Edited bracket" });
    expect(removeManualItem(edited, original.id).manualItems).toEqual([]);
  });

  it("rejects non-positive quantities", () => {
    expect(isManualItemValid({ ...item("Invalid"), quantity: { value: "0", unit: "pcs" } })).toBe(
      false
    );
  });
});
