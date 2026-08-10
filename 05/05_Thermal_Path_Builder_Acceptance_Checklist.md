# 05 Thermal Path Builder — Acceptance Checklist

## Input / Qty
- [x] Reads Screen 04 readiness/preferences.
- [x] Aggregate works.
- [x] Individual works.
- [x] Grouped works.
- [x] Qty representation rebuild warning works.

## Templates
- [x] Bottom Cool + Copper Coin.
- [x] Bottom Cool + Thermal Via.
- [x] Top Cool + Lid.
- [x] Bare Die.
- [x] Small Base + Heat Pipe.
- [x] Direct Metal.
- [x] Templates use ports.
- [x] Templates do not hard-code Main Base.
- [x] Template preview shows requirements.
- [x] Manual changes are protected during rebuild.

## Shared structure / Graph
- [x] Single Base.
- [x] 3-Zone Base.
- [x] Functional Zones.
- [x] Custom zones.
- [x] HSK / Fin / Boundary placeholders.
- [x] Series.
- [x] Parallel.
- [x] Branch.
- [x] Merge.
- [x] Coupling cycles.
- [x] Not tree-only.
- [x] Stable IDs.
- [x] Persistent positions.
- [x] Node/Edge add/edit/delete/disable.
- [x] Undo/Redo.

## Rth / physics
- [x] Rjc model.
- [x] L/kA conduction.
- [x] TIM t/kA.
- [x] Via equivalent.
- [x] Heat Pipe equivalent.
- [x] Spreading can be unresolved.
- [x] Boundary Rth remains unresolved until 06.
- [x] Unknown Rth never becomes zero.
- [x] No final temperature solve.
- [x] No invented Edge Q.
- [x] Qty × Power is never Edge Q.

## Validation
- [x] Orphan source detected.
- [x] Unconnected required port detected.
- [x] Missing node reference error.
- [x] Negative Rth error.
- [x] Self-loop error.
- [x] Cycle not automatically error.
- [x] Duplicate edge warning.
- [x] Boundary-not-configured warning.
- [x] Blocking errors gate Continue.

## 03 compatibility
- [x] Node FloTHERM mapping hook.
- [x] Edge interface mapping hook.
- [x] Multi-source Rth slots.
- [x] Multi-source temperature slots.
- [x] No FloTHERM parser.
- [x] No hard-coded FloTHERM headers.
- [x] Analytical provenance preserved.

## UI / navigation
- [x] Fixed App Shell.
- [x] 5-step builder stepper.
- [x] English + zh-TW support.
- [x] Empty/loading/error/read-only/dirty states.
- [x] Save & Continue → Screen 06.

---

## AC-05-01 … AC-05-60

| AC | Where it is satisfied |
| --- | --- |
| 01 Reads readiness / template / qty / preferred zone | `ComponentPalette.tsx`, `defaultPrefFor()` |
| 02 Preview before commit | `previewGeneration()`, `GenerateNetworkPreview.tsx` — nothing is written until **Generate Network** |
| 03–05 Aggregate / Individual / Grouped | `idFactory.instanceKeys()` + `instanceMultiplier()`, `buildComponentSubgraph()` |
| 06 Representation change warns | `ThermalPathBuilderView.handlePrefChange()` → rebuild-risk modal |
| 07 Six built-in templates | `templateRegistry.ts` (+ CUSTOM) |
| 08 Templates use ports | `ThermalTemplate.ports`, asserted in tests |
| 09 No hard-coded Main Base | test asserts no template names `MAIN_BASE` / `HSK_BASE` / `NODE_ZONE_*` |
| 10 Preview shows missing requirements | `missingRequirements()`, `TemplatePalette.tsx` |
| 11 Rebuild distinguishes generated vs manual | `networkStore.replaceComponentSubgraph()`, `GraphObjectOrigin.modified` |
| 12–16 Shared structure presets and placeholders | `sharedStructure.ts`, `SharedStructurePanel.tsx` |
| 17–22 Series / parallel / branch / merge / cycles / not tree-only | graph is a plain node+edge map; cycle test in `thermalGraph.test.ts` |
| 23 Stable IDs | `idFactory.ts`; test rebuilds and compares id sets |
| 24 Positions persist | `layout.positions`, written on drag and on automatic layout, saved with the network |
| 25–26 Add/edit/delete/disable node and edge | inspectors + canvas context menu; `ThermalNode.disabled`, `ThermalEdge.enabled` |
| 27 Undo/Redo | `networkStore` history (50 steps), `networkStore.test.ts` |
| 28 Package Rjc | `directRth()`, seeded from `thermal_spec.r_jc_C_per_W` |
| 29 L/kA | `conductionRth()` — 10 mm / 200 W·m⁻¹K⁻¹ / 100 mm² = 0.5 °C/W |
| 30 TIM t/kA | `timRth()` — 0.1 mm / 3 W·m⁻¹K⁻¹ / 200 mm² ≈ 0.1667 °C/W |
| 31 Via equivalent | `viaArrayRth()` — needs an effective k, never derived from via count alone |
| 32 Heat pipe equivalent | vendor/manual Rth on the `heat_pipe` edge (`SMALL_BASE_HEAT_PIPE`, `HEAT_PIPE_MAIN_BASE`) |
| 33 Spreading may stay unresolved | `spreadingRth()` refuses to substitute L/kA |
| 34 Boundary-derived stays unresolved | `boundaryDerivedRth()`, `FIN_SURFACE → AMBIENT_PLACEHOLDER` |
| 35 Unknown Rth never zero | every calculator returns `{ value: null, resolution: 'unresolved' }`; asserted in tests and in the browser run |
| 36–43 Validation severities | `graphValidation.validateGraph()` |
| 44 Blocking errors gate Continue | `canContinue`, **Save & Continue** disabled while `errors > 0` |
| 45 No solve | no solver call anywhere in `screens/05-*`; node temperatures stay null |
| 46–47 No invented Q | `heat_flow_W` is never written; `Qty × Power` only sets a source node's `power_W` |
| 48 Topology/Rth change marks solver DIRTY | `networkStore.mutate()` → `solverStore.invalidate('topology_changed')` |
| 49–55 Screen 03 deferred contract | see the table below |
| 56 Fixed App Shell | `ScreenWorkspace` + shared shell; no header/sidebar/status bar defined here |
| 57 Five-step stepper | `BuilderStepper.tsx` (screen-specific, per `docs/APP_SHELL_CONTRACT.md`) |
| 58 English-primary + zh-TW | `FieldLabel` / `ColumnLabel` / `BilingualTooltip`, `tooltips.ts` |
| 59 Empty / loading / error / read-only / dirty | `EmptyNetworkState`, `LoadingState`, error card, read-only badge, unsaved badge |
| 60 Save & Continue → Screen 06 | routes to `/project/:projectId/boundary` |

## Where each item lives

| Area | Implementation |
| --- | --- |
| Template definitions (data, not React) | `src/thermal/templates/types.ts`, `templateRegistry.ts` |
| Stable IDs | `src/thermal/graph/idFactory.ts` |
| Subgraph generation, qty modelling, generate preview | `src/thermal/graph/networkBuilder.ts` |
| Shared base / HSK / boundary placeholder | `src/thermal/graph/sharedStructure.ts` |
| Analytical resistance | `src/thermal/resistance/calculators.ts` |
| Graph validation and KPIs | `src/thermal/graph/graphValidation.ts` |
| Single source of truth, history, rebuild protection | `src/data/networkStore.ts` |
| Screen | `src/screens/05-thermal-path-builder/` |

## 03 FloTHERM deferred-compatibility review

| Hook | Where |
| --- | --- |
| Node object-alias mapping (AC-05-49) | `ThermalNode.external_mappings.flotherm`, edited as free text in the Node Inspector |
| Edge interface mapping (AC-05-50) | `ThermalEdge.external_mappings.flotherm`, Edge Inspector → External Mapping |
| Multi-source Rth slots (AC-05-51) | `RthValue` — analytical / flotherm / measurement / manual, plus `RthValue.results` |
| Multi-source temperature slots (AC-05-52) | `ThermalNode.temperature_results` |
| No parser (AC-05-53), no header assumptions (AC-05-54) | nothing in `src/` reads a FloTHERM file; `computeRth('imported', …)` returns unresolved with the note "Imported values arrive with Screen 03" |
| Analytical provenance survives (AC-05-55) | `setRthFromSource()` writes its own slot and defaults `makeActive: false` |

The Source tab shows FloTHERM as **Not imported (Screen 03)** and Measurement as **Reserved**,
rather than as an empty value that could be mistaken for zero.

## Tests

`npm test` — **139 tests, all passing**:

| Suite | Tests |
| --- | --- |
| `src/thermal/graph/thermalGraph.test.ts` | 40 — templates, ports, qty modelling, analytical resistance, shared structure, validation, 03-deferred contract |
| `src/data/networkStore.test.ts` | 8 — manual-edit protection on rebuild, port connect/disconnect, undo/redo, layout is not a solver change, DIRTY on topology change, disabled nodes |
| `src/thermal/networkSolver.test.ts` | 15 |
| `src/importers/component/importPipeline.test.ts` | 35 |
| `src/domain/componentManager.test.ts` | 28 |
| `src/data/componentMigration.test.ts` | 13 |

## Browser verification

Both paths were exercised, per the commitment made after the Screen 04 blank-screen regression:

**Upgrade path** — a project, components and a thermal network stored in the *pre-05* shape
(no `status`, `templates`, `zones` or `layout` on the network; pre-04 component records):
loads without error, generates 12 nodes / 8 edges, validates, saves, survives a reload, and
Screens 01, 02 and 04 still render with the same data.

**Clean install** — an empty project shows *"No components available. Complete Component
Manager first."* with a link to Screen 04.

Interaction checks: INDIVIDUAL qty produced `Final PA 1…4` at 52.13 W each with the missing Rjc
left `unresolved` / `null`; re-applying a template offered *Replace Auto-generated Only /
Replace Entire Subgraph / Cancel*; changing the qty model warned about the topology rebuild;
Auto Connect Suggested wired `HEAT_OUT → NODE_ZONE_RF_LEFT` and created an **unresolved**
interface edge; undo/redo moved the graph between 9 and 29 nodes.

The saved network was inspected directly: `solved temperatures = 0`, `edges with heat_flow_W = 0`,
`unresolved edges with analytical = 0 → none`.

## Known limitations

- Heat-pipe resistance is a single vendor/manual equivalent value; `R_evap / R_axial / R_cond`
  are not split yet (05 §44 marks that as future work).
- Spreading correlations are not implemented — a spreading edge is either a quoted value or
  unresolved. Substituting L/kA is deliberately refused (05 §21).
- `Reverse nominal direction` changes the drawn arrow and metadata only; conduction remains
  bidirectional in the solver.
- Automatic layout offers Auto / Left→Right / Top→Bottom / Hierarchical / Free; per-node manual
  positions are preserved, but there is no manual layer or grouping yet.
- Node colours follow thermal role, never temperature — Screen 05 has not solved anything.
