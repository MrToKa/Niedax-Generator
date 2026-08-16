# Stage 4 ER model

This model describes the Stage 4 migrations `20260816010000_stage4_data_model.sql` and
`20260816020000_restrict_saved_bom_product_deletion.sql`. It is split by ownership boundary so that
keys and cardinalities remain readable. PostgreSQL column definitions and every index/check are
authoritative in the migrations.

## Catalog, rules, and assembly templates

```mermaid
erDiagram
    direction LR
    catalogVersions ||--|{ productSources : owns
    catalogVersions ||--|{ products : versions
    products ||--|{ productSourceLinks : traces
    productSources ||--|{ productSourceLinks : supports
    products ||--o{ productAttributes : characterizes
    products ||--o{ includedItems : parent
    products o|--o{ includedItems : included_product
    catalogVersions ||--o{ ruleSets : constrains
    ruleSets ||--o{ compatibilityRules : contains
    ruleSets ||--o{ calculationRules : contains
    ruleSets ||--o{ assemblyTemplates : governs
    catalogVersions ||--o{ assemblyTemplates : versions
    assemblyTemplates ||--|{ templateComponents : contains
    products o|--o{ templateComponents : resolves

    catalogVersions["catalog_versions"] {
        uuid id PK
        string scope UK
        string version UK
        string content_hash
        string status
        datetime activated_at
        datetime archived_at
    }
    productSources["product_sources"] {
        uuid id PK
        uuid catalog_version_id FK
        string document_identity UK
        string source_page UK
        string locale UK
        string verification_status
    }
    products["products"] {
        uuid id PK
        uuid catalog_version_id FK
        string product_code UK
        string category
        string variant_key
        string base_unit
        decimal minimum_package_quantity
        string availability_status
    }
    productSourceLinks["product_source_links"] {
        uuid product_id PK, FK
        uuid source_id PK, FK
        string fact_scope PK
        uuid catalog_version_id FK
        bool is_primary
    }
    productAttributes["product_attributes"] {
        uuid id PK
        uuid product_id FK
        string attribute_key UK
        string value_type
        decimal value_numeric
        string unit
        uuid source_id FK
    }
    includedItems["included_items"] {
        uuid id PK
        uuid parent_product_id FK
        uuid included_product_id FK
        decimal included_quantity
        string unit
        uuid source_id FK
    }
    ruleSets["rule_sets"] {
        uuid id PK
        uuid catalog_version_id FK
        string scope UK
        string version UK
        string content_hash
        string status
    }
    compatibilityRules["compatibility_rules"] {
        uuid id PK
        uuid rule_set_id FK
        string stable_code UK
        string version UK
        int priority
        string decision
        json condition_payload
        json outcome_payload
    }
    calculationRules["calculation_rules"] {
        uuid id PK
        uuid rule_set_id FK
        string stable_code UK
        string version UK
        string rule_type
        int priority
        json parameters
        string confidence
    }
    assemblyTemplates["assembly_templates"] {
        uuid id PK
        uuid catalog_version_id FK
        uuid rule_set_id FK
        string stable_code UK
        string version UK
        string template_type
        string status
        json applicability
    }
    templateComponents["template_components"] {
        uuid id PK
        uuid template_id FK
        uuid product_id FK
        string component_role UK
        decimal quantity
        json quantity_expression
        string unit
        int anchor_count
    }
```

`catalog_versions` and `rule_sets` are managed release identities. A partial unique index permits
one active row per scope. Product codes are case-insensitively unique only inside a catalog version;
the same code may occur in another release. Products require at least one source link at transaction
commit. Product/source and template/product composite foreign keys prevent facts from silently
crossing catalog versions.

## Mutable project input and calculation draft

```mermaid
erDiagram
    direction LR
    users o|..o{ projects : owns
    catalogVersions ||--o{ projects : selected_catalog
    ruleSets ||--o{ projects : selected_rules
    projects ||--o{ routes : owns
    routes ||--o{ segments : orders
    routes ||--o{ fittings : places
    routes ||--|| supportConfigurations : configures
    routes ||--|{ routeEndpoints : exposes
    projects ||--o{ routeConnections : owns
    routeConnections ||--|{ routeConnectionEndpoints : has
    routeEndpoints ||--o| routeConnectionEndpoints : participates
    projects ||--o| calculationDrafts : current_draft
    projects ||--o{ manualItems : owns
    routes o|..o{ manualItems : scopes
    calculationDrafts o|..o{ manualItems : scopes

    users["users"] {
        uuid id PK
        string username UK
        string role
    }
    catalogVersions["catalog_versions"] {
        uuid id PK
        string version
        string status
    }
    ruleSets["rule_sets"] {
        uuid id PK
        string version
        string status
    }
    projects["projects"] {
        uuid id PK
        string code UK
        string status
        int draft_version
        uuid active_catalog_version_id FK
        uuid active_rule_set_id FK
        uuid owner_id FK
    }
    routes["routes"] {
        uuid id PK
        uuid project_id FK
        string code UK
        string system_series_id
        decimal default_section_length_m
        int sequence UK
    }
    segments["segments"] {
        uuid id PK
        uuid route_id FK
        uuid project_id FK
        int sequence UK
        decimal length_m
        json geometry
    }
    fittings["fittings"] {
        uuid id PK
        uuid route_id FK
        uuid project_id FK
        string fitting_type
        int sequence UK
        uuid selected_product_id FK
    }
    routeEndpoints["route_endpoints"] {
        uuid id PK
        uuid route_id FK
        uuid project_id FK
        string position UK
        string endpoint_kind
        uuid selected_product_id FK
    }
    routeConnections["route_connections"] {
        uuid id PK
        uuid project_id FK
        string connection_type
        string physical_material_behavior
        string support_behavior
    }
    routeConnectionEndpoints["route_connection_endpoints"] {
        uuid connection_id PK, FK
        uuid endpoint_id PK, FK
        uuid project_id FK
        int participant_order UK
        string participant_role UK
    }
    supportConfigurations["support_configurations"] {
        uuid id PK
        uuid route_id FK, UK
        uuid project_id FK
        decimal spacing_m
        uuid assembly_template_id FK
        uuid anchor_product_id FK
        decimal anchors_per_mounting_point
        string engineering_review_state
    }
    calculationDrafts["calculation_drafts"] {
        uuid id PK
        uuid project_id FK, UK
        string input_fingerprint
        uuid catalog_version_id FK
        uuid rule_set_id FK
        string status
        json input_payload
        json result_payload
    }
    manualItems["manual_items"] {
        uuid id PK
        uuid project_id FK
        uuid route_id FK
        uuid calculation_draft_id FK
        uuid catalog_product_id FK
        string free_text_description
        decimal quantity
        string unit
    }
```

Project input rows and the single calculation draft are mutable. Route code uniqueness is
case-insensitive and scoped to `project_id`. Deferred constraint triggers require exactly one start
and one end endpoint for every route and the correct two/three endpoint cardinality for every
connection. Composite `(id, project_id)` foreign keys make cross-project connections impossible.
An endpoint can belong to at most one connection. Manual items use an exclusive-or check between a
catalog product and free text.

## Saved revision and snapshot boundary

```mermaid
erDiagram
    direction LR
    projects ||--o{ revisions : saves
    revisions ||--o{ bomLines : snapshots
    revisions ||--o{ warnings : snapshots
    calculationDrafts ||--o{ warnings : reports
    revisions ||--o{ approvals : receives
    users ||--o{ approvals : decides
    products o|..o{ bomLines : live_trace

    projects["projects"] {
        uuid id PK
        int draft_version
        string status
    }
    calculationDrafts["calculation_drafts"] {
        uuid id PK
        uuid project_id FK, UK
        json input_payload
        json result_payload
    }
    revisions["revisions"] {
        uuid id PK
        uuid project_id FK
        int revision_number UK
        string status
        string input_checksum
        string snapshot_checksum
        string bom_checksum
        json input_snapshot
        json catalog_snapshot
        json rule_template_snapshot
        json calculation_result_snapshot
    }
    bomLines["bom_lines"] {
        uuid id PK
        uuid revision_id FK
        string line_identity UK
        int line_order UK
        uuid live_product_id FK
        json product_snapshot
        decimal technical_quantity
        decimal order_quantity
        string unit
        json source_snapshot
    }
    warnings["warnings"] {
        uuid id PK
        uuid calculation_draft_id FK
        uuid revision_id FK
        string warning_identity
        string code
        string category
        string severity
        json snapshot_context
    }
    approvals["approvals"] {
        uuid id PK
        uuid revision_id FK
        uuid actor_id FK
        string decision
        string actor_role
        json actor_snapshot
        string idempotency_key UK
    }
    products["products"] {
        uuid id PK
        string product_code
        string availability_status
    }
    users["users"] {
        uuid id PK
        string username
        string role
    }
    idempotencyRecords["idempotency_records"] {
        uuid id PK
        string scope UK
        string idempotency_key UK
        string request_hash
        uuid resource_id
    }
```

The transaction that creates `revisions` is the snapshot boundary. It locks the project, assigns
the next per-project revision number, and writes the validated calculation input, resolved catalog
facts/sources/attributes/included items, effective rules/templates/components, complete calculation
result, normalized BOM lines, and warnings. The three checksums cover input, catalog/rule snapshot,
and BOM respectively.

Revision lifecycle columns may transition from Calculated to Checked to Approved and finally to
Archived. A database trigger rejects changes to all payload, identity, provenance, and checksum
columns. BOM lines, revision warnings, and approval events are append-only. The persistence adapter
does not expose update/delete operations for immutable content.

## Delete and archival behavior

- Catalogs, rule sets, and products used by projects or saved BOM rows use `RESTRICT`; they are
  archived rather than deleted. The complete product snapshot remains independently available.
- Mutable route children cascade only when their owning route/project is deleted. A connected route
  cannot disappear silently because connection participants restrict endpoint deletion.
- Revisions, BOM lines, saved warnings, and approvals cannot cascade from project deletion and are
  protected from update/delete by triggers.
- Draft warnings and draft-scoped manual items cascade with the replaceable calculation draft.
