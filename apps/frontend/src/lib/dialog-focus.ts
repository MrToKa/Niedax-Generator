interface FocusTarget {
  readonly isConnected: boolean;
  focus(): void;
}

export function restoreDialogFocus(
  previous: FocusTarget | null,
  fallback: FocusTarget | null
): void {
  const target = previous?.isConnected ? previous : fallback?.isConnected ? fallback : null;
  target?.focus();
}
