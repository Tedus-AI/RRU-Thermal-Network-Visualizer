# 06 Boundary Conditions - Acceptance Checklist

Use this checklist to verify Screen 06 before moving to Screen 07.

---

## A. Source Of Truth

- [x] The implementation follows `06_Boundary_Conditions.md`.
- [x] If any PNG/mockup disagrees with the Markdown, Markdown behavior is implemented.
- [x] The screen uses the same fixed App Shell as 00/01/02/04/05.
- [x] The active sidebar item is `06 Boundary Conditions / 邊界條件`.
- [x] Screen 03 remains visible as deferred compatibility, not removed.

---

## B. 05 / 06 Boundary Separation

- [x] Screen 05 topology is loaded as read-only.
- [x] Screen 06 cannot add thermal nodes.
- [x] Screen 06 cannot delete thermal nodes.
- [x] Screen 06 cannot add thermal edges.
- [x] Screen 06 cannot delete thermal edges.
- [x] Ambient temperature is assigned only in Screen 06 or later, not in Screen 05 topology.
- [x] Convection h is scenario-specific and stored outside base topology.
- [x] Radiation settings are scenario-specific and stored outside base topology.
- [x] Solar load is scenario-specific and stored outside base topology.
- [x] Fixed temperature boundary values are scenario-specific and stored outside base topology.

---

## C. No Solver Leakage

- [x] Screen 06 does not run the thermal network solver.
- [x] Screen 06 does not show solved node temperatures.
- [x] Screen 06 does not show edge heat flow Q.
- [x] Screen 06 does not show solved delta T.
- [x] Screen 06 does not show bottleneck ranking.
- [x] Screen 06 does not show power flow animation.
- [x] Boundary-derived Rth preview is labeled as pre-solve input only.

---

## D. Required UI

- [x] Breadcrumb appears correctly.
- [x] Page title is `Boundary Conditions / 邊界條件`.
- [x] Stepper includes Scenario, Ambient & Site, Surface Mapping, Convection, Radiation & Solar, Validate.
- [x] Six KPI readiness tiles are visible.
- [x] Left scenario/environment panel is visible.
- [x] Center boundary mapping graph is visible.
- [x] Right boundary inspector is visible.
- [x] Validation panel is visible.
- [x] Save Boundary Set action exists.
- [x] Validate Boundary Conditions action exists.
- [x] Return to 05 action exists.
- [x] Continue to 07 action exists and is disabled when validation is blocked.

---

## E. Boundary Types

- [x] Ambient reservoir profile can be created or selected.
- [x] Convection-to-ambient profile can be created or selected.
- [x] Radiation-to-surroundings profile can be created or selected.
- [x] Combined convection + radiation profile can be created or selected.
- [x] Solar load profile can be created or selected.
- [x] Fixed temperature boundary profile can be created or selected.
- [x] Adiabatic/symmetry boundary can be declared with reason.
- [x] External CFD/FloTHERM placeholder can store metadata only.

---

## F. Calculations

- [x] `Rconv = 1 / (h * A)` is calculated correctly.
- [x] Radiation h preview uses documented linearized radiation formula or a clearly labeled equivalent.
- [x] Combined convection + radiation uses conductance sum, not series sum.
- [x] Solar heat load is calculated as external heat input.
- [x] Solar heat load is not stored as thermal resistance.
- [x] Solar heat load is not silently added to component power.
- [x] Fixed temperature boundary is stored as fixed-temperature behavior, not as a fake Rth.
- [x] Adiabatic boundary does not generate a fake Rth.

---

## G. Validation

- [x] No Screen 05 topology shows blocked empty state.
- [x] No active scenario shows blocked empty state.
- [x] Missing external ambient blocks solve readiness when required.
- [x] Unassigned dissipating boundary port blocks continue.
- [x] Missing or non-positive h blocks convection profile.
- [x] Missing or non-positive area blocks boundary Rth calculation.
- [x] Emissivity outside 0-1 blocks radiation profile.
- [x] View factor outside 0-1 blocks radiation profile.
- [x] Missing fixed temperature blocks fixed-temperature boundary.
- [x] Missing solar inputs block solar profile.
- [x] Assumed radiation parameters show warning.
- [x] Manual h with low confidence shows warning.
- [x] FloTHERM deferred metadata shows info or warning, not parser behavior.

---

## H. Scenario Behavior

- [x] Boundary condition set is keyed by project, network, and scenario.
- [x] Switching scenario loads that scenario's boundary set.
- [x] Editing one scenario does not mutate another scenario.
- [x] Copy From Scenario creates independent target scenario data.
- [x] Stale topology version triggers revalidation.

---

## I. FloTHERM Deferred Compatibility

- [x] Boundary ports can store FloTHERM surface alias.
- [x] Profiles can store FloTHERM object or result table alias.
- [x] Measurement point alias can be stored.
- [x] UI states that FloTHERM parser is deferred.
- [x] No code assumes a fixed FloTHERM CSV schema.
- [x] No fake FloTHERM imported value is generated.
- [x] Existing analytical/manual values are not overwritten by placeholder FloTHERM data.

---

## J. Language And UX

- [x] Visible UI labels are English first.
- [x] Traditional Chinese appears inline only where space allows.
- [x] zh-TW tooltips are wired for compact English labels.
- [x] Numeric fields show units.
- [x] Icon-only controls have accessible labels.
- [x] Validation status is not communicated by color alone.

---

## K. Data Verification

- [x] `06_Boundary_Conditions_mock.json` loads successfully.
- [x] Mock topology contains no solved node temperatures.
- [x] Mock topology contains no edge heat flow values.
- [x] Mock boundary set contains scenario-specific ambient, convection, radiation, solar, and validation state.
- [x] The implementation can save and reload the mock boundary condition set.

---

## L. Ready For 07

- [x] A fully valid boundary set enables `Continue to 07`.
- [x] Screen 07 receives topology from Screen 05 and boundary condition set from Screen 06.
- [x] Screen 07, not Screen 06, is responsible for final solve.


---

## Implementation notes

### Where each piece lives

| Area | Implementation |
| --- | --- |
| Boundary domain model | `src/thermal/boundary/types.ts` — profiles, assignments, external loads, derived preview, validation state |
| Calculations (pure, outside React) | `src/thermal/boundary/calculations.ts` — `calculateConvectionRth`, `calculateLinearizedRadiationHrad`, `calculateRadiationRth`, `calculateCombinedBoundaryRth`, `calculateSolarHeatLoad`, `buildDerivedPreview` |
| Validation | `src/thermal/boundary/validation.ts` — `validateBoundarySet`, `buildAllPreviews` |
| Boundary ports from the 05 topology | `src/thermal/boundary/boundaryPorts.ts` — read-only derivation |
| Specification mock loader | `src/thermal/boundary/mockAdapter.ts` |
| Scenario boundary store | `src/data/boundaryStore.ts` |
| Persistence (own collection, keyed project + network + scenario) | `src/data/persistence.ts` — `loadBoundarySets`, `saveBoundarySet` |
| Screen | `src/screens/06-boundary-conditions/` |

### Naming

06 §10.2 writes the contract in camelCase. The codebase settled on snake_case in
Screen 02 and kept it through 04 and 05, so the field *semantics* are followed
exactly and the casing stays consistent. The specification's mock file is
camelCase and is converted on read by `mockAdapter.ts` — which is also what
makes "the mock JSON loads" a testable claim rather than an assertion.

### One deliberate deviation from the mock's numbers

`06_Boundary_Conditions_mock.json` quotes `hrad = 5.2 W/m²K`, `Rrad = 0.458` and
`Rcombined = 0.103` for the RF fin. Those do not follow from 06 §13.2 with the
mock's own inputs: `4 · 0.86 · σ · 0.9 · (90 + 273.15)³ = 8.41 W/m²K`, and 5.2
would require a 35 °C surface — below the 55 °C ambient in the same scenario.
The README and §1 both state that the Markdown wins over any other artefact, so
the **documented formula** is implemented, and the test asserts the formula
rather than the mock's illustrative figure. The mock's convection
(`Rconv = 0.132`) and solar (`Qsolar = 96.31 W`) values reproduce exactly.

### Tests

`npm test` — **172 tests, all passing**. Screen 06 contributes 33:

| Group | Covers |
| --- | --- |
| Calculations | `1/(hA)`; the linearised `4εσFT³`; conductances summed for combined, not resistances; solar as `G·A·α·proj·shade`; null (never 0) for every missing input |
| Derived preview | pre-solve disclaimer on every preview; no Rth invented for fixed-temperature or adiabatic; solar stays a load |
| Boundary ports | derived from the 05 topology; ambient placeholder is a reference, not a dissipating surface; the topology object is not mutated |
| Validation | every blocking rule in §12.1, the warnings in §12.2, and a guard that refuses to carry a solved value into Screen 07 |
| Screen 03 deferred | a `flotherm` source without metadata-only status is blocked; a CFD placeholder is information, not data |
| Specification mock | loads; contains no solved values; reproduces the previews; validation is recomputed rather than trusted from the file |

### Browser verification

Run at 1680×1000 and 1440×900; the document does not scroll at either size.

- **No topology** — the screen shows the §15.3 blocked state with a link to
  Screen 05, and every editing control stays out of reach.
- **With a topology** — six KPI tiles, the six-step stepper, all six numbered
  sections, and the read-only graph render; boundary ports are listed with
  their status.
- **Generate Defaults** → assign → **Validate** → **Save** → reload keeps the
  set; the saved JSON was inspected directly and contains no solved
  temperature, no edge heat flow and no Rth coerced to 0.
- **Topology untouched** — the saved node and edge id sets are byte-identical
  before and after Screen 06 saves.
- **Scenario isolation** — switching to a second scenario shows its own
  ambient (45 °C) and an empty assignment count, leaving the first scenario's
  set intact.
- Screens 01, 02, 04 and 05 still render with the same stored data.

### Known limitations

- Convection correlations are not implemented; V1 is manual `h`, as 06 §8.1
  allows. Wind speed is recorded and warned about rather than applied.
- The linearised radiation coefficient needs a surface-temperature guess. When
  none is given, ambient + 35 °C is used and the preview is marked as an
  assumption rather than hidden.
- Boundary port area is not derivable from the 05 topology, so it starts null
  and must be entered per profile. That is why a freshly generated default set
  is still `blocked` until the engineer supplies areas.
- The specification's five left-panel tabs (Scenario / Ambient / Wind / Solar /
  Sources) are rendered as one compact form, following the mockup: at this
  column width a tab strip costs more than it saves. Every field, unit and
  validation rule from those tabs is present.
