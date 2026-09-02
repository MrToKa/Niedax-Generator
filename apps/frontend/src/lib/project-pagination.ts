export function appendProjectPage<T extends Readonly<{ id: string }>>(
  current: readonly T[],
  incoming: readonly T[]
): readonly T[] {
  const knownIds = new Set(current.map((project) => project.id));
  const appended: T[] = [];
  for (const project of incoming) {
    if (knownIds.has(project.id)) continue;
    knownIds.add(project.id);
    appended.push(project);
  }
  return [...current, ...appended];
}
