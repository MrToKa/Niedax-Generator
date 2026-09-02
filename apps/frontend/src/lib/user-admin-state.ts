export function addBusyUser(current: ReadonlySet<string>, userId: string): ReadonlySet<string> {
  const next = new Set(current);
  next.add(userId);
  return next;
}

export function removeBusyUser(current: ReadonlySet<string>, userId: string): ReadonlySet<string> {
  const next = new Set(current);
  next.delete(userId);
  return next;
}

export function userMutationIsCurrent(
  currentGeneration: number | undefined,
  generation: number
): boolean {
  return currentGeneration === generation;
}
