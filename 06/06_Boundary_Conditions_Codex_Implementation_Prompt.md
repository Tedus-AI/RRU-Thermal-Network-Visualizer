# Codex Implementation Prompt - 06 Boundary Conditions

You are implementing Screen 06 for the `5G FR1 Thermal Network Visualizer`.

Read these documents first:

1. `00_Product_Vision_and_Architecture.md`
2. `04_Component_Manager.md`
3. `05_Thermal_Path_Builder.md`
4. `06_Boundary_Conditions.md`
5. `06_Boundary_Conditions_mock.json`
6. `06_Boundary_Conditions_Tooltips_zh-TW.json`

If a PNG/mockup conflicts with the Markdown, follow the Markdown.

---

## Core Rule

Screen 05 only creates topology. Screen 06 is the first screen that assigns scenario-specific boundary conditions.

Screen 06 must not create or delete thermal nodes or thermal edges.

Screen 06 must not run the thermal solver.

Screen 06 must not display solved node temperature, edge heat flow, delta T, bottleneck ranking, or power flow animation.

---

## Implementation Scope

Build the actual usable Screen 06:

- Fixed App Shell from previous screens.
- Active sidebar item: `06 Boundary Conditions / 邊界條件`.
- Breadcrumb: `Project & Import > Thermal Network Setup > Boundary Conditions`.
- Page title: `Boundary Conditions / 邊界條件`.
- Workflow stepper:
  - `1 Scenario`
  - `2 Ambient & Site`
  - `3 Surface Mapping`
  - `4 Convection`
  - `5 Radiation & Solar`
  - `6 Validate`
- Six readiness KPI tiles.
- Left scenario/environment conditions panel.
- Center boundary mapping graph in topology read-only mode.
- Right boundary inspector.
- Validation/status area.
- Save, validate, return to 05, and continue to 07 actions.

Use English visible labels first. Use Traditional Chinese tooltips from `06_Boundary_Conditions_Tooltips_zh-TW.json`.

---

## Data Model Requirements

Create or extend a scenario-specific boundary store.

Preferred object:

```ts
ScenarioBoundaryConditionSet
```

It must be keyed by:

```text
projectId + networkId + scenarioId
```

It must be separate from the Screen 05 base topology.

Do not store ambient temperature, convection h, radiation parameters, solar load, or fixed-temperature values directly in the base topology unless the existing codebase already has a scenario overlay system. If such an overlay exists, use the existing pattern but preserve the same separation of concerns.

---

## Boundary Profiles To Support In V1

Implement these profile types:

- `ambient_reservoir`
- `convection_to_ambient`
- `radiation_to_surroundings`
- `combined_convection_radiation`
- `solar_load`
- `fixed_temperature_boundary`
- `adiabatic_symmetry`
- `external_cfd_placeholder`

V1 must support manual h for convection.

Automatic convection correlations are optional and may be deferred.

---

## Required Calculations

Create pure helper functions outside React components.

Required helpers:

```ts
calculateConvectionRth(h_W_m2K: number, area_m2: number): number
calculateLinearizedRadiationHrad(input): number
calculateRadiationRth(hrad_W_m2K: number, area_m2: number): number
calculateCombinedBoundaryRth(input): number
calculateSolarHeatLoad(input): number
validateBoundaryConditionSet(input): BoundaryValidationState
```

Convection:

```text
Rconv = 1 / (h * A)
```

Radiation preview:

```text
hrad ≈ 4 * epsilon * sigma * viewFactor * Tref_K^3
Rrad = 1 / (hrad * A)
```

Combined convection + radiation:

```text
Rcombined = 1 / (hconv * A + hrad * A)
```

Solar:

```text
Qsolar =
  irradiance
  * receivingArea
  * absorptivity
  * projectedAreaFactor
  * shadingFactor
```

Label all derived values as pre-solve boundary input previews.

---

## Validation Requirements

Block `Continue to 07` when:

- There is no saved topology from Screen 05.
- There is no active scenario.
- Required ambient data is missing.
- Any dissipating boundary port has no assigned boundary condition.
- h or area is missing or non-positive.
- emissivity or view factor is outside 0-1.
- fixed temperature is missing for fixed temperature boundary.
- solar profile is missing irradiance, absorptivity, projection factor, shading factor, or area.
- any solved result appears in the Screen 06 state.

Warnings are allowed for:

- assumed radiation parameters.
- manual h with low confidence.
- solar assumptions.
- adiabatic boundary with reason.
- FloTHERM aliases missing or deferred.

---

## FloTHERM Deferred Compatibility

Keep these metadata fields when possible:

```ts
externalMappings?: {
  flothermObjectAlias?: string;
  flothermSurfaceAlias?: string;
  flothermResultTableAlias?: string;
  measurementPointAlias?: string;
  importStatus: 'deferred' | 'not_mapped' | 'mapped_metadata_only';
}
```

Do not implement the FloTHERM parser in this screen.

Do not guess FloTHERM CSV headers.

Do not compute segment Rth from FloTHERM temperature difference unless edge heat flow for that exact segment is known.

---

## UI Behavior

The center graph is read-only for topology.

Allowed interactions:

- Select node.
- Select edge.
- Select boundary port.
- Highlight boundary assignment status.
- Assign scenario boundary profiles through the inspector.
- Preview boundary-derived Rth or solar heat load.

Forbidden interactions:

- Add node.
- Delete node.
- Add edge.
- Delete edge.
- Solve graph.
- Show Q flow.
- Show final temperature.
- Show bottleneck result.

---

## Deliverables Expected From Implementation

After implementation, provide:

- Modified file list.
- How to run locally.
- Screenshot of Screen 06.
- Confirmation that Screen 05 topology is not mutated.
- Confirmation that Screen 06 can save a scenario boundary set.
- Confirmation that JSON mock data can load without parser errors.
- Acceptance checklist result.

