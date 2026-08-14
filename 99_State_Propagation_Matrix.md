# 99 State Propagation Matrix

This matrix is normative for cross-store invalidation. Screen-specific Markdown remains normative for behavior inside one screen.

## State meanings

| State | Meaning |
|---|---|
| `DIRTY` | Current source inputs changed; a derived result must be regenerated. |
| `STALE` | An older result still exists, but its frozen source identity no longer matches current authoritative inputs. |
| `requiresReview` | A persisted topology/mapping assumption needs an engineer to review Screen 05. This is not a result freshness state. |

## Authoritative clocks

| Clock | Advances when |
|---|---|
| `component_revision` | Any Component Master field changes. |
| `solver_input_revision` | Component power, linked Rth/TIM/geometry, quantity/source representation, enablement, or other solver-affecting master data changes. |
| `limit_revision` | Component limit value/type changes. |
| `network_revision` | Screen 05 engineering graph changes; layout-only moves are excluded. |
| `scenario_revision` | Screen 01/06 scenario or boundary engineering inputs change. |

## Propagation matrix

| Upstream change | 05 `requiresReview` | 07 solution | 08 analysis | 09 distribution | 10 overview | 11 snapshot | 12 dependent artifacts |
|---|---:|---|---|---|---|---|---|
| Component power | No | `DIRTY` | `DIRTY` | `STALE` | `STALE` | `STALE` | `BLOCKED/WARNING` |
| Component linked Rjc/TIM/geometry | When topology/source representation needs review | `DIRTY` | `DIRTY` | `STALE` | `STALE` | `STALE` | `BLOCKED/WARNING` |
| Component quantity/template/enablement | Yes | `DIRTY` | `DIRTY` | `STALE` | `STALE` | `STALE` | `BLOCKED/WARNING` |
| **Component Limit value/type** | **No** | **remains CURRENT** | **`DIRTY`** | **`DIRTY` (or `STALE` while an old result exists)** | **`STALE`/dirty aggregate** | **`STALE`** | **`BLOCKED/WARNING`** |
| Screen 05 topology/Rth/enablement | No separate review flag required for the direct edit | `DIRTY` | `DIRTY` | `STALE` | `STALE` | `STALE` | `BLOCKED` for result artifacts |
| Screen 01/06 ambient, wind, solar, boundary, fixed T, power scale | No | `DIRTY` | `DIRTY` | `STALE` | `STALE` | `STALE` | `BLOCKED` for result artifacts |
| Screen 07 successful re-solve | Unchanged | new CURRENT solution | `DIRTY` | `DIRTY` | `DIRTY` | `STALE` | prior result artifacts blocked |
| Screen 08 rerun | Unchanged | Unchanged | new CURRENT analysis | Unchanged | `DIRTY` | `STALE` | bottleneck/report artifacts update |
| Screen 09 refresh | Unchanged | Unchanged | Unchanged | new CURRENT `distributionId` | `DIRTY` | `STALE` | distribution/report artifacts update |
| Screen 10 prepare snapshot | Unchanged | Unchanged | Unchanged | Unchanged | CURRENT live aggregate | new CURRENT snapshot | report/export may proceed |
| Screen 11 report-layout edit | Unchanged | Unchanged | Unchanged | Unchanged | Unchanged | Unchanged | report payload `DIRTY` only |
| Screen 12 export | No change | No change | No change | No change | No change | No change | session metadata only |

## Limit-only required chain

```text
Limit change
-> component_revision++ and limit_revision++
-> solver_input_revision unchanged
-> Screen 07 solution remains CURRENT
-> network requiresReview remains false
-> Screen 08 DIRTY
-> Screen 09 DIRTY/STALE
-> Screen 10 aggregate no longer current
-> Screen 11 snapshot STALE
-> Screen 12 dependent artifacts BLOCKED/WARNING
```

## Freshness comparisons

- Screen 07: `solveInputSignature` plus `solver_input_revision` and `network_revision`.
- Screen 08/09: Screen 07 solution identity plus current Component Master/Limit source revisions.
- Screen 10: frozen Screen 07/08/09 identities and freshness.
- Screen 11: snapshot `source_signature` versus the current Screen 10 aggregate.
- Screen 12: artifact-specific prerequisites; a valid engineering `FAIL` is exportable, stale or inconsistent source data is not.
