import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { run } from "./lib/process.js";

const stage8Ids = {
  administrator: "30000000-0000-4000-8000-000000000901",
  designer: "30000000-0000-4000-8000-000000000902",
  reviewer: "30000000-0000-4000-8000-000000000903",
  catalog: "30000000-0000-4000-8000-000000000910",
  ruleSet: "30000000-0000-4000-8000-000000000911",
  project: "30000000-0000-4000-8000-000000000920",
  revision: "30000000-0000-4000-8000-000000000930",
  bomLine: "30000000-0000-4000-8000-000000000931",
  warning: "30000000-0000-4000-8000-000000000932",
  approval: "30000000-0000-4000-8000-000000000933",
  savedEvent: "30000000-0000-4000-8000-000000000941",
  checkedEvent: "30000000-0000-4000-8000-000000000942",
  approvedEvent: "30000000-0000-4000-8000-000000000943",
  bootstrapAudit: "30000000-0000-4000-8000-000000000951",
  designerAudit: "30000000-0000-4000-8000-000000000952",
  reviewerAudit: "30000000-0000-4000-8000-000000000953",
  saveIdempotency: "30000000-0000-4000-8000-000000000961",
  checkIdempotency: "30000000-0000-4000-8000-000000000962",
  approveIdempotency: "30000000-0000-4000-8000-000000000963",
  calculationRun: "30000000-0000-4000-8000-000000000970"
} as const;

const stage8CreatedAt = "2026-09-02T08:00:00.000Z";
const stage8CheckedAt = "2026-09-02T08:01:00.000Z";
const stage8ApprovedAt = "2026-09-02T08:02:00.000Z";
const stage8CatalogHash = `sha256:${"a".repeat(64)}`;
const stage8RuleHash = `sha256:${"b".repeat(64)}`;
const stage8InputFingerprint = `sha256:${"1".repeat(64)}`;

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}

function checksum(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`;
}

const administratorSnapshot = {
  id: stage8Ids.administrator,
  username: "backup.administrator",
  displayName: "Backup Administrator",
  role: "administrator"
};
const designerSnapshot = {
  id: stage8Ids.designer,
  username: "backup.designer",
  displayName: "Backup Designer",
  role: "designer"
};
const reviewerSnapshot = {
  id: stage8Ids.reviewer,
  username: "backup.reviewer",
  displayName: "Backup Reviewer",
  role: "reviewer"
};
const catalogReference = {
  snapshotId: stage8Ids.catalog,
  version: "1.0.0",
  contentHash: stage8CatalogHash
};
const ruleReference = {
  snapshotId: stage8Ids.ruleSet,
  version: "1.0.0",
  contentHash: stage8RuleHash
};
const projectSnapshot = {
  id: stage8Ids.project,
  draftVersion: 1,
  code: "BACKUP-STAGE8",
  name: "Backup Stage 8 synthetic project"
};
const bomLineSnapshot = {
  id: "backup-stage8-manual-line",
  kind: "manual",
  category: "manual",
  productId: null,
  manualInputId: "backup-stage8-manual-input",
  productCode: null,
  descriptionEn: "Synthetic manual item retained by backup and restore",
  unit: "pcs",
  technicalQuantity: { value: "2", unit: "pcs" },
  reserveQuantity: { value: "0", unit: "pcs" },
  reservedQuantity: { value: "2", unit: "pcs" },
  packageIncrement: { value: "1", unit: "pcs" },
  packageCount: null,
  packagingOverage: { value: "0", unit: "pcs" },
  orderedQuantity: { value: "2", unit: "pcs" },
  totalSpareQuantity: { value: "0", unit: "pcs" },
  sectionDetail: null,
  includedItems: [],
  sourceRefs: [{ kind: "manual", sourceId: "backup-stage8-manual-source" }],
  status: "manual",
  warningIds: ["backup-stage8-informational-warning"],
  traceStepIds: ["backup-stage8-trace-step"],
  provenance: {
    catalogSnapshotId: stage8Ids.catalog,
    ruleSnapshotId: stage8Ids.ruleSet,
    ruleIds: [],
    formulaIds: []
  }
};
const warningSnapshot = {
  id: "backup-stage8-informational-warning",
  code: "MANUAL_ITEM_RETAINED",
  kind: "manualOverride",
  severity: "info",
  subject: { kind: "manualItem", id: "backup-stage8-manual-input" },
  path: null,
  messageKey: "backup.stage8.manualItemRetained",
  effect: "Synthetic informational evidence for backup and restore.",
  approvalImpact: "none",
  ruleId: null,
  productId: null,
  templateId: null,
  overrideId: null,
  sourceRefs: []
};
const calculationInputSnapshot = {
  schemaVersion: "calculation-input/v2",
  invocation: {
    calculationRunId: stage8Ids.calculationRun,
    inputFingerprint: stage8InputFingerprint
  },
  project: { id: stage8Ids.project, code: "BACKUP-STAGE8" },
  catalogSnapshot: catalogReference,
  products: [],
  compatibilityRelations: [],
  ruleSnapshot: ruleReference,
  rules: [],
  assemblyTemplates: [],
  manualItems: [],
  productQuantityAdjustments: [],
  linePolicies: []
};
const catalogSnapshot = {
  schemaVersion: "catalog-revision-snapshot/v2",
  reference: catalogReference,
  products: [],
  compatibilityRelations: []
};
const ruleTemplateSnapshot = {
  schemaVersion: "rule-template-revision-snapshot/v2",
  reference: ruleReference,
  rules: [],
  assemblyTemplates: []
};
const calculationResultSnapshot = {
  schemaVersion: "calculation-result/v2",
  engineVersion: "1.0.0",
  calculationRunId: stage8Ids.calculationRun,
  inputFingerprint: stage8InputFingerprint,
  catalogSnapshot: catalogReference,
  ruleSnapshot: ruleReference,
  bomLines: [bomLineSnapshot],
  warnings: [warningSnapshot],
  summary: { bomLineCount: 1, warningCount: 1, approvalReady: true }
};
const stage8Checksums = {
  input: checksum(calculationInputSnapshot),
  project: checksum(projectSnapshot),
  snapshots: checksum({ catalogSnapshot, ruleTemplateSnapshot }),
  bom: checksum([bomLineSnapshot]),
  result: checksum(calculationResultSnapshot),
  warnings: checksum([warningSnapshot]),
  revision: checksum({
    projectSnapshot,
    inputSnapshot: calculationInputSnapshot,
    catalogSnapshot,
    ruleTemplateSnapshot,
    resultSnapshot: calculationResultSnapshot,
    bomLines: [bomLineSnapshot],
    warnings: [warningSnapshot]
  })
};

function jsonSql(value: unknown): string {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function stage8SeedSql(): string {
  const adminTarget = { ...administratorSnapshot, enabled: true };
  const designerTarget = { ...designerSnapshot, enabled: true };
  const reviewerTarget = { ...reviewerSnapshot, enabled: true };
  const idempotencyResponse = {
    schemaVersion: "backup-stage8-idempotency/v1",
    revisionId: stage8Ids.revision
  };
  return String.raw`\set ON_ERROR_STOP on
BEGIN;
INSERT INTO users (
  id,username,display_name,role,enabled,password_hash,password_algorithm,
  created_at,updated_at,created_by,updated_by
) VALUES (
  '${stage8Ids.administrator}','backup.administrator','Backup Administrator',
  'administrator',true,'test-only','test-only','${stage8CreatedAt}','${stage8CreatedAt}',NULL,NULL
);
INSERT INTO user_administration_audit_events (
  id,actor_id,actor_role,actor_snapshot,target_user_id,target_user_snapshot,action,
  prior_role,resulting_role,prior_enabled,resulting_enabled,correlation_id,reason_code,
  outcome,metadata,created_at
) VALUES (
  '${stage8Ids.bootstrapAudit}',NULL,NULL,'{}'::jsonb,'${stage8Ids.administrator}',
  ${jsonSql(adminTarget)},'user.created',NULL,'administrator',NULL,true,
  'backup-stage8-user-bootstrap',NULL,'succeeded','{"fixture":"backup-stage8"}'::jsonb,
  '${stage8CreatedAt}'
);
INSERT INTO users (
  id,username,display_name,role,enabled,password_hash,password_algorithm,
  created_at,updated_at,created_by,updated_by
) VALUES
  ('${stage8Ids.designer}','backup.designer','Backup Designer','designer',true,
   'test-only','test-only','${stage8CreatedAt}','${stage8CreatedAt}',
   '${stage8Ids.administrator}','${stage8Ids.administrator}'),
  ('${stage8Ids.reviewer}','backup.reviewer','Backup Reviewer','reviewer',true,
   'test-only','test-only','${stage8CreatedAt}','${stage8CreatedAt}',
   '${stage8Ids.administrator}','${stage8Ids.administrator}');
INSERT INTO user_administration_audit_events (
  id,actor_id,actor_role,actor_snapshot,target_user_id,target_user_snapshot,action,
  prior_role,resulting_role,prior_enabled,resulting_enabled,correlation_id,reason_code,
  outcome,metadata,created_at
) VALUES
  ('${stage8Ids.designerAudit}','${stage8Ids.administrator}','administrator',
   ${jsonSql(administratorSnapshot)},'${stage8Ids.designer}',${jsonSql(designerTarget)},
   'user.created',NULL,'designer',NULL,true,'backup-stage8-user-designer',NULL,
   'succeeded','{"fixture":"backup-stage8"}'::jsonb,'${stage8CreatedAt}'),
  ('${stage8Ids.reviewerAudit}','${stage8Ids.administrator}','administrator',
   ${jsonSql(administratorSnapshot)},'${stage8Ids.reviewer}',${jsonSql(reviewerTarget)},
   'user.created',NULL,'reviewer',NULL,true,'backup-stage8-user-reviewer',NULL,
   'succeeded','{"fixture":"backup-stage8"}'::jsonb,'${stage8CreatedAt}');

INSERT INTO catalog_versions (
  id,scope,version,label,content_hash,status,validation_schema_version,validated_at,
  validated_content_hash,approved_content_hash,approved_at,approved_by,activated_at,
  created_at,updated_at,created_by,updated_by
) VALUES (
  '${stage8Ids.catalog}','backup-stage8','1.0.0','Backup Stage 8 synthetic catalog',
  '${stage8CatalogHash}','active','catalog-validation/v1','${stage8CreatedAt}',
  '${stage8CatalogHash}','${stage8CatalogHash}','${stage8CreatedAt}',
  '${stage8Ids.administrator}',
  '${stage8CreatedAt}','${stage8CreatedAt}','${stage8CreatedAt}',
  '${stage8Ids.administrator}','${stage8Ids.administrator}'
);
INSERT INTO rule_sets (
  id,scope,version,label,content_hash,schema_version,catalog_version_id,status,
  validated_at,activated_at,created_at,updated_at,created_by,updated_by
) VALUES (
  '${stage8Ids.ruleSet}','backup-stage8','1.0.0','Backup Stage 8 synthetic rules',
  '${stage8RuleHash}','rule-set/v1','${stage8Ids.catalog}','active','${stage8CreatedAt}',
  '${stage8CreatedAt}','${stage8CreatedAt}','${stage8CreatedAt}',
  '${stage8Ids.administrator}','${stage8Ids.administrator}'
);
INSERT INTO projects (
  id,code,name,status,draft_version,active_catalog_version_id,active_rule_set_id,
  owner_id,created_by,updated_by,created_at,updated_at
) VALUES (
  '${stage8Ids.project}','BACKUP-STAGE8','Backup Stage 8 synthetic project','calculated',1,
  '${stage8Ids.catalog}','${stage8Ids.ruleSet}','${stage8Ids.designer}',
  '${stage8Ids.designer}','${stage8Ids.designer}','${stage8CreatedAt}','${stage8CreatedAt}'
);
COMMIT;

BEGIN;
INSERT INTO revisions (
  id,project_id,revision_number,name,comment,status,calculation_schema_version,
  engine_version,snapshot_schema_version,input_fingerprint,input_checksum,snapshot_checksum,
  bom_checksum,input_snapshot,project_snapshot,catalog_snapshot,rule_template_snapshot,
  calculation_result_snapshot,calculation_run_id,source_draft_version,catalog_snapshot_id,
  catalog_snapshot_version,catalog_snapshot_content_hash,rule_snapshot_id,rule_snapshot_version,
  rule_snapshot_content_hash,approval_ready,warning_summary,project_checksum,result_checksum,
  warnings_checksum,revision_checksum,idempotency_key,correlation_id,created_by,
  created_by_snapshot,created_at,updated_at
) VALUES (
  '${stage8Ids.revision}','${stage8Ids.project}',1,'Backup Stage 8 revision',
  'Synthetic immutable backup evidence','calculated','calculation-input/v2','1.0.0',
  'revision-snapshot/v2','${stage8InputFingerprint}','${stage8Checksums.input}',
  '${stage8Checksums.snapshots}','${stage8Checksums.bom}',
  ${jsonSql(calculationInputSnapshot)},${jsonSql(projectSnapshot)},${jsonSql(catalogSnapshot)},
  ${jsonSql(ruleTemplateSnapshot)},${jsonSql(calculationResultSnapshot)},
  '${stage8Ids.calculationRun}',1,'${stage8Ids.catalog}','1.0.0','${stage8CatalogHash}',
  '${stage8Ids.ruleSet}','1.0.0','${stage8RuleHash}',true,
  '{"totalCount":1,"blocksApprovalCount":0,"reviewRequiredCount":0}'::jsonb,
  '${stage8Checksums.project}','${stage8Checksums.result}','${stage8Checksums.warnings}',
  '${stage8Checksums.revision}','backup-stage8-save-0001','backup-stage8-correlation-save',
  '${stage8Ids.designer}',${jsonSql(designerSnapshot)},'${stage8CreatedAt}','${stage8CreatedAt}'
);
INSERT INTO revision_bom_lines_v2 (
  id,revision_id,line_identity,line_order,kind,category,live_product_id,product_id,
  manual_input_id,product_code,description_en,unit,status,technical_quantity_value,
  technical_quantity_unit,reserve_quantity_value,reserve_quantity_unit,reserved_quantity_value,
  reserved_quantity_unit,package_increment_value,package_increment_unit,package_count_value,
  package_count_unit,packaging_overage_value,packaging_overage_unit,ordered_quantity_value,
  ordered_quantity_unit,total_spare_quantity_value,total_spare_quantity_unit,section_detail,
  included_items_snapshot,source_refs_snapshot,warning_ids_snapshot,trace_step_ids_snapshot,
  provenance_snapshot,line_snapshot,created_at
) VALUES (
  '${stage8Ids.bomLine}','${stage8Ids.revision}','backup-stage8-manual-line',0,'manual','manual',
  NULL,NULL,'backup-stage8-manual-input',NULL,
  'Synthetic manual item retained by backup and restore','pcs','manual','2','pcs','0','pcs',
  '2','pcs','1','pcs',NULL,NULL,'0','pcs','2','pcs','0','pcs',NULL,'[]'::jsonb,
  ${jsonSql(bomLineSnapshot.sourceRefs)},${jsonSql(bomLineSnapshot.warningIds)},
  ${jsonSql(bomLineSnapshot.traceStepIds)},${jsonSql(bomLineSnapshot.provenance)},
  ${jsonSql(bomLineSnapshot)},'${stage8CreatedAt}'
);
INSERT INTO revision_warnings_v2 (
  id,revision_id,warning_identity,warning_order,code,kind,severity,approval_impact,
  subject_kind,subject_id,path_snapshot,message_key,effect,rule_id,product_id,template_id,
  override_id,source_refs_snapshot,warning_payload,created_at
) VALUES (
  '${stage8Ids.warning}','${stage8Ids.revision}','backup-stage8-informational-warning',0,
  'MANUAL_ITEM_RETAINED','manualOverride','info','none','manualItem',
  'backup-stage8-manual-input',NULL,'backup.stage8.manualItemRetained',
  'Synthetic informational evidence for backup and restore.',NULL,NULL,NULL,NULL,'[]'::jsonb,
  ${jsonSql(warningSnapshot)},'${stage8CreatedAt}'
);
INSERT INTO revision_lifecycle_events (
  id,project_id,revision_id,action,actor_id,actor_role,actor_snapshot,prior_status,
  resulting_status,correlation_id,comment,reason_code,input_fingerprint,engine_version,
  catalog_snapshot_id,rule_snapshot_id,outcome,metadata,created_at
) VALUES (
  '${stage8Ids.savedEvent}','${stage8Ids.project}','${stage8Ids.revision}','revision.saved',
  '${stage8Ids.designer}','designer',${jsonSql(designerSnapshot)},NULL,'calculated',
  'backup-stage8-correlation-save','Synthetic immutable backup evidence',NULL,
  '${stage8InputFingerprint}','1.0.0','${stage8Ids.catalog}','${stage8Ids.ruleSet}',
  'succeeded','{"revisionNumber":1}'::jsonb,'${stage8CreatedAt}'
);
INSERT INTO idempotency_records (
  id,scope,idempotency_key,request_hash,resource_type,resource_id,response_status,
  response_schema_version,response_payload,created_at
) VALUES (
  '${stage8Ids.saveIdempotency}','backup.stage8.revision.save','backup-stage8-save-0001',
  'sha256:${"9".repeat(64)}','revision','${stage8Ids.revision}',201,
  'backup-stage8-idempotency/v1',${jsonSql({ ...idempotencyResponse, status: "calculated" })},
  '${stage8CreatedAt}'
);
COMMIT;

BEGIN;
INSERT INTO revision_lifecycle_events (
  id,project_id,revision_id,action,actor_id,actor_role,actor_snapshot,prior_status,
  resulting_status,correlation_id,comment,reason_code,input_fingerprint,engine_version,
  catalog_snapshot_id,rule_snapshot_id,outcome,metadata,created_at
) VALUES (
  '${stage8Ids.checkedEvent}','${stage8Ids.project}','${stage8Ids.revision}','revision.checked',
  '${stage8Ids.reviewer}','reviewer',${jsonSql(reviewerSnapshot)},'calculated','checked',
  'backup-stage8-correlation-check','Synthetic check evidence',NULL,
  '${stage8InputFingerprint}','1.0.0','${stage8Ids.catalog}','${stage8Ids.ruleSet}',
  'succeeded','{"revisionNumber":1}'::jsonb,'${stage8CheckedAt}'
);
UPDATE revisions
   SET status='checked',checked_at='${stage8CheckedAt}',updated_at='${stage8CheckedAt}'
 WHERE id='${stage8Ids.revision}';
INSERT INTO idempotency_records (
  id,scope,idempotency_key,request_hash,resource_type,resource_id,response_status,
  response_schema_version,response_payload,created_at
) VALUES (
  '${stage8Ids.checkIdempotency}','backup.stage8.revision.check','backup-stage8-check-0001',
  'sha256:${"a".repeat(64)}','revision','${stage8Ids.revision}',200,
  'backup-stage8-idempotency/v1',${jsonSql({ ...idempotencyResponse, status: "checked" })},
  '${stage8CheckedAt}'
);
COMMIT;

BEGIN;
INSERT INTO approvals (
  id,revision_id,decision,actor_id,actor_role,actor_snapshot,comment,reason,decided_at,
  correlation_id,idempotency_key
) VALUES (
  '${stage8Ids.approval}','${stage8Ids.revision}','approved','${stage8Ids.reviewer}',
  'reviewer',${jsonSql(reviewerSnapshot)},'Synthetic approval evidence',NULL,
  '${stage8ApprovedAt}','backup-stage8-correlation-approve','backup-stage8-approve-0001'
);
UPDATE revisions
   SET status='approved',approved_at='${stage8ApprovedAt}',updated_at='${stage8ApprovedAt}'
 WHERE id='${stage8Ids.revision}';
INSERT INTO revision_lifecycle_events (
  id,project_id,revision_id,action,actor_id,actor_role,actor_snapshot,prior_status,
  resulting_status,correlation_id,comment,reason_code,input_fingerprint,engine_version,
  catalog_snapshot_id,rule_snapshot_id,outcome,metadata,created_at
) VALUES (
  '${stage8Ids.approvedEvent}','${stage8Ids.project}','${stage8Ids.revision}',
  'revision.approved','${stage8Ids.reviewer}','reviewer',${jsonSql(reviewerSnapshot)},
  'checked','approved','backup-stage8-correlation-approve','Synthetic approval evidence',NULL,
  '${stage8InputFingerprint}','1.0.0','${stage8Ids.catalog}','${stage8Ids.ruleSet}',
  'succeeded','{"revisionNumber":1}'::jsonb,'${stage8ApprovedAt}'
);
INSERT INTO idempotency_records (
  id,scope,idempotency_key,request_hash,resource_type,resource_id,response_status,
  response_schema_version,response_payload,created_at
) VALUES (
  '${stage8Ids.approveIdempotency}','backup.stage8.revision.approve',
  'backup-stage8-approve-0001','sha256:${"b".repeat(64)}','revision',
  '${stage8Ids.revision}',200,'backup-stage8-idempotency/v1',
  ${jsonSql({ ...idempotencyResponse, status: "approved" })},'${stage8ApprovedAt}'
);
COMMIT;
`;
}

const stage8FixtureCountsSql = `
SELECT concat_ws('|',
  (SELECT count(*) FROM users WHERE id IN (
    '${stage8Ids.administrator}','${stage8Ids.designer}','${stage8Ids.reviewer}'
  )),
  (SELECT count(*) FROM catalog_versions WHERE id='${stage8Ids.catalog}'),
  (SELECT count(*) FROM rule_sets WHERE id='${stage8Ids.ruleSet}'),
  (SELECT count(*) FROM projects WHERE id='${stage8Ids.project}'),
  (SELECT count(*) FROM revisions WHERE id='${stage8Ids.revision}'),
  (SELECT count(*) FROM revision_bom_lines_v2 WHERE id='${stage8Ids.bomLine}'),
  (SELECT count(*) FROM revision_warnings_v2 WHERE id='${stage8Ids.warning}'),
  (SELECT count(*) FROM revision_lifecycle_events WHERE revision_id='${stage8Ids.revision}'),
  (SELECT count(*) FROM approvals WHERE id='${stage8Ids.approval}'),
  (SELECT count(*) FROM user_administration_audit_events WHERE id IN (
    '${stage8Ids.bootstrapAudit}','${stage8Ids.designerAudit}','${stage8Ids.reviewerAudit}'
  )),
  (SELECT count(*) FROM idempotency_records WHERE id IN (
    '${stage8Ids.saveIdempotency}','${stage8Ids.checkIdempotency}',
    '${stage8Ids.approveIdempotency}'
  ))
)`;
const expectedStage8FixtureCounts = "3|1|1|1|1|1|1|3|1|3|3";

const stage8FixtureSnapshotSql = `
SELECT jsonb_build_object(
  'users',(
    SELECT jsonb_agg(to_jsonb(selected) ORDER BY selected.id)
      FROM (SELECT * FROM users WHERE id IN (
        '${stage8Ids.administrator}','${stage8Ids.designer}','${stage8Ids.reviewer}'
      )) selected
  ),
  'catalogVersions',(
    SELECT jsonb_agg(to_jsonb(selected) ORDER BY selected.id)
      FROM (SELECT * FROM catalog_versions WHERE id='${stage8Ids.catalog}') selected
  ),
  'ruleSets',(
    SELECT jsonb_agg(to_jsonb(selected) ORDER BY selected.id)
      FROM (SELECT * FROM rule_sets WHERE id='${stage8Ids.ruleSet}') selected
  ),
  'projects',(
    SELECT jsonb_agg(to_jsonb(selected) ORDER BY selected.id)
      FROM (SELECT * FROM projects WHERE id='${stage8Ids.project}') selected
  ),
  'revisions',(
    SELECT jsonb_agg(to_jsonb(selected) ORDER BY selected.id)
      FROM (SELECT * FROM revisions WHERE id='${stage8Ids.revision}') selected
  ),
  'bomLines',(
    SELECT jsonb_agg(to_jsonb(selected) ORDER BY selected.id)
      FROM (SELECT * FROM revision_bom_lines_v2 WHERE id='${stage8Ids.bomLine}') selected
  ),
  'warnings',(
    SELECT jsonb_agg(to_jsonb(selected) ORDER BY selected.id)
      FROM (SELECT * FROM revision_warnings_v2 WHERE id='${stage8Ids.warning}') selected
  ),
  'lifecycleEvents',(
    SELECT jsonb_agg(to_jsonb(selected) ORDER BY selected.created_at,selected.id)
      FROM (SELECT * FROM revision_lifecycle_events
             WHERE revision_id='${stage8Ids.revision}') selected
  ),
  'approvals',(
    SELECT jsonb_agg(to_jsonb(selected) ORDER BY selected.id)
      FROM (SELECT * FROM approvals WHERE id='${stage8Ids.approval}') selected
  ),
  'userAdministrationAudit',(
    SELECT jsonb_agg(to_jsonb(selected) ORDER BY selected.id)
      FROM (SELECT * FROM user_administration_audit_events WHERE id IN (
        '${stage8Ids.bootstrapAudit}','${stage8Ids.designerAudit}','${stage8Ids.reviewerAudit}'
      )) selected
  ),
  'idempotencyRecords',(
    SELECT jsonb_agg(to_jsonb(selected) ORDER BY selected.id)
      FROM (SELECT * FROM idempotency_records WHERE id IN (
        '${stage8Ids.saveIdempotency}','${stage8Ids.checkIdempotency}',
        '${stage8Ids.approveIdempotency}'
      )) selected
  )
)::text`;

const stage8AppendOnlyAssertionsSql = String.raw`
DO $stage8_backup_protection$
BEGIN
  BEGIN
    UPDATE revisions SET name='tampered' WHERE id='${stage8Ids.revision}';
    RAISE EXCEPTION 'revision payload mutation was accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    UPDATE revision_bom_lines_v2 SET description_en='tampered'
      WHERE id='${stage8Ids.bomLine}';
    RAISE EXCEPTION 'normalized BOM mutation was accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM revision_warnings_v2 WHERE id='${stage8Ids.warning}';
    RAISE EXCEPTION 'normalized warning deletion was accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    UPDATE revision_lifecycle_events SET metadata='{"tampered":true}'::jsonb
      WHERE id='${stage8Ids.savedEvent}';
    RAISE EXCEPTION 'revision lifecycle mutation was accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM approvals WHERE id='${stage8Ids.approval}';
    RAISE EXCEPTION 'approval deletion was accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM user_administration_audit_events WHERE id='${stage8Ids.bootstrapAudit}';
    RAISE EXCEPTION 'user administration audit deletion was accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END
$stage8_backup_protection$`;

const root = await mkdtemp(path.join(tmpdir(), "niedax-backup-test-"));
const backups = path.join(root, "backups");
const secrets = path.join(root, "secrets");
await mkdir(backups, { mode: 0o700 });
await mkdir(secrets, { mode: 0o700 });
const secretValues = new Map<string, string>();
for (const name of [
  "postgres_admin_password",
  "postgres_app_password",
  "postgres_migrator_password",
  "postgres_backup_password"
]) {
  const value = randomBytes(32).toString("base64url");
  secretValues.set(name, value);
  await writeFile(path.join(secrets, name), value, { mode: 0o600 });
}

const project = `niedax-backup-test-${process.pid}-${Date.now()}`.toLowerCase();
const file = "database/tests/compose.backup.yaml";
const environment = {
  ...process.env,
  BACKUP_TEST_DIRECTORY: backups,
  BACKUP_TEST_SECRETS: secrets
};
const base = ["compose", "-p", project, "-f", file];

function postgresQuery(sql: string): string {
  return run(
    "docker",
    [
      ...base,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "niedax_generator",
      "-Atc",
      sql
    ],
    { env: environment, capture: true }
  );
}

try {
  run("docker", [...base, "build", "migrations", "backup"], { env: environment });
  run("docker", [...base, "up", "--detach", "--wait", "postgres"], { env: environment });
  run("docker", [...base, "run", "--rm", "--no-deps", "migrations"], {
    env: environment
  });
  const seedPath = path.join(root, "stage8-backup-seed.sql");
  await writeFile(seedPath, stage8SeedSql(), { mode: 0o600 });
  const postgresContainerId = run("docker", [...base, "ps", "-q", "postgres"], {
    env: environment,
    capture: true
  });
  if (postgresContainerId.length === 0)
    throw new Error("Backup integration PostgreSQL container was not found");
  run("docker", ["cp", seedPath, `${postgresContainerId}:/tmp/stage8-backup-seed.sql`], {
    env: environment
  });
  run(
    "docker",
    [
      ...base,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "niedax_generator",
      "-f",
      "/tmp/stage8-backup-seed.sql"
    ],
    { env: environment }
  );
  const stage8CountsBeforeBackup = postgresQuery(stage8FixtureCountsSql);
  if (stage8CountsBeforeBackup !== expectedStage8FixtureCounts) {
    throw new Error(
      `Stage 8 backup fixture was incomplete: expected ${expectedStage8FixtureCounts}, got ${stage8CountsBeforeBackup}`
    );
  }
  const stage8SnapshotBeforeBackup = postgresQuery(stage8FixtureSnapshotSql);
  run("docker", [...base, "run", "--rm", "backup", "create"], { env: environment });
  const dump = (await readdir(backups)).find((name) => name.endsWith(".dump"));
  if (!dump) throw new Error("Backup integration test did not create a dump");
  run("docker", [...base, "run", "--rm", "backup", "verify", dump], { env: environment });
  const sidecarPath = path.join(backups, `${dump}.sha256`);
  const originalSidecar = await readFile(sidecarPath, "utf8");
  const checksum = originalSidecar.slice(0, 64);
  const alternateDump = "20000101T000000Z_niedax_generator_pg18.dump";
  await copyFile(path.join(backups, dump), path.join(backups, alternateDump));
  await writeFile(sidecarPath, `${checksum}  ${alternateDump}\n`, { mode: 0o600 });
  const mismatchedSidecarResult = run(
    "docker",
    [...base, "run", "--rm", "backup", "verify", dump],
    { env: environment, allowFailure: true, capture: true }
  );
  if (mismatchedSidecarResult.includes(`Verified ${dump}`)) {
    throw new Error("Backup verification accepted a sidecar for a different archive");
  }
  await writeFile(sidecarPath, `${originalSidecar.trimEnd()}\n${checksum}  ${alternateDump}\n`, {
    mode: 0o600
  });
  const multiRecordSidecarResult = run(
    "docker",
    [...base, "run", "--rm", "backup", "verify", dump],
    { env: environment, allowFailure: true, capture: true }
  );
  if (multiRecordSidecarResult.includes(`Verified ${dump}`)) {
    throw new Error("Backup verification accepted a sidecar with multiple records");
  }
  await writeFile(sidecarPath, originalSidecar, { mode: 0o600 });
  await rm(path.join(backups, alternateDump));
  run("docker", [...base, "run", "--rm", "backup", "verify", dump], { env: environment });
  run(
    "docker",
    [
      ...base,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "niedax_generator",
      "-c",
      "INSERT INTO users (username, display_name, role, password_hash, password_algorithm) VALUES ('restore_test', 'Restore Test', 'reviewer', 'test-only', 'test-only')"
    ],
    { env: environment }
  );
  const backupPassword = secretValues.get("postgres_backup_password");
  if (backupPassword === undefined) throw new Error("Backup test password was not generated");
  await writeFile(
    path.join(secrets, "postgres_backup_password"),
    "intentionally-invalid-password",
    {
      mode: 0o600
    }
  );
  run(
    "docker",
    [
      ...base,
      "run",
      "--rm",
      "-e",
      `RESTORE_CONFIRMATION=niedax_generator ${dump}`,
      "backup",
      "restore-confirmed",
      dump
    ],
    { env: environment, allowFailure: true }
  );
  const preservedCount = run(
    "docker",
    [
      ...base,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "niedax_generator",
      "-Atc",
      "SELECT count(*) FROM users WHERE username='restore_test'"
    ],
    { env: environment, capture: true }
  );
  if (preservedCount !== "1")
    throw new Error("Restore continued after its required safety backup failed");
  const dumpsAfterFailedSafetyBackup = (await readdir(backups)).filter((name) =>
    name.endsWith(".dump")
  );
  if (dumpsAfterFailedSafetyBackup.length !== 1)
    throw new Error("Failed safety backup left a promoted archive behind");
  await writeFile(path.join(secrets, "postgres_backup_password"), backupPassword, { mode: 0o600 });
  run(
    "docker",
    [
      ...base,
      "run",
      "--rm",
      "-e",
      `RESTORE_CONFIRMATION=niedax_generator ${dump}`,
      "backup",
      "restore-confirmed",
      dump
    ],
    { env: environment }
  );
  const count = run(
    "docker",
    [
      ...base,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "niedax_generator",
      "-Atc",
      "SELECT count(*) FROM users WHERE username='restore_test'"
    ],
    { env: environment, capture: true }
  );
  if (count !== "0")
    throw new Error("Disposable restore did not return the database to backup state");
  run(
    "docker",
    [...base, "run", "--rm", "--no-deps", "migrations", "node", "dist/migrate.js", "verify"],
    { env: environment }
  );
  const restoredStage8Counts = postgresQuery(stage8FixtureCountsSql);
  if (restoredStage8Counts !== expectedStage8FixtureCounts) {
    throw new Error(
      `Restore returned an incomplete Stage 8 graph: expected ${expectedStage8FixtureCounts}, got ${restoredStage8Counts}`
    );
  }
  const restoredStage8Snapshot = postgresQuery(stage8FixtureSnapshotSql);
  if (restoredStage8Snapshot !== stage8SnapshotBeforeBackup)
    throw new Error("Restore changed one or more exact Stage 8 protected rows");
  postgresQuery(stage8AppendOnlyAssertionsSql);
  if (postgresQuery(stage8FixtureSnapshotSql) !== stage8SnapshotBeforeBackup)
    throw new Error("A restored Stage 8 append-only protection check changed protected data");
  const accessPolicyViolation = run(
    "docker",
    [
      ...base,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "niedax_generator",
      "-Atc",
      "SELECT NOT has_table_privilege('niedax_generator_app', 'public.users', 'SELECT') OR NOT has_table_privilege('niedax_generator_app', 'public.users', 'INSERT') OR has_table_privilege('niedax_generator_app', 'public.users', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.users', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.users', 'TRUNCATE') OR NOT has_column_privilege('niedax_generator_app', 'public.users', 'role', 'UPDATE') OR NOT has_column_privilege('niedax_generator_app', 'public.users', 'enabled', 'UPDATE') OR NOT has_column_privilege('niedax_generator_app', 'public.users', 'updated_at', 'UPDATE') OR NOT has_column_privilege('niedax_generator_app', 'public.users', 'updated_by', 'UPDATE') OR has_column_privilege('niedax_generator_app', 'public.users', 'id', 'UPDATE') OR has_column_privilege('niedax_generator_app', 'public.users', 'username', 'UPDATE') OR has_column_privilege('niedax_generator_app', 'public.users', 'display_name', 'UPDATE') OR has_column_privilege('niedax_generator_app', 'public.users', 'password_hash', 'UPDATE') OR has_column_privilege('niedax_generator_app', 'public.users', 'password_algorithm', 'UPDATE') OR has_column_privilege('niedax_generator_app', 'public.users', 'created_at', 'UPDATE') OR has_column_privilege('niedax_generator_app', 'public.users', 'created_by', 'UPDATE') OR NOT has_table_privilege('niedax_generator_app', 'public.sessions', 'SELECT') OR NOT has_table_privilege('niedax_generator_app', 'public.sessions', 'INSERT') OR has_table_privilege('niedax_generator_app', 'public.sessions', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.sessions', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.sessions', 'TRUNCATE') OR NOT has_column_privilege('niedax_generator_app', 'public.sessions', 'revoked_at', 'UPDATE') OR NOT has_column_privilege('niedax_generator_app', 'public.sessions', 'last_seen_at', 'UPDATE') OR has_column_privilege('niedax_generator_app', 'public.sessions', 'token_hash', 'UPDATE') OR has_column_privilege('niedax_generator_app', 'public.sessions', 'user_id', 'UPDATE') OR has_column_privilege('niedax_generator_app', 'public.sessions', 'expires_at', 'UPDATE') OR has_column_privilege('niedax_generator_app', 'public.sessions', 'created_at', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'SELECT') OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'INSERT') OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.schema_migrations', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.revisions', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.revisions', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.revisions', 'TRUNCATE') OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'status', 'UPDATE') OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'checked_at', 'UPDATE') OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'approved_at', 'UPDATE') OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'archived_at', 'UPDATE') OR NOT has_column_privilege('niedax_generator_app', 'public.revisions', 'updated_at', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.bom_lines', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.bom_lines', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.bom_lines', 'TRUNCATE') OR has_table_privilege('niedax_generator_app', 'public.approvals', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.approvals', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.approvals', 'TRUNCATE') OR NOT has_table_privilege('niedax_generator_app', 'public.warnings', 'UPDATE') OR NOT has_table_privilege('niedax_generator_app', 'public.warnings', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.idempotency_records', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.idempotency_records', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.idempotency_records', 'TRUNCATE') OR has_table_privilege('niedax_generator_app', 'public.revision_bom_lines_v2', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.revision_bom_lines_v2', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.revision_bom_lines_v2', 'TRUNCATE') OR has_table_privilege('niedax_generator_app', 'public.revision_warnings_v2', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.revision_warnings_v2', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.revision_warnings_v2', 'TRUNCATE') OR has_table_privilege('niedax_generator_app', 'public.revision_lifecycle_events', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.revision_lifecycle_events', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.revision_lifecycle_events', 'TRUNCATE') OR has_table_privilege('niedax_generator_app', 'public.user_administration_audit_events', 'UPDATE') OR has_table_privilege('niedax_generator_app', 'public.user_administration_audit_events', 'DELETE') OR has_table_privilege('niedax_generator_app', 'public.user_administration_audit_events', 'TRUNCATE')"
    ],
    { env: environment, capture: true }
  );
  if (accessPolicyViolation !== "f")
    throw new Error("Restore did not reconcile protected application-role privileges");
  process.stdout.write(
    "Disposable backup create, exact Stage 8 graph restore, append-only enforcement, exact sidecar binding, fail-closed safety backup, archive verification, atomic restore, full migration-history verification, and restored ACL reconciliation passed.\n"
  );
} finally {
  run("docker", [...base, "down", "--volumes", "--remove-orphans"], {
    env: environment,
    allowFailure: true
  });
  const resolvedRoot = path.resolve(root);
  if (resolvedRoot.startsWith(path.resolve(tmpdir()) + path.sep)) {
    await rm(resolvedRoot, { recursive: true, force: true });
  } else {
    process.stderr.write("Refused to remove a non-temporary integration-test directory.\n");
  }
}
