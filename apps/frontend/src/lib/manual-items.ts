import {
  ProjectManualItemDraftV2Schema,
  type ProjectDraftInputV2,
  type ProjectManualItemDraftV2
} from "@niedax/domain";

export function isManualItemValid(item: ProjectManualItemDraftV2): boolean {
  return ProjectManualItemDraftV2Schema.safeParse(item).success;
}

export function upsertManualItem(
  draft: ProjectDraftInputV2,
  item: ProjectManualItemDraftV2
): ProjectDraftInputV2 {
  const exists = draft.manualItems.some((candidate) => candidate.id === item.id);
  return {
    ...draft,
    manualItems: exists
      ? draft.manualItems.map((candidate) => (candidate.id === item.id ? item : candidate))
      : [...draft.manualItems, item]
  };
}

export function removeManualItem(draft: ProjectDraftInputV2, itemId: string): ProjectDraftInputV2 {
  return {
    ...draft,
    manualItems: draft.manualItems.filter((item) => item.id !== itemId)
  };
}
