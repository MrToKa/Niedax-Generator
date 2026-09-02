export function sessionRequestIsCurrent(generation: number, currentGeneration: number): boolean {
  return generation === currentGeneration;
}

export function sessionIdentityMatches<T>(current: T | null, expected?: T | null): boolean {
  return expected === undefined || current === expected;
}
