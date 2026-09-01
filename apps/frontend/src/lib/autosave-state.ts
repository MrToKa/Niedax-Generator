export type AutosaveStatus =
  "idle" | "unsaved" | "saving" | "saved" | "validationBlocked" | "conflict" | "failed";

export interface PendingSave<T> {
  readonly generation: number;
  readonly content: string;
  readonly body: T;
  readonly expectedDraftVersion: number;
  readonly idempotencyKey: string;
}

export interface AutosaveState<T> {
  readonly status: AutosaveStatus;
  readonly draftVersion: number;
  readonly acknowledgedContent: string;
  readonly currentContent: string;
  readonly generation: number;
  readonly pending: PendingSave<T> | null;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)])
    );
  }
  return value;
}

export function contentSignature(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function calculationRequestWasSuperseded(
  requestedDraftVersion: number,
  acknowledgedDraftVersion: number
): boolean {
  return requestedDraftVersion !== acknowledgedDraftVersion;
}

export function requestContextWasSuperseded(
  requestedDraftVersion: number,
  requestedContent: string,
  acknowledgedDraftVersion: number,
  currentContent: string
): boolean {
  return (
    calculationRequestWasSuperseded(requestedDraftVersion, acknowledgedDraftVersion) ||
    requestedContent !== currentContent
  );
}

export function asyncRequestIsCurrent(
  requestedGeneration: number,
  currentGeneration: number,
  requestedLoadGeneration: number,
  currentLoadGeneration: number
): boolean {
  return (
    requestedGeneration === currentGeneration && requestedLoadGeneration === currentLoadGeneration
  );
}

export function initialAutosaveState<T>(draftVersion: number, value: T): AutosaveState<T> {
  const content = contentSignature(value);
  return {
    status: "idle",
    draftVersion,
    acknowledgedContent: content,
    currentContent: content,
    generation: 0,
    pending: null
  };
}

export function markAutosaveContent<T>(
  state: AutosaveState<T>,
  value: T,
  valid: boolean
): AutosaveState<T> {
  if (state.status === "conflict") return { ...state, currentContent: contentSignature(value) };
  const currentContent = contentSignature(value);
  if (!valid) return { ...state, currentContent, status: "validationBlocked" };
  if (currentContent === state.acknowledgedContent && state.pending === null) {
    return { ...state, currentContent, status: "saved" };
  }
  return { ...state, currentContent, status: state.pending ? "saving" : "unsaved" };
}

export function beginAutosave<T>(
  state: AutosaveState<T>,
  body: T,
  idempotencyKey: string
): AutosaveState<T> {
  if (state.pending) return state;
  const generation = state.generation + 1;
  return {
    ...state,
    status: "saving",
    generation,
    pending: {
      generation,
      content: contentSignature(body),
      body,
      expectedDraftVersion: state.draftVersion,
      idempotencyKey
    }
  };
}

export function completeAutosave<T>(
  state: AutosaveState<T>,
  generation: number,
  nextDraftVersion: number
): AutosaveState<T> {
  if (state.pending?.generation !== generation) return state;
  const acknowledgedContent = state.pending.content;
  const saved = state.currentContent === acknowledgedContent;
  return {
    ...state,
    status: saved ? "saved" : "unsaved",
    draftVersion: nextDraftVersion,
    acknowledgedContent,
    pending: null
  };
}

export function failAutosave<T>(
  state: AutosaveState<T>,
  generation: number,
  conflict: boolean
): AutosaveState<T> {
  if (state.pending?.generation !== generation) return state;
  return { ...state, status: conflict ? "conflict" : "failed", pending: null };
}

export function retryAutosave<T>(
  state: AutosaveState<T>,
  pending: PendingSave<T>
): AutosaveState<T> {
  const generation = state.generation + 1;
  return {
    ...state,
    status: "saving",
    generation,
    pending: { ...pending, generation }
  };
}
