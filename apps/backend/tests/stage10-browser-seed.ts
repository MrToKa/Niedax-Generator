import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

import {
  readStage10Accounts,
  stage10AccountNames,
  stage10Catalog as ids
} from "../../../scripts/lib/stage10-browser-fixture.js";
import { AuthService } from "../src/auth-service.js";
import { PgUserStore } from "../src/pg-store.js";

// This entry point exists only in the development acceptance image. The orchestrator
// mounts fresh generated secrets and validates the exact disposable topology first.
if (
  !/^niedax-stage10-[0-9]+-[0-9]+$/u.test(process.env.STAGE10_PROJECT ?? "") ||
  process.env.PGHOST !== "postgres"
)
  throw new Error("Refusing seed outside an explicitly disposable Stage 10 project");
const accounts = readStage10Accounts();
const migrator = new Pool({
  host: "postgres",
  database: "niedax_generator",
  user: "niedax_generator_migrator",
  password: await readFile("/run/secrets/postgres_migrator_password", "utf8")
});
const appPool = new Pool({
  host: "postgres",
  database: "niedax_generator",
  user: "niedax_generator_app",
  password: await readFile("/run/secrets/postgres_app_password", "utf8")
});
try {
  const auth = new AuthService(new PgUserStore(appPool), "stage10-setup-only-pepper");
  await auth.createInitialAdministrator({
    ...accounts.administrator,
    displayName: "Synthetic Stage 10 administrator"
  });
  const login = await auth.login(accounts.administrator.username, accounts.administrator.password);
  const identity = await auth.resolveSession(login.token);
  if (!identity) throw new Error("Synthetic bootstrap identity missing");
  for (const name of stage10AccountNames.filter((name) => name !== "administrator")) {
    await auth.createUser(
      identity,
      {
        ...accounts[name],
        displayName: `Synthetic Stage 10 ${name}`,
        role: name === "otherDesigner" ? "designer" : name
      },
      `stage10-seed-${name}`
    );
  }
  await auth.logout(login.token);
  const hash = (label: string) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
  const client = await migrator.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO catalog_versions (
      id,scope,version,label,source_metadata,content_hash,status,import_provenance,
      validation_schema_version,validated_at,validated_content_hash,approved_at,approved_content_hash,activated_at
    ) VALUES ($1,'stage10-synthetic',$2,'Synthetic browser and performance catalog',
      '{"fixture":true,"authoritative":false}',$3,'active','{"kind":"disposableStage10Fixture"}',
      'catalog-import-validation-result/v1',now(),$3,now(),$3,now())`,
      [ids.catalog, ids.version, hash("stage10-catalog-v1")]
    );
    await client.query(
      `INSERT INTO rule_sets (
      id,scope,version,label,content_hash,schema_version,catalog_version_id,status,validated_at,activated_at,provenance
    ) VALUES ($1,'stage10-synthetic',$2,'Synthetic browser and performance rules',$3,'rule-set/v1',$4,
      'active',now(),now(),'{"fixture":true,"authoritative":false}')`,
      [ids.rules, ids.version, hash("stage10-rules-v1"), ids.catalog]
    );
    await client.query(
      `INSERT INTO product_sources (
      id,catalog_version_id,document_identity,title,edition,source_page,locale,reference_uri,source_hash,verification_status,verified_at
    ) VALUES ($1,$2,'stage10-synthetic','Synthetic Stage 10 evidence; NOT a product source',$3,'fixture-1','en',
      'repo:apps/backend/tests/stage10-browser-seed.ts',$4,'verified',now())`,
      [ids.source, ids.catalog, ids.version, hash("stage10-source-v1")]
    );
    await client.query(
      `INSERT INTO products (
      id,catalog_version_id,product_code,category,family,series,description_en,material,coating,variant_key,
      base_unit,minimum_package_quantity,packaging_unit,availability_status,metadata,is_orderable,engineering_verification_required
    ) VALUES
      ($1,$4,'S10-SYN-STRAIGHT','straightSection','S10-SYN','S10','Synthetic 6 m straight section','steel','F','60x200',
       'm',6,'m','active','{"lengthMm":"6000"}',true,false),
      ($2,$4,'S10-SYN-SUPPORT','support','S10-SUPPORT','S10','Synthetic wall support','steel','F','wall',
       'pcs',1,'pcs','active','{}',true,false),
      ($3,$4,'S10-SYN-CONNECTOR','accessory','S10-CONNECTOR','S10','Synthetic connector','steel','F','joint',
       'pcs',2,'pcs','active','{}',true,false)`,
      [ids.straight, ids.support, ids.connector, ids.catalog]
    );
    await client.query(
      `INSERT INTO products (
      id,catalog_version_id,product_code,category,family,series,description_en,material,coating,variant_key,
      base_unit,minimum_package_quantity,packaging_unit,availability_status,metadata,is_orderable,engineering_verification_required,engineering_note
    ) VALUES ($1,$2,'S10-SYN-ANCHOR','anchor','S10-ANCHOR','S10','Synthetic anchor','steel','F','concrete',
      'pcs',10,'pcs','active','{}',true,true,'Synthetic only; engineering verification remains required.')`,
      [ids.anchor, ids.catalog]
    );
    await client.query(
      `INSERT INTO product_source_links (product_id,catalog_version_id,source_id,fact_scope,is_primary)
      VALUES ($1,$2,$3,'product',true)`,
      [ids.anchor, ids.catalog, ids.source]
    );
    await client.query(
      `INSERT INTO product_source_links (product_id,catalog_version_id,source_id,fact_scope,is_primary)
      SELECT product_id,$4,$5,'product',true FROM (VALUES ($1::uuid),($2::uuid),($3::uuid)) AS fixture(product_id)`,
      [ids.straight, ids.support, ids.connector, ids.catalog, ids.source]
    );
    await client.query(
      `INSERT INTO compatibility_rules (
      rule_set_id,stable_code,version,status,priority,decision,condition_schema_version,condition_payload,
      outcome_schema_version,outcome_payload,reason_en,confidence,source_id
    ) VALUES
      ($1,'S10-EXACT-SELECTION',$2,'active',10,'allowed','compatibility-condition/v1',
       '{"relationType":"project_selection","sourceProductCode":"S10-SYN-STRAIGHT","system":"S10-SYN","heightMm":"60","widthMm":"200","materialCode":"steel","finishCode":"F"}',
       'compatibility-outcome/v1','{"allowed":true}','Explicit synthetic selection','catalogConfirmed',$3),
      ($1,'S10-CONNECTOR',$2,'active',20,'allowed','compatibility-condition/v1',
       '{"relationType":"separately_ordered_connector","sourceProductCode":"S10-SYN-STRAIGHT"}',
       'compatibility-outcome/v1','{"targetProductCode":"S10-SYN-CONNECTOR","allowed":true}',
       'Explicit synthetic connector relation','catalogConfirmed',$3)`,
      [ids.rules, ids.version, ids.source]
    );
    await client.query(
      `INSERT INTO calculation_rules (
      rule_set_id,stable_code,version,rule_type,status,priority,parameter_schema_version,parameters,confidence,reason_en,source_id
    ) VALUES ($1,'S10-INTERNAL-JOINT',$2,'other','active',10,'calculation-rule/internal-joint/v2',$3,
      'catalogConfirmed','Synthetic one connector per joint; not a Niedax product rule',$4)`,
      [
        ids.rules,
        ids.version,
        {
          straightProductId: ids.straight,
          jointProductId: ids.connector,
          supplyOptionId: ids.supply,
          quantityPerJoint: { value: "1", unit: "pcs" }
        },
        ids.source
      ]
    );
    await client.query(
      `INSERT INTO compatibility_rules (
      rule_set_id,stable_code,version,status,priority,decision,condition_schema_version,condition_payload,
      outcome_schema_version,outcome_payload,reason_en,confidence,source_id
    ) VALUES ($1,'S10-ANCHOR-CONCRETE',$2,'active',30,'allowed','compatibility-condition/v1',
      '{"relationType":"anchor_substrate","sourceProductCode":"S10-SYN-ANCHOR"}',
      'compatibility-outcome/v1','{"targetSelector":{"substrate":"concrete"},"allowed":true}',
      'Synthetic substrate evidence; engineering verification required','engineeringReview',$3)`,
      [ids.rules, ids.version, ids.source]
    );
    await client.query(
      `INSERT INTO assembly_templates (
      id,catalog_version_id,rule_set_id,stable_code,version,status,template_type,name_en,description_en,
      applicability_schema_version,applicability,source_id
    ) VALUES ($1,$2,$3,'S10-WALL-SUPPORT',$4,'active','wall','Synthetic wall support assembly','Synthetic support only; no anchor-capacity claim',
      'assembly-applicability/v1','{"system":"S10-SYN","engineeringVerificationRequired":false}',$5)`,
      [ids.template, ids.catalog, ids.rules, ids.version, ids.source]
    );
    await client.query(
      `INSERT INTO template_components (
      template_id,catalog_version_id,component_role,product_id,quantity,unit,sequence,is_required,suppress_when_included,metadata
    ) VALUES ($1,$2,'support',$3,1,'pcs',0,true,false,'{"quantityMode":"per_support"}')`,
      [ids.template, ids.catalog, ids.support]
    );
    await client.query(
      `INSERT INTO template_components (
      template_id,catalog_version_id,component_role,product_id,quantity,unit,sequence,is_required,suppress_when_included,anchor_count,metadata
    ) VALUES ($1,$2,'anchor',$3,2,'pcs',1,true,false,2,'{"quantityMode":"per_support"}')`,
      [ids.template, ids.catalog, ids.anchor]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  process.stdout.write("Stage 10 generated accounts and explicitly synthetic catalog seeded.\n");
} finally {
  await Promise.all([migrator.end(), appPool.end()]);
}
