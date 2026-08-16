import type { CatalogImportValidationResultV1, Product, QuantityUnit } from "@niedax/domain";

export interface CatalogSourceRowV1 {
  readonly rowNumber: number;
  readonly productCode: string | null;
  readonly descriptionEn: string | null;
  readonly productType: string | null;
  readonly baseUnit: QuantityUnit | null;
  readonly packageSize: string | null;
  readonly includedProductCodes: readonly string[];
}

export interface CatalogImportContextV1 {
  readonly importId: string;
  readonly catalogSnapshotId: string;
  readonly catalogVersion: string;
  readonly sourceFileName: string;
  readonly sourceHash: string;
}

export interface CatalogRowMapper {
  map(row: CatalogSourceRowV1, context: CatalogImportContextV1): Product | null;
}

export interface CatalogImportValidator {
  validate(
    rows: readonly CatalogSourceRowV1[],
    context: CatalogImportContextV1
  ): CatalogImportValidationResultV1;
}

export interface StagedCatalog {
  readonly context: CatalogImportContextV1;
  readonly products: readonly Product[];
  readonly validation: CatalogImportValidationResultV1;
}

export interface CatalogStagingRepository {
  save(stagedCatalog: StagedCatalog): Promise<void>;
  find(importId: string): Promise<StagedCatalog | null>;
}
