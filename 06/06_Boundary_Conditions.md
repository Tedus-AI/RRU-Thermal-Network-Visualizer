# 06 Boundary Conditions / 邊界條件

## Development Specification

Document status: Formal screen specification for Codex implementation  
Screen ID: `06_Boundary_Conditions`  
Product: `5G FR1 Thermal Network Visualizer`  
Primary UI language: English  
Secondary language: Traditional Chinese by inline label when space allows, otherwise zh-TW tooltip  
Source of truth: This Markdown is the implementation source of truth. If any future PNG/mockup disagrees with this file, this file wins.

---

## 1. Purpose

Screen 06 defines the scenario-specific thermal boundary conditions required before the thermal network can be solved.

The screen answers:

- What is the ambient temperature for this scenario?
- Which thermal graph boundary ports are exposed to air, radiation, solar loading, a fixed temperature sink, or an insulated boundary?
- What convection, radiation, wind, solar, and fixed-temperature assumptions are applied?
- Which boundary-derived resistances are now ready for Screen 07 Thermal Network solve?
- Which assumptions are manual, analytical, assumed, measured, or reserved for future FloTHERM calibration?

Screen 06 is not a graph builder and not a results screen. It completes the environmental and boundary side of the model that Screen 05 intentionally left unresolved.

---

## 2. Relationship To 00 / 03 / 04 / 05 / 07

### 2.1 Relationship to 00 Product Vision and Architecture

Screen 06 must preserve the master architecture:

- The thermal model is a general Node + Edge graph.
- Heat paths may include series, parallel, branch, merge, shared nodes, shared base zones, multiple heat sources, and multiple ambient paths.
- Solver logic is separated from React UI components.
- Every thermal value must track data source, confidence, scenario, and provenance.
- The physical rule remains active: never derive segment thermal resistance from temperature difference unless the heat flow through that segment is known.

### 2.2 Relationship to 03 FloTHERM Import

Screen 03 remains deferred. Screen 06 must still reserve compatibility hooks for future FloTHERM import.

Screen 06 may store:

- FloTHERM object aliases for boundary surfaces.
- FloTHERM result table aliases.
- Future imported boundary temperatures, heat fluxes, or surface heat-flow data.
- Source metadata showing that a boundary parameter could later be replaced or calibrated by FloTHERM.

Screen 06 must not:

- Implement FloTHERM file parsing.
- Guess FloTHERM CSV headers.
- Assume a fixed FloTHERM export schema.
- Overwrite manual or analytical boundary assumptions with placeholder FloTHERM data.

### 2.3 Relationship to 04 Component Manager

Screen 04 owns component metadata and thermal architecture preferences. Screen 04 does not create graph nodes or graph edges.

Screen 06 may read from Screen 04:

- Component category and zone.
- Preferred base zone.
- Qty modeling preference.
- Component power summary.
- External mapping aliases.

Screen 06 must not edit component definitions. Any component metadata changes must return to Screen 04.

### 2.4 Relationship to 05 Thermal Path Builder

Screen 05 owns thermal graph topology.

Screen 05 may create:

- Thermal nodes.
- Thermal edges.
- Boundary placeholder nodes.
- Boundary ports.
- Boundary-type edges whose resistance is unresolved because scenario boundary inputs are missing.

Screen 05 must not assign:

- Ambient temperature.
- Wind speed.
- Solar irradiance.
- Convection coefficient.
- Radiation coefficient.
- Fixed boundary temperature.
- Scenario-specific environmental settings.
- Edge heat flow.
- Solved node temperature.

Screen 06 starts from the topology saved by Screen 05 and attaches scenario-specific boundary profiles to existing boundary ports and boundary edges.

Screen 06 may calculate pre-solve boundary-derived resistance values such as:

```text
Rconv = 1 / (hconv * A)
Rrad  = 1 / (hrad * A)
Rcombined = 1 / ((hconv + hrad) * A)
```

These are boundary input values only. They are not solved edge heat flow, not final node temperature, and not bottleneck results.

### 2.5 Relationship to 07 Thermal Network

Screen 07 uses:

- Topology from Screen 05.
- Scenario boundary set from Screen 06.
- Component power data from Screen 04/02.

Screen 07 is where the solver runs and where node temperature, edge heat flow, delta T, residual, and solve status become visible.

Screen 06 only provides solve-ready boundary inputs.

---

## 3. Screen Scope

### 3.1 In Scope

Screen 06 supports:

- Scenario-specific boundary condition set creation.
- Ambient and site condition definition.
- External ambient temperature.
- Optional internal ambient or enclosure air temperature placeholder.
- Wind speed and wind direction metadata.
- Convection profile assignment.
- Radiation profile assignment.
- Combined convection + radiation profile assignment.
- Solar heat gain profile assignment.
- Fixed temperature boundary profile assignment.
- Adiabatic or symmetry boundary declaration.
- Surface group and boundary port mapping.
- Boundary-derived Rth preview before solve.
- Boundary validation and solve readiness.
- Data source, confidence, and provenance tracking.
- FloTHERM deferred mapping hooks.
- Copy boundary conditions from another scenario.
- Generate default profiles from project environmental defaults.

### 3.2 Out of Scope

Screen 06 must not implement:

- Node or edge creation.
- Component editing.
- FloTHERM parser.
- Thermal network solver.
- Temperature result display.
- Edge heat flow display.
- Bottleneck ranking.
- Sensitivity analysis.
- Report generation.
- Export center features.

### 3.3 Hard UI Rule

The UI must not show solved values in Screen 06.

Allowed:

```text
Ambient = 55.0 °C
hconv = 18 W/m²K
Area = 0.42 m²
Boundary Rth preview = 0.132 °C/W
Status = Ready for solve
```

Forbidden:

```text
Fin Surface Temperature = 92.4 °C
Edge Heat Flow Q = 118 W
Temperature Drop = 13.8 °C
Bottleneck Rank = #1
```

---

## 4. Required Input State

Screen 06 requires:

```text
Project
  ↓
Active Scenario
  ↓
Imported Components
  ↓
Component Manager Preferences
  ↓
Thermal Graph Topology from Screen 05
  ↓
Boundary Ports / Boundary Edges
```

If Screen 05 topology does not exist, Screen 06 shows a blocked state:

```text
Boundary Conditions require a saved thermal graph topology.
Return to 05 Thermal Path Builder to create boundary ports first.
```

The page may still show project and scenario selectors, but all boundary editing controls must be disabled until a topology exists.

---

## 5. Primary User Workflow

### Step 1 - Select Scenario

User chooses the active scenario from the top header or the page scenario selector.

Examples:

- `Baseline Hot Day`
- `Solar Peak`
- `Lab Chamber 55C`
- `No Wind Worst Case`
- `Forced Air Prototype`

Boundary conditions are stored per scenario. Changing scenario must not mutate another scenario's boundary set.

### Step 2 - Load Boundary Ports From 05

The screen reads all boundary ports and boundary-type edges from the saved topology.

Examples:

- `BP_FIN_RF_EXTERNAL_AIR`
- `BP_HOUSING_SUN_FACE`
- `BP_INTERNAL_AIR_CAVITY`
- `BP_CHAMBER_BASE_PLATE`

The graph canvas is read-only for topology. Users may select nodes, edges, and boundary ports, but cannot add or delete them here.

### Step 3 - Define Ambient and Site Conditions

User enters the scenario environment:

- External ambient temperature.
- Optional internal ambient temperature.
- Altitude.
- Wind speed.
- Wind direction.
- Solar irradiance.
- Solar direction or incidence mode.
- Unit system.
- Notes and data source.

### Step 4 - Create Boundary Profiles

User creates or selects boundary profiles:

- Ambient reservoir.
- Natural convection.
- Forced convection.
- Combined convection + radiation.
- Radiation only.
- Solar heat gain.
- Fixed temperature boundary.
- Adiabatic / symmetry.

Profiles may be reusable inside one scenario. A profile can be assigned to multiple compatible boundary ports.

### Step 5 - Assign Profiles To Boundary Ports

User maps each boundary profile to boundary ports or surface groups.

Example:

```text
Profile: Outdoor forced convection + radiation
Assigned to:
- RF fin outer surface
- Power fin outer surface
- Rear housing rib surface
```

### Step 6 - Validate Boundary Readiness

The screen validates:

- Required ambient data exists.
- Every open boundary port has an intentional boundary condition.
- Required area, h, emissivity, view factor, fixed temperature, or solar data exists.
- Units are valid.
- No solved results are stored in the boundary set.
- FloTHERM fields are metadata only while Screen 03 is deferred.

### Step 7 - Save and Continue To 07

User saves the scenario boundary set.

If validation passes:

```text
Continue to 07 Thermal Network
```

If validation has blocking errors, continue is disabled.

---

## 6. App Shell And Screen Layout

### 6.1 Fixed App Shell

Screen 06 must reuse the same shell used by 00/01/02/04/05:

```text
AppShell
├─ TopHeader
├─ MainSidebar
├─ BreadcrumbBar
├─ ScreenWorkspace
└─ BottomStatusBar
```

Do not redesign the header, sidebar, or status bar for Screen 06.

### 6.2 Sidebar Position

The active item is:

```text
Thermal Network Setup / 熱網路建立
  04 Component Manager / 元件管理
  05 Thermal Path Builder / 熱路徑設定
> 06 Boundary Conditions / 邊界條件
```

Screen 03 remains visible in the earlier section as:

```text
03 FloTHERM Import / FloTHERM 匯入
Status: Deferred
```

### 6.3 Breadcrumb

```text
Project & Import > Thermal Network Setup > Boundary Conditions
```

### 6.4 Page Title

```text
Boundary Conditions / 邊界條件
```

Subtitle:

```text
Define scenario-specific ambient, convection, radiation, solar, and fixed-temperature boundaries for the saved thermal graph.
```

### 6.5 Workflow Stepper

Screen 06 has a screen-specific stepper:

```text
1 Scenario
→ 2 Ambient & Site
→ 3 Surface Mapping
→ 4 Convection
→ 5 Radiation & Solar
→ 6 Validate
```

The stepper is not part of the global App Shell.

---

## 7. Top Readiness KPI Row

Screen 06 shows six KPI tiles:

1. `Scenario Boundary Set`
   - Shows `Draft`, `Ready`, or `Needs Review`.

2. `Boundary Ports`
   - Shows assigned count over total boundary ports.
   - Example: `5 / 6 assigned`.

3. `Ambient`
   - Shows ambient status, not solved temperature.
   - Example: `55.0 °C external`.

4. `Convection`
   - Shows number of convection profiles and missing inputs.
   - Example: `3 profiles, 0 missing h`.

5. `Radiation / Solar`
   - Shows radiation and solar readiness.
   - Example: `2 radiation, 1 solar load`.

6. `Solve Readiness`
   - Shows `Blocked`, `Warnings`, or `Ready for 07`.

KPI tiles must not show node temperature, edge heat flow, or bottleneck rank.

---

## 8. Main Workspace Layout

### 8.1 Left Panel - Scenario Conditions

Left panel width target: 300-360 px.

Tabs:

```text
Scenario
Ambient
Wind
Solar
Sources
```

#### Scenario Tab

Fields:

- `Scenario Name`
- `Scenario ID`
- `Copy From Scenario`
- `Boundary Set Status`
- `Last Saved`
- `Owner`
- `Notes`

Actions:

- `Copy Conditions`
- `Reset Scenario Conditions`
- `Save Draft`

#### Ambient Tab

Fields:

- `External Ambient Temperature (°C)`
- `Internal Air Temperature (°C, optional)`
- `Radiation Sky / Surrounding Temperature (°C, optional)`
- `Altitude (m)`
- `Pressure Model`
- `Unit System`

Validation:

- External ambient is required unless every boundary is fixed temperature or adiabatic.
- Temperatures must be numeric.
- Celsius is the first-class unit in V1.

#### Wind Tab

Fields:

- `Wind Speed (m/s)`
- `Wind Direction`
- `Air Flow Mode`
  - `Natural`
  - `Forced`
  - `External Wind`
  - `Fan / Blower`
- `Convection Method`
  - `Manual h`
  - `Preset`
  - `Future Correlation`

V1 requirement:

- Manual h must be supported.
- Automatic convection correlations may be added later but are not required for 06 V1.

#### Solar Tab

Fields:

- `Enable Solar Load`
- `Solar Irradiance (W/m²)`
- `Sun Direction`
- `Default Surface Absorptivity`
- `Default Shading Factor`
- `Apply Only To Tagged Surfaces`

Solar heat gain must be stored as external scenario load, not as boundary Rth.

#### Sources Tab

Fields:

- `Data Source`
  - `manual`
  - `datasheet`
  - `analytical`
  - `assumed`
  - `measurement`
  - `flotherm`
  - `vendor`
- `Confidence`
  - `high`
  - `medium`
  - `low`
- `Reference`
- `Timestamp`
- `Author`
- `Change Reason`

### 8.2 Center Canvas - Boundary Mapping Graph

The center canvas displays the Screen 05 thermal graph in boundary mapping mode.

Required behavior:

- Topology is read-only.
- Boundary ports are visually highlighted.
- Boundary edges with unresolved Rth are shown with dashed boundary styling until assigned.
- Assigned boundary ports show compact badges.
- Ambient placeholder from 05 becomes a selectable boundary target but still has no solved temperature.
- Users can select a boundary port or boundary edge to edit its boundary assignment in the right inspector.

Canvas visual rules:

- Boundary ports with no profile: gray dashed outline.
- Boundary ports with valid boundary profile: blue outline.
- Boundary ports with warnings: amber outline.
- Boundary ports with blocking errors: red outline.
- Adiabatic ports: muted outline with `Adiabatic` badge.
- Solar-loaded surfaces: sun badge.
- Fixed-temperature boundary: anchor badge.

Forbidden center canvas content:

- Node solved temperatures.
- Edge heat flow arrows.
- Power flow animation.
- Bottleneck color scale.
- 07 solver residuals.

### 8.3 Right Panel - Boundary Inspector

Right panel width target: 360-440 px.

When no item is selected:

```text
Select a boundary port, boundary edge, or surface group to edit scenario boundary conditions.
```

When a boundary port is selected, show:

- `Boundary Port`
- `Connected Node`
- `Surface Group`
- `Area`
- `Orientation`
- `Allowed Boundary Types`
- `Assigned Profiles`
- `Derived Boundary Rth Preview`
- `Source / Provenance`
- `FloTHERM Mapping Hook`

Inspector tabs:

```text
Profile
Parameters
Derived Preview
Validation
Mapping
```

#### Profile Tab

Controls:

- `Boundary Type`
- `Profile Name`
- `Apply To Similar Surfaces`
- `Representation`
  - `single_combined_edge`
  - `parallel_boundary_edges`
  - `external_load_only`
  - `fixed_temperature_reservoir`
  - `adiabatic_no_flow`

#### Parameters Tab

Controls change by boundary type.

Convection:

- `hconv (W/m²K)`
- `Area (m²)`
- `Ambient Reference`
- `Method`
- `Confidence`

Radiation:

- `Emissivity`
- `View Factor`
- `Radiation Sink Temperature`
- `Area (m²)`
- `Linearization Mode`

Solar:

- `Irradiance (W/m²)`
- `Absorptivity`
- `Projected Area Factor`
- `Shading Factor`
- `Receiving Surface Area`

Fixed Temperature:

- `Fixed Temperature (°C)`
- `Boundary Name`
- `Reason`
- `Source`

Adiabatic:

- `Reason`
- `Scope`
- `Review Required`

#### Derived Preview Tab

Allowed preview fields:

- `Rconv Preview`
- `Rrad Preview`
- `Combined Boundary Rth Preview`
- `Solar Heat Load Preview`
- `Completeness`
- `Ready for 07 Solve`

Required disclaimer:

```text
Pre-solve boundary input only. Node temperature and edge heat flow are calculated in Screen 07.
```

#### Validation Tab

Shows:

- Blocking errors.
- Warnings.
- Informational notes.
- Suggested fixes.

#### Mapping Tab

Shows future external compatibility:

- `FloTHERM Object Alias`
- `FloTHERM Surface Alias`
- `FloTHERM Result Table Alias`
- `Measurement Point Alias`
- `External Source Status`

If Screen 03 is deferred, FloTHERM mapping fields are editable metadata only and must display:

```text
FloTHERM parser deferred. Alias is stored for future import mapping only.
```

---

## 9. Boundary Condition Types

### 9.1 Ambient Reservoir

Represents an environment reference temperature.

Required:

- `temperature_C`
- `source`
- `confidence`

Typical usage:

- External ambient.
- Internal enclosure air.
- Chamber air.
- Sky/surrounding radiation reference.

### 9.2 Convection To Ambient

Represents heat transfer from a surface to air.

Required:

- `h_W_m2K`
- `area_m2`
- `ambientRef`

Calculation:

```text
Rconv_C_per_W = 1 / (h_W_m2K * area_m2)
```

Manual h is required in V1.

### 9.3 Radiation To Surroundings

Represents radiation from surface to surrounding or sky reference.

Required:

- `emissivity`
- `area_m2`
- `viewFactor`
- `radiationTemperature_C`

Optional:

- `surfaceReferenceTemperatureGuess_C`

V1 may use a linearized radiation coefficient:

```text
hrad ≈ 4 * epsilon * sigma * viewFactor * Tref_K^3
Rrad = 1 / (hrad * area_m2)
```

Because actual surface temperature is not known until Screen 07 solve, the 06 value is a pre-solve input estimate.

### 9.4 Combined Convection + Radiation

Represents parallel heat transfer to the same environment.

Preferred representation:

```text
parallel_boundary_edges
```

Alternative simplified representation:

```text
single_combined_edge
```

If combined:

```text
Gtotal = hconv * A + hrad * A
Rcombined = 1 / Gtotal
```

The implementation must preserve the decomposition in metadata so later reports can explain how the combined Rth was created.

### 9.5 Solar Load

Solar is external heat input to a surface. It is not a thermal resistance.

Required:

- `irradiance_W_m2`
- `absorptivity`
- `projectedAreaFactor`
- `shadingFactor`
- `receivingArea_m2`

Calculation:

```text
Qsolar_W =
  irradiance_W_m2
  * receivingArea_m2
  * absorptivity
  * projectedAreaFactor
  * shadingFactor
```

The resulting `Qsolar_W` is stored as scenario external heat load assigned to the receiving surface node or boundary port.

It must not be added to component power silently. Screen 07 decides how to inject it into the solve vector.

### 9.6 Fixed Temperature Boundary

Represents a known-temperature reservoir.

Examples:

- Thermal chamber cold plate.
- Controlled base plate.
- Lab reference surface.
- Liquid cold plate prototype.

Required:

- `fixedTemperature_C`
- `reason`
- `source`

Solver behavior is Dirichlet boundary in Screen 07.

### 9.7 Adiabatic / Symmetry Boundary

Represents intentional no-flow boundary.

Required:

- `reason`

Behavior:

- No boundary resistance is calculated.
- Boundary port is marked intentionally insulated.
- Validation must treat it as assigned only if reason is provided.

### 9.8 External CFD / FloTHERM Boundary Placeholder

Reserved for future Screen 03 integration.

Allowed in Screen 06:

- Alias entry.
- Expected result type.
- User note.
- Pending status.

Not allowed:

- Actual parser.
- Fake imported values.
- Automatic Rth from unknown FloTHERM format.

---

## 10. Data Model

### 10.1 Topology Is Separate From Scenario Boundary Conditions

The base network topology from Screen 05 must remain scenario-independent.

Do not store scenario-specific boundary values directly inside the base graph node or base graph edge unless the project already uses a scenario overlay system.

Preferred model:

```text
ThermalNetworkTopology
  nodes[]
  edges[]
  boundaryPorts[]

ScenarioBoundaryConditionSet
  scenarioId
  ambientDefinition
  profiles[]
  assignments[]
  externalLoads[]
  derivedPreview[]
  validationState
```

### 10.2 TypeScript Contract

```ts
type BoundaryConditionType =
  | 'ambient_reservoir'
  | 'convection_to_ambient'
  | 'radiation_to_surroundings'
  | 'combined_convection_radiation'
  | 'solar_load'
  | 'fixed_temperature_boundary'
  | 'adiabatic_symmetry'
  | 'external_cfd_placeholder';

type ThermalDataSource =
  | 'manual'
  | 'analytical'
  | 'datasheet'
  | 'assumed'
  | 'measurement'
  | 'flotherm'
  | 'vendor';

type ConfidenceLevel = 'high' | 'medium' | 'low';

interface ScenarioBoundaryConditionSet {
  id: string;
  projectId: string;
  networkId: string;
  scenarioId: string;
  status: 'draft' | 'needs_review' | 'ready_for_solve';
  ambientDefinition: AmbientDefinition;
  siteConditions: SiteConditions;
  profiles: BoundaryConditionProfile[];
  assignments: BoundaryAssignment[];
  externalLoads: ExternalHeatLoad[];
  derivedPreview: BoundaryDerivedPreview[];
  validationState: BoundaryValidationState;
  updatedAt: string;
  updatedBy: string;
}

interface AmbientDefinition {
  externalAmbient_C: number | null;
  internalAir_C?: number | null;
  radiationSurrounding_C?: number | null;
  source: ThermalDataSource;
  confidence: ConfidenceLevel;
  provenance?: ProvenanceRecord;
}

interface SiteConditions {
  altitude_m?: number | null;
  windSpeed_m_s?: number | null;
  windDirection_deg?: number | null;
  airflowMode: 'natural' | 'forced' | 'external_wind' | 'fan_blower';
  solarEnabled: boolean;
  solarIrradiance_W_m2?: number | null;
  notes?: string;
}

interface BoundaryConditionProfile {
  id: string;
  name: string;
  type: BoundaryConditionType;
  representation:
    | 'single_combined_edge'
    | 'parallel_boundary_edges'
    | 'external_load_only'
    | 'fixed_temperature_reservoir'
    | 'adiabatic_no_flow'
    | 'metadata_only';
  parameters: Record<string, unknown>;
  source: ThermalDataSource;
  confidence: ConfidenceLevel;
  provenance?: ProvenanceRecord;
  externalMappings?: ExternalBoundaryMappings;
}

interface BoundaryAssignment {
  id: string;
  boundaryPortId: string;
  boundaryEdgeId?: string;
  profileIds: string[];
  surfaceGroupId?: string;
  assignmentMode: 'manual' | 'generated_default' | 'applied_to_similar';
  enabled: boolean;
}

interface ExternalHeatLoad {
  id: string;
  type: 'solar';
  targetBoundaryPortId: string;
  targetNodeId: string;
  q_W: number | null;
  sourceProfileId: string;
  injectInScreen07: boolean;
}

interface BoundaryDerivedPreview {
  boundaryPortId: string;
  profileIds: string[];
  rconv_C_per_W?: number | null;
  rrad_C_per_W?: number | null;
  rcombined_C_per_W?: number | null;
  qsolar_W?: number | null;
  completeness: 'complete' | 'warning' | 'blocked';
  disclaimer: 'pre_solve_boundary_input_only';
}

interface ExternalBoundaryMappings {
  flothermObjectAlias?: string;
  flothermSurfaceAlias?: string;
  flothermResultTableAlias?: string;
  measurementPointAlias?: string;
  importStatus: 'deferred' | 'not_mapped' | 'mapped_metadata_only';
}

interface BoundaryValidationState {
  status: 'blocked' | 'warnings' | 'ready_for_07';
  errors: BoundaryValidationMessage[];
  warnings: BoundaryValidationMessage[];
  infos: BoundaryValidationMessage[];
}

interface BoundaryValidationMessage {
  id: string;
  severity: 'error' | 'warning' | 'info';
  boundaryPortId?: string;
  profileId?: string;
  message: string;
  suggestedAction?: string;
}

interface ProvenanceRecord {
  sourceLabel: string;
  reference?: string;
  author?: string;
  createdAt?: string;
  changeReason?: string;
}
```

---

## 11. Store / Module Expectations

Recommended structure:

```text
src/
├─ screens/
│  └─ 06-boundary-conditions/
│     ├─ BoundaryConditionsScreen.tsx
│     ├─ BoundaryConditionKpis.tsx
│     ├─ ScenarioConditionsPanel.tsx
│     ├─ BoundaryMappingCanvas.tsx
│     ├─ BoundaryInspector.tsx
│     ├─ BoundaryValidationPanel.tsx
│     └─ boundaryConditionViewModel.ts
│
├─ stores/
│  ├─ boundaryStore.ts
│  ├─ networkStore.ts
│  ├─ scenarioStore.ts
│  └─ projectStore.ts
│
├─ thermal/
│  ├─ boundaryConditions.ts
│  ├─ boundaryValidation.ts
│  └─ boundaryResistancePreview.ts
│
└─ types/
   ├─ thermalGraph.ts
   └─ boundaryConditions.ts
```

Implementation rule:

- Boundary calculations belong in `thermal/`, not inside React components.
- React components should call typed selectors and pure helper functions.
- Saving boundary sets must not mutate Screen 05 topology.

---

## 12. Validation Rules

### 12.1 Blocking Errors

Show blocking error when:

- No Screen 05 topology exists.
- Active scenario is missing.
- External ambient is missing and required.
- A boundary port that can dissipate heat has no assigned profile.
- A convection profile has missing or non-positive `h_W_m2K`.
- A convection profile has missing or non-positive `area_m2`.
- A radiation profile has emissivity outside 0-1.
- A radiation profile has missing or non-positive area.
- A radiation profile has view factor outside 0-1.
- A fixed temperature boundary has no fixed temperature.
- A solar profile has missing irradiance, absorptivity, area, or projection factor.
- A profile is marked `flotherm` source but has no explicit metadata-only deferred status while Screen 03 is deferred.
- Any solved node temperature or solved edge heat flow is present in the Screen 06 boundary set.

### 12.2 Warnings

Show warning when:

- `h_W_m2K` is manually entered with low confidence.
- Wind speed exists but convection method is still manual h.
- Solar load is enabled but no surfaces are tagged as solar exposed.
- Radiation uses pre-solve surface temperature guess.
- A boundary port is intentionally adiabatic.
- Multiple profiles are assigned to one port and representation is unclear.
- Boundary conditions are copied from another scenario but ambient differs significantly.
- FloTHERM aliases are missing for surfaces that are expected to be calibrated later.

### 12.3 Informational Notes

Show info when:

- Boundary Rth preview has been calculated.
- Solar heat load preview has been calculated.
- Profile was generated from default project settings.
- Profile was applied to similar surfaces.
- FloTHERM mapping hook is stored for future use.

---

## 13. Calculations

### 13.1 Convection Resistance

```text
Rconv_C_per_W = 1 / (h_W_m2K * area_m2)
```

Validation:

- `h_W_m2K > 0`
- `area_m2 > 0`

### 13.2 Radiation Coefficient

For V1 pre-solve preview:

```text
Tref_K = surfaceReferenceTemperatureGuess_C + 273.15
hrad_W_m2K = 4 * emissivity * sigma * viewFactor * Tref_K^3
Rrad_C_per_W = 1 / (hrad_W_m2K * area_m2)
```

Where:

```text
sigma = 5.670374419e-8 W/m²K⁴
```

If `surfaceReferenceTemperatureGuess_C` is missing, use a clearly marked default guess from the active scenario. Do not hide this assumption.

### 13.3 Combined Convection And Radiation

```text
Gconv_W_per_C = hconv_W_m2K * area_m2
Grad_W_per_C = hrad_W_m2K * area_m2
Gtotal_W_per_C = Gconv_W_per_C + Grad_W_per_C
Rcombined_C_per_W = 1 / Gtotal_W_per_C
```

### 13.4 Solar Heat Load

```text
Qsolar_W =
  irradiance_W_m2
  * receivingArea_m2
  * absorptivity
  * projectedAreaFactor
  * shadingFactor
```

Solar heat load must be stored separately from component power.

### 13.5 Fixed Temperature Boundary

No Rth preview is required.

Store:

```text
fixedTemperature_C
boundaryBehavior = fixed_temperature_reservoir
```

Screen 07 applies it as a fixed-temperature boundary condition.

---

## 14. Persistence Rules

### 14.1 Save Boundary Set

Save a `ScenarioBoundaryConditionSet` keyed by:

```text
projectId + networkId + scenarioId
```

Saving Screen 06 must not overwrite:

- Component library.
- Component manager preferences.
- Base topology nodes.
- Base topology edges.
- Screen 07 solver results.

### 14.2 Versioning

Each saved set should track:

- `createdAt`
- `updatedAt`
- `updatedBy`
- `schemaVersion`
- `sourceScreen`
- `networkTopologyVersion`

If Screen 05 topology changes after Screen 06 is saved, Screen 06 must show:

```text
Topology changed after boundary set was saved. Revalidate assignments.
```

### 14.3 Scenario Copy

Copying from another scenario creates a new boundary set for the target scenario.

Do not link mutable references unless the UI explicitly says the profile is shared.

---

## 15. Empty / Loading / Error States

### 15.1 No Project

```text
Open or create a project before defining boundary conditions.
```

### 15.2 No Scenario

```text
Create a scenario before defining boundary conditions.
```

### 15.3 No Topology From 05

```text
Boundary Conditions require a saved thermal graph topology.
Return to 05 Thermal Path Builder.
```

Primary action:

```text
Open 05 Thermal Path Builder
```

### 15.4 No Boundary Ports

```text
The current topology has no boundary ports.
Add ambient or external boundary ports in Screen 05 before configuring scenario conditions.
```

### 15.5 Stale Topology

```text
The thermal graph topology has changed since this boundary set was saved.
Review boundary assignments before continuing to Screen 07.
```

### 15.6 Deferred FloTHERM

```text
FloTHERM import is deferred. Boundary aliases are stored for future mapping only.
```

---

## 16. Actions

### Primary Actions

- `Save Boundary Set`
- `Validate Boundary Conditions`
- `Continue to 07`

### Secondary Actions

- `Generate Default Profiles`
- `Copy From Scenario`
- `Apply To Similar Surfaces`
- `Reset Scenario Conditions`
- `Export Boundary JSON`
- `Return to 05`

### Disabled Action Rules

`Continue to 07` is disabled when:

- Validation status is `blocked`.
- Active scenario has no saved boundary set.
- Topology is stale and unresolved.
- Required profiles are missing.

`Save Boundary Set` is disabled when:

- No project.
- No scenario.
- No topology.

---

## 17. Accessibility And Interaction

Required:

- All icon-only buttons must have accessible labels and tooltips.
- All numeric fields must show units.
- Validation errors must be visible without relying only on color.
- Keyboard users must be able to tab through left panel, center selection list, and right inspector.
- Color-coded boundary statuses must also include text badges.

---

## 18. UI Text Rules

Visible UI should use English as the primary text.

When space allows:

```text
Boundary Conditions / 邊界條件
```

When space is tight:

```text
Boundary Conditions
```

and zh-TW appears in tooltip:

```text
設定此情境下的環境溫度、對流、輻射、太陽負載與固定溫度邊界。
```

Do not use long in-app instructional paragraphs. Use compact labels, validation text, and tooltips.

---

## 19. MD To PNG Audit Requirements

When the 06 PNG is produced later, it must show:

- Fixed App Shell from 00/01/02/04/05.
- Active sidebar item `06 Boundary Conditions / 邊界條件`.
- Breadcrumb.
- Page title.
- Six-step Screen 06 workflow stepper.
- Six KPI readiness tiles.
- Left scenario/environment conditions panel.
- Center read-only boundary mapping graph.
- Right boundary inspector.
- Validation/status area.
- Buttons for save, validate, return to 05, and continue to 07.
- FloTHERM deferred compatibility hint.

The PNG must not show:

- Solved node temperatures.
- Edge heat flow Q.
- Power flow animation.
- Bottleneck ranking.
- Screen 07 solver charts.
- New topology creation controls.
- Any feature not present in this Markdown.

---

## 20. Acceptance Summary

Screen 06 is complete when:

- Boundary condition state is scenario-specific.
- Screen 05 topology remains read-only.
- Existing boundary ports can be assigned to convection, radiation, solar, fixed-temperature, ambient, or adiabatic profiles.
- Boundary-derived Rth preview is calculated for boundary input readiness only.
- Solar heat load is stored as external scenario load, not as Rth.
- Validation blocks physically incomplete boundary sets.
- No solved temperatures or edge heat flows appear in Screen 06.
- FloTHERM compatibility metadata is preserved without implementing a parser.
- The screen can save a valid boundary set and pass it to Screen 07.

