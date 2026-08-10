# 06 Boundary Conditions - Acceptance Checklist

Use this checklist to verify Screen 06 before moving to Screen 07.

---

## A. Source Of Truth

- [ ] The implementation follows `06_Boundary_Conditions.md`.
- [ ] If any PNG/mockup disagrees with the Markdown, Markdown behavior is implemented.
- [ ] The screen uses the same fixed App Shell as 00/01/02/04/05.
- [ ] The active sidebar item is `06 Boundary Conditions / 邊界條件`.
- [ ] Screen 03 remains visible as deferred compatibility, not removed.

---

## B. 05 / 06 Boundary Separation

- [ ] Screen 05 topology is loaded as read-only.
- [ ] Screen 06 cannot add thermal nodes.
- [ ] Screen 06 cannot delete thermal nodes.
- [ ] Screen 06 cannot add thermal edges.
- [ ] Screen 06 cannot delete thermal edges.
- [ ] Ambient temperature is assigned only in Screen 06 or later, not in Screen 05 topology.
- [ ] Convection h is scenario-specific and stored outside base topology.
- [ ] Radiation settings are scenario-specific and stored outside base topology.
- [ ] Solar load is scenario-specific and stored outside base topology.
- [ ] Fixed temperature boundary values are scenario-specific and stored outside base topology.

---

## C. No Solver Leakage

- [ ] Screen 06 does not run the thermal network solver.
- [ ] Screen 06 does not show solved node temperatures.
- [ ] Screen 06 does not show edge heat flow Q.
- [ ] Screen 06 does not show solved delta T.
- [ ] Screen 06 does not show bottleneck ranking.
- [ ] Screen 06 does not show power flow animation.
- [ ] Boundary-derived Rth preview is labeled as pre-solve input only.

---

## D. Required UI

- [ ] Breadcrumb appears correctly.
- [ ] Page title is `Boundary Conditions / 邊界條件`.
- [ ] Stepper includes Scenario, Ambient & Site, Surface Mapping, Convection, Radiation & Solar, Validate.
- [ ] Six KPI readiness tiles are visible.
- [ ] Left scenario/environment panel is visible.
- [ ] Center boundary mapping graph is visible.
- [ ] Right boundary inspector is visible.
- [ ] Validation panel is visible.
- [ ] Save Boundary Set action exists.
- [ ] Validate Boundary Conditions action exists.
- [ ] Return to 05 action exists.
- [ ] Continue to 07 action exists and is disabled when validation is blocked.

---

## E. Boundary Types

- [ ] Ambient reservoir profile can be created or selected.
- [ ] Convection-to-ambient profile can be created or selected.
- [ ] Radiation-to-surroundings profile can be created or selected.
- [ ] Combined convection + radiation profile can be created or selected.
- [ ] Solar load profile can be created or selected.
- [ ] Fixed temperature boundary profile can be created or selected.
- [ ] Adiabatic/symmetry boundary can be declared with reason.
- [ ] External CFD/FloTHERM placeholder can store metadata only.

---

## F. Calculations

- [ ] `Rconv = 1 / (h * A)` is calculated correctly.
- [ ] Radiation h preview uses documented linearized radiation formula or a clearly labeled equivalent.
- [ ] Combined convection + radiation uses conductance sum, not series sum.
- [ ] Solar heat load is calculated as external heat input.
- [ ] Solar heat load is not stored as thermal resistance.
- [ ] Solar heat load is not silently added to component power.
- [ ] Fixed temperature boundary is stored as fixed-temperature behavior, not as a fake Rth.
- [ ] Adiabatic boundary does not generate a fake Rth.

---

## G. Validation

- [ ] No Screen 05 topology shows blocked empty state.
- [ ] No active scenario shows blocked empty state.
- [ ] Missing external ambient blocks solve readiness when required.
- [ ] Unassigned dissipating boundary port blocks continue.
- [ ] Missing or non-positive h blocks convection profile.
- [ ] Missing or non-positive area blocks boundary Rth calculation.
- [ ] Emissivity outside 0-1 blocks radiation profile.
- [ ] View factor outside 0-1 blocks radiation profile.
- [ ] Missing fixed temperature blocks fixed-temperature boundary.
- [ ] Missing solar inputs block solar profile.
- [ ] Assumed radiation parameters show warning.
- [ ] Manual h with low confidence shows warning.
- [ ] FloTHERM deferred metadata shows info or warning, not parser behavior.

---

## H. Scenario Behavior

- [ ] Boundary condition set is keyed by project, network, and scenario.
- [ ] Switching scenario loads that scenario's boundary set.
- [ ] Editing one scenario does not mutate another scenario.
- [ ] Copy From Scenario creates independent target scenario data.
- [ ] Stale topology version triggers revalidation.

---

## I. FloTHERM Deferred Compatibility

- [ ] Boundary ports can store FloTHERM surface alias.
- [ ] Profiles can store FloTHERM object or result table alias.
- [ ] Measurement point alias can be stored.
- [ ] UI states that FloTHERM parser is deferred.
- [ ] No code assumes a fixed FloTHERM CSV schema.
- [ ] No fake FloTHERM imported value is generated.
- [ ] Existing analytical/manual values are not overwritten by placeholder FloTHERM data.

---

## J. Language And UX

- [ ] Visible UI labels are English first.
- [ ] Traditional Chinese appears inline only where space allows.
- [ ] zh-TW tooltips are wired for compact English labels.
- [ ] Numeric fields show units.
- [ ] Icon-only controls have accessible labels.
- [ ] Validation status is not communicated by color alone.

---

## K. Data Verification

- [ ] `06_Boundary_Conditions_mock.json` loads successfully.
- [ ] Mock topology contains no solved node temperatures.
- [ ] Mock topology contains no edge heat flow values.
- [ ] Mock boundary set contains scenario-specific ambient, convection, radiation, solar, and validation state.
- [ ] The implementation can save and reload the mock boundary condition set.

---

## L. Ready For 07

- [ ] A fully valid boundary set enables `Continue to 07`.
- [ ] Screen 07 receives topology from Screen 05 and boundary condition set from Screen 06.
- [ ] Screen 07, not Screen 06, is responsible for final solve.

