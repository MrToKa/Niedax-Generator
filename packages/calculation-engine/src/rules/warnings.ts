import type { CalculationWarningV2, SourceReferenceV2, WarningCodeV2 } from "@niedax/domain";

import { stableId } from "../stable/ids.js";

export interface WarningRequest {
  readonly code: WarningCodeV2;
  readonly kind: "validation" | "catalog" | "engineering" | "manualOverride" | "projectRule";
  readonly severity: "info" | "warning" | "engineeringReview" | "blocking";
  readonly subject: { readonly kind: string; readonly id: string };
  readonly effect: string;
  readonly approvalImpact: "none" | "reviewRequired" | "blocksApproval";
  readonly path?: readonly (string | number)[] | null;
  readonly ruleId?: string | null;
  readonly productId?: string | null;
  readonly templateId?: string | null;
  readonly sourceRefs?: readonly SourceReferenceV2[];
  readonly overrideId?: string | null;
}

export class WarningCollector {
  readonly #warnings = new Map<string, CalculationWarningV2>();

  public add(request: WarningRequest): string {
    const id = stableId("warning", [
      request.code,
      request.subject.kind,
      request.subject.id,
      request.overrideId ?? "none"
    ]);
    if (!this.#warnings.has(id)) {
      this.#warnings.set(id, {
        id,
        code: request.code,
        kind: request.kind,
        severity: request.severity,
        subject: request.subject,
        path: request.path ?? null,
        messageKey: `calculation.${request.code.toLowerCase()}`,
        effect: request.effect,
        approvalImpact: request.approvalImpact,
        ruleId: request.ruleId ?? null,
        productId: request.productId ?? null,
        templateId: request.templateId ?? null,
        sourceRefs: request.sourceRefs ?? [],
        overrideId: request.overrideId ?? null
      });
    }
    return id;
  }

  public values(): readonly CalculationWarningV2[] {
    const severityOrder = { info: 0, warning: 1, engineeringReview: 2, blocking: 3 } as const;
    return [...this.#warnings.values()].sort(
      (left, right) =>
        severityOrder[left.severity] - severityOrder[right.severity] ||
        left.code.localeCompare(right.code) ||
        left.subject.kind.localeCompare(right.subject.kind) ||
        left.subject.id.localeCompare(right.subject.id) ||
        left.id.localeCompare(right.id)
    );
  }
}
