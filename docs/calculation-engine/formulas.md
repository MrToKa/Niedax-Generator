# Stage 6 formula catalog

All formula references use version `1.0.0`; the stable ID suffix `V1` is part of the semantic
identity. Exact decimal strings are used throughout.

| Formula ID                           | Symbolic expression and dimensions                                                   | Rounding/output                                       | Confidence and important edges                                                         | Tests                                |
| ------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------ |
| `SECTION.REQUIRED_PER_SEGMENT.V1`    | `n = ceil(L_segment[m] / L_supply[m])`; deliverable is `n × L_supply`                | Ceiling per segment before aggregation                | Explicit 3 m/6 m; no mixing/substitution; 3.1 m + 2.9 m at 6 m is two sections         | stage6, edge, property, golden       |
| `RESERVE.APPLY_AFTER_TECHNICAL.V1`   | Sections/counts: `ceil(q × (1 + p/100))`; continuous m/kg: exact multiplication      | Section and pcs counts upward; reserve delta separate | line/manual/project policy precedence                                                  | arithmetic, stage6, property, golden |
| `PACKAGING.ROUND_UP_TO_INCREMENT.V1` | `packages = ceil(q_reserved / increment)`; `q_ordered = packages × increment`        | Increment ceiling after reserve                       | disabled has no package count; straight increment is a whole selected-section multiple | stage6, property, golden             |
| `JOINT.INTERNAL_STRAIGHT_RUN.V1`     | `max(sum(sectionCount) - 1, 0)` pcs                                                  | integral count                                        | fitting/physical break ends run; logical continuation may join it                      | stage6, edge, golden                 |
| `CONNECTION.FITTING_SPECIFIC.V1`     | `event × component quantity × port/side count` pcs                                   | none                                                  | fitting once; assemblies/events owned once; correction replaces count                  | stage6, fittings golden              |
| `SUPPORT.BASE_CONTINUOUS_GROUP.V1`   | `ceil(totalLength[m] / spacing[m]) + 1` pcs                                          | ceiling before `+1`                                   | compatible shared logical routes form one group; 12 m / 1.5 m = 9                      | stage6, edge, property, golden       |
| `SUPPORT.EXTRA_AROUND_FITTING.V1`    | sum explicit fitting-rule quantities, pcs                                            | none                                                  | unresolved rule warns and adds zero                                                    | warning/assembly golden              |
| `SUPPORT.EXTRA_AT_CONNECTION.V1`     | sum owned before/after-side quantities, pcs                                          | none                                                  | each side counted once                                                                 | support tests/golden                 |
| `SUPPORT.MANUAL_CORRECTION.V1`       | sum explicit manual additions, pcs                                                   | none                                                  | original/additional values and reason traced                                           | stage6, assembly golden              |
| `ASSEMBLY.COMPONENT_QUANTITY.V1`     | fixed: `q`; perSupport: `q × supports`; perLevel: `q × levels`; manual: explicit `q` | none                                                  | fixed/perLevel once per group; missing values unresolved                               | stage6, assembly golden              |
| `ANCHOR.PER_SUPPORT_AXIS.V1`         | `supports × anchorsPerSupportAxis` pcs                                               | none                                                  | template original; override replaces before multiplication; no capacity claim          | stage6, assembly golden              |
| `WSTB.PER_SUPPORT.V1`                | `supports × {1, 2, custom}` pcs                                                      | none                                                  | default/two stays `projectRule`; dedicated rule owns quantity                          | stage6, edge, assembly golden        |
| `ENDPOINT.MATERIAL.V1`               | owned endpoint event × resolved quantity                                             | none                                                  | free/continuation/custom add none; connected endpoint defers; unresolved adds none     | route-end/warning golden             |
| `MANUAL.ITEM.V1`                     | explicit manual quantity in pcs/m/kg                                                 | shared reserve/package pipeline                       | catalog identity/unit exact; free text stays manual                                    | stage6, route-end golden             |

Trace-only reconciliation helpers are versioned too:

- `INCLUDED.SUPPRESS.V1`: `max(eligible demand - proven included quantity, 0)`;
- `DEMAND.AGGREGATE.V1`: sum only semantically compatible atomic demand;
- `MANUAL.QUANTITY_OVERRIDE.V1`: adjusted quantity replaces its traced original;
- `BOM.FINALIZE.V1`: final trace output equals the BOM ordered quantity.

Readable examples are the seven JSON pairs below `packages/calculation-engine/tests/golden`. Update
them only with `corepack pnpm calculation:golden:update`, review the trace/quantity diff, and rerun
tests.
