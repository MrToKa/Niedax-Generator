# ADR 0002: Pure calculation engine and JSON contract

- Status: Accepted
- Date: 2026-08-16

## Context

Calculations must be reproducible, independently testable, and callable without a browser, server,
database, ORM, clock, filesystem, or network.

## Decision

The engine accepts `CalculationInputV1` and returns `CalculationResultV1`. Inputs contain resolved
catalog products, assemblies, rule data, snapshot references, and application-supplied run/fingerprint
metadata. The engine performs no I/O and generates no IDs or timestamps. Stage 3 returns a
`contractOnly` result rather than inventing formulas.

## Alternatives considered

- Pass repository IDs and let the engine load data: rejected as non-deterministic infrastructure
  coupling.
- Pass ORM entities: rejected because persistence shape would become public domain shape.
- Implement speculative formulas: rejected because Stage 2 engineering decisions remain open.

## Consequences

Inputs are larger but self-contained and replayable. Application resolution must be complete before
invocation. Retained inputs/snapshots can reproduce a result using the recorded engine version.

## Follow-up actions

Implement each reviewed formula with golden tests while preserving the v1 boundary.
