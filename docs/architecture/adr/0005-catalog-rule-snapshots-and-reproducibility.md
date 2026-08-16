# ADR 0005: Catalog/rule snapshots and reproducible calculations

- Status: Accepted
- Date: 2026-08-16

## Context

Active catalogs and rules will evolve. Approved revisions must retain the exact products, included
items, assemblies, and rules that generated their quantities.

## Decision

Catalog and rule snapshots have opaque IDs, semantic versions, and SHA-256 content hashes.
Calculation inputs contain resolved normalized subsets tied to those snapshots. Activation changes
an active pointer only. Referenced snapshot contents and saved calculation results are immutable.

## Alternatives considered

- Store version text only: rejected because equal labels could hide changed content.
- Re-resolve old results against the active catalog: rejected because it breaks reproducibility.
- Copy only final BOM values: rejected because provenance and future review would be incomplete.

## Consequences

Storage may duplicate snapshot data, but revisions remain explainable and exports cannot drift.
Import validation and activation are separate operations.

## Follow-up actions

Design append-only snapshot tables and retention/backup policy in the persistence stage.
