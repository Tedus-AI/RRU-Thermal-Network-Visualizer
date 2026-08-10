# 04 Component Manager — Acceptance Checklist

- [x] All/Category tabs work.
- [x] Search/filter work.
- [x] Inline edits work.
- [x] Inspector edits Thermal Spec/Geometry/Architecture Prep.
- [x] Limit Type supports Tj/Tc/Ts/Custom/Unknown.
- [x] Unknown Rjc remains null/N/A, not zero.
- [x] Project Default vs Component Override is visible.
- [x] Thermal completeness updates.
- [x] Add/Duplicate/Disable/Delete/Bulk Edit work.
- [x] Save to Library excludes project-specific graph/FloTHERM/solver data.
- [x] Template/Base-zone/Qty preferences do not create Nodes/Edges.
- [x] Provenance is traceable.
- [x] Legacy unknown fields are preserved.
- [x] `externalMappings.flotherm` hook exists.
- [x] No FloTHERM parser exists yet.
- [x] No FloTHERM CSV headers are hard-coded.
- [x] `ResultValue<T>` supports source/scenario/reference/confidence.
- [x] Node types reserve analytical/flotherm/measurement temperatures.
- [x] Edge types reserve analytical/flotherm/measurement/manual Rth.
- [x] External results do not overwrite analytical values.
- [x] Thermal changes mark solver DIRTY / network review as appropriate.
- [x] Total Power is never Edge Q.
- [x] Fixed shared App Shell is used.
- [x] English-primary + zh-TW tooltip/bilingual support.
- [x] Empty/loading/error/read-only/dirty states exist.
- [x] Save & Continue routes to Screen 05.

## Where each item lives

| Area | Implementation |
| --- | --- |
| Per-field provenance | `src/domain/sourcedValue.ts` — `SourcedValue<T>` with source, reference, confidence |
| Multi-source results | `src/thermal/resultValue.ts` — `ResultValue<T>`, `TemperatureResultSet`, `EdgeRthSet`, `ExternalMappings` |
| Component model | `src/domain/component.ts` — thermal spec, geometry, board path, TIM, architecture prep, external mappings |
| Readiness / completeness / validation | `src/domain/componentReadiness.ts` — nine-item checklist, errors vs warnings |
| Invalidation matrix | `src/domain/componentInvalidation.ts` — 04 §32 encoded field by field |
| Legacy adapter | `src/adapters/legacyComponentAdapter.ts` — both directions, unknown fields preserved |
| Component library | `src/data/componentLibraryStore.ts` — strips project-specific data on save |
| Screen | `src/screens/04-component-manager/` |

## 03 FloTHERM deferred-compatibility review

What is reserved now, per 04 §28:

| Hook | Where |
| --- | --- |
| `externalMappings.flotherm` (aliases, preferred junction/case object, mapping status) | `ExternalMappings` on both `Component` and `ThermalNode` |
| `ResultValue<T>` with source / scenario / reference / confidence | `src/thermal/resultValue.ts` |
| Node analytical / FloTHERM / measurement temperature slots | `ThermalNode.temperature_results` |
| Edge analytical / FloTHERM / measurement / **manual** Rth slots | `RthValue` gained a `manual` slot; `RthValue.results` carries the richer per-source form |
| Active result-source selection | `RthValue.active_source`, `ActiveRthSource` |

What is deliberately absent:

- No FloTHERM parser, no `flothermTemperatureColumn` / `flothermHeatFlowColumn`, no CSV header
  assumptions anywhere in the codebase.
- No `flothermImportStore` (04 §31 explicitly says not yet).
- The External Mapping inspector panel has no upload control and no column detection — it stores
  free text and states that Screen 03 is deferred.
- `setRthFromSource()` still defaults `makeActive` to false, so a future import compares rather
  than takes over (00 Rule 9, 04 §28.5).

## Tests

`npm test` — 78 tests, all passing (15 solver + 35 import pipeline + 28 component manager).

Component-manager coverage:

- 04 §38 cases A–H: ready PA, missing Rjc (warning), negative Rjc (error), DDR held on `Tc`,
  Qty 4 `INDIVIDUAL` stored as preference only, FloTHERM alias stored unparsed, unknown legacy
  field surviving a round trip.
- Unknown Rjc is `{ value: null }` and never `0`.
- Contact area derivation: custom override → contact L×W → pad L×W → null.
- The full 04 §32 invalidation matrix, including the conditional rename rows and batch combining.
- Library save excludes base zone, FloTHERM mapping and profile status; rehydration returns an
  unmapped component.
- Legacy adapter: reads the current tool's shape, flags legacy geometry `needs_review` instead of
  reinterpreting it, refuses to invent a limit type, and preserves `tcPlacement` / `validation`.
- Multi-source Rth: analytical, FloTHERM, measurement and manual coexist and the analytical value
  stays the active source.

## Browser verification

Driven end-to-end against the running app on the demo project:

- KPI row: 18 components, 9 heat sources, 412.3 W, 0 ready, 8 warnings, 0 errors.
- Limit Type offers `Tj / Tc / Ts / Custom / Unknown`; nothing forces Tj.
- External Mapping panel contains **zero** upload controls; the typed alias
  `RF_Board/PA1/Package` is stored verbatim with `mapping_status: "unmapped"`.
- Setting the FPGA template to `BOTTOM_COOL_VIA` saved the preference while
  `thermal_profile_status` stayed `Not Assigned` and `tnv.thermal_networks` stayed `null` —
  no nodes, no edges.
- A component with unknown Rjc persisted as `{ value: null, source: "Imported", confidence: "low" }`.
- Bulk Edit applied `Tc` to every filtered row.
- No console or page errors.

## Known limitations

- Multi-select is single-row for now: Duplicate / Delete act on the inspector selection, and Bulk
  Edit applies to the current filtered set rather than a checkbox selection. 04 §24 lists the
  bulk-editable fields but not the selection mechanism; filter-then-bulk-edit was chosen because it
  makes the affected set visible before applying.
- The `Rjb` / `Rja` slots from 04 §15 exist on the model but are not surfaced in the inspector yet;
  neither is solved against.
- Optional columns from 04 §10 (Height, Contact Area, External Mapping, Last Updated) are stored and
  visible in the inspector but not yet toggleable in the table — the `Columns` control is not built.
- The field naming follows the codebase's existing snake_case rather than the camelCase sketch in
  04 §29. The semantics are identical.
- `Save to Library` writes to browser storage; there is no shared library backend yet.

## Next recommended step

`05_Thermal_Path_Builder` — the first screen allowed to create thermal nodes and edges, consuming
the architecture template, base-zone and Qty-modelling preferences prepared here.
