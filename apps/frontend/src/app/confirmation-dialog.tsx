"use client";

import { type ReactNode, type RefObject, useEffect, useId, useRef } from "react";

import { restoreDialogFocus } from "@/lib/dialog-focus";

interface ConfirmationDialogProps {
  readonly title: string;
  readonly description?: string | undefined;
  readonly cancelLabel: string;
  readonly confirmLabel: string;
  readonly busy?: boolean | undefined;
  readonly destructive?: boolean | undefined;
  readonly children?: ReactNode;
  readonly fallbackFocusRef?: RefObject<HTMLElement | null> | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function ConfirmationDialog({
  title,
  description,
  cancelLabel,
  confirmLabel,
  busy = false,
  destructive = false,
  children,
  fallbackFocusRef,
  onCancel,
  onConfirm
}: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => restoreDialogFocus(previousFocus.current, fallbackFocusRef?.current ?? null);
  }, [fallbackFocusRef]);

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirm-dialog workflow-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) {
            event.preventDefault();
            onCancel();
            return;
          }
          if (event.key !== "Tab") return;
          const focusable = Array.from(
            dialogRef.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
            ) ?? []
          );
          const first = focusable[0];
          const last = focusable.at(-1);
          if (!first || !last) return;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        ref={dialogRef}
        role="dialog"
      >
        <h2 id={titleId}>{title}</h2>
        {description ? <p id={descriptionId}>{description}</p> : null}
        {children}
        <div className="dialog-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={destructive ? "danger-button" : "primary-button"}
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
