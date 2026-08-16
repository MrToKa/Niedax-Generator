import type {
  ActivateVersionCommandV1,
  ActivationResponseV1,
  ApproveRevisionCommandV1,
  CalculateCommandV1,
  CalculationRunResponseV1,
  CatalogImportValidationResultV1,
  CheckRevisionCommandV1,
  ExportArtifactV1,
  ExportRequestV1,
  ProjectDraftResponseV1,
  RevisionResponseV1,
  SaveRevisionCommandV1,
  UpsertProjectDraftCommandV1,
  ValidateProjectInputCommandV1,
  ValidationResultV1
} from "@niedax/domain";

export interface ProjectApplicationService {
  saveDraft(command: UpsertProjectDraftCommandV1): Promise<ProjectDraftResponseV1>;
  validate(command: ValidateProjectInputCommandV1): Promise<ValidationResultV1>;
  calculate(command: CalculateCommandV1): Promise<CalculationRunResponseV1>;
  saveRevision(command: SaveRevisionCommandV1): Promise<RevisionResponseV1>;
  checkRevision(command: CheckRevisionCommandV1): Promise<RevisionResponseV1>;
  approveRevision(command: ApproveRevisionCommandV1): Promise<RevisionResponseV1>;
}

export interface CatalogApplicationService {
  validateImport(importId: string, correlationId: string): Promise<CatalogImportValidationResultV1>;
  activateCatalog(
    command: Extract<ActivateVersionCommandV1, { readonly target: "catalog" }>
  ): Promise<ActivationResponseV1>;
  activateRules(
    command: Extract<ActivateVersionCommandV1, { readonly target: "rules" }>
  ): Promise<ActivationResponseV1>;
}

export interface ExportApplicationService {
  request(command: ExportRequestV1): Promise<ExportArtifactV1>;
}
