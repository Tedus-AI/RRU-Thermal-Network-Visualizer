# 99 — System Integration & Master Implementation Specification
## 5G FR1 Thermal Network Visualizer
### Cross-Screen Architecture / State / Persistence / Verification Specification

**Document ID:** `99_System_Integration_and_Master_Implementation`  
**Applies To:** Screens 01–12  
**Deferred Screen:** `03_FloTHERM_Import`  
**Priority:** P0 — Mandatory Before Full Product Integration  

---

# 0. Purpose

此文件不是新的 UI Screen，而是整套產品的「總裝配規格」。它負責把目前的：

```text
01 Project Info
02 Import Components
03 FloTHERM Import [Deferred]
04 Component Manager
05 Thermal Path Builder
06 Boundary Conditions
07 Thermal Network
08 Bottleneck Analysis
09 Temperature Distribution
10 Results Overview
11 Report Preview
12 Export Center
```

串成一套一致、可追蹤、可驗證的 engineering workflow。

核心原則：

> **任何 upstream engineering input 改變後，所有 downstream derived state 必須正確 invalidated；任何 screen 都不得偷偷把舊結果當成 current result。**

---

# 1. Global Product Flow

```text
Project / Components
        ↓
Thermal Graph Topology
        ↓
Scenario / Boundary
        ↓
Full Thermal Solve
        ↓
Bottleneck Analysis
        ↓
Temperature Distribution
        ↓
Results Overview
        ↓
Report Snapshot / Preview
        ↓
Export Session / Artifacts
```

對應主要 Stores：

```text
projectStore
componentStore
networkStore
scenarioStore
solverStore
analysisStore
distributionStore
overviewStore
reportStore
exportStore
```

Future Screen 03：

```text
flothermImportStore [future]
```

---

# 2. Separation of Concerns

## 01 Project Info
Owns:
- project metadata
- project context
- project defaults
- initial Baseline Scenario creation

Must NOT:
- create thermal graph
- solve thermal network

## 02 Import Components
Owns:
- staging import
- legacy adapter
- duplicate policy
- component import validation

Must NOT:
- create Node/Edge topology

## 04 Component Manager
Owns:
- normalized component thermal specifications
- quantity modeling preference
- thermal template preference
- limits / Rjc / TIM / board metadata

Must NOT:
- own actual thermal graph topology

## 05 Thermal Path Builder
Owns:
- Thermal Nodes
- Thermal Edges
- ports
- shared base zones
- local thermal subgraphs
- graph topology / layout

Must NOT:
- solve final temperatures
- assume boundary conditions

## 06 Boundary Conditions
Owns:
- scenarios
- ambient / wind / solar
- convection / radiation / fixed temperature
- scenario-specific boundary overrides

Must NOT:
- rebuild component topology

## 07 Thermal Network
Owns:
- full nodal solver
- solution state
- Node Temperature
- Edge Heat Flow Q
- Edge ΔT
- energy balance

## 08 Bottleneck Analysis
Owns:
- candidate ranking
- full-network sensitivity re-solve
- bottleneck score
- improvement proposals

Must NOT:
- mutate the baseline network / Rth

## 09 Temperature Distribution
Owns:
- temperature statistics
- histogram
- hot-node ranking
- scenario temperature comparison

Must NOT:
- re-solve network

## 10 Results Overview
Owns:
- deterministic summary
- overall thermal status
- report readiness
- ResultsOverviewSnapshot

Must NOT:
- rerun 07/08/09 analysis

## 11 Report Preview
Owns:
- report configuration
- section order
- page preview
- ReportExportPayload metadata

Must NOT:
- export files
- recalculate engineering results

## 12 Export Center
Owns:
- file generation
- export session
- traceability manifest
- export queue / history

Must NOT:
- modify thermal/report source data

---

# 3. Canonical Dependency Graph

```text
projectStore
   ↓
componentStore
   ↓
networkStore
   ↓
scenarioStore
   ↓
solverStore
   ↓
analysisStore
   ↓
distributionStore
   ↓
overviewStore
   ↓
reportStore
   ↓
exportStore
```

這代表主要 dependency chain，不代表 runtime 只能單向讀取。例如 overviewStore 同時讀 solver / analysis / distribution，但 ownership 不得反轉。

---

# 4. Authoritative Ownership Rule

每一筆 persistent 或 derived engineering data 必須只有一個 authoritative owner。

禁止：

```text
same result duplicated as editable current data in multiple stores
```

例如 FPGA Temperature：

```text
solverStore = authoritative current thermal solution
overviewStore = derived summary only
reportStore = snapshot/config reference only
componentStore = component master spec only
```

---

# 5. Store Contracts

## projectStore

```ts
type ProjectState = {
  id: string;
  name: string;
  customerProgram?: string;
  owner?: string;
  stage?: string;
  description?: string;

  projectContext: {
    productType?: string;
    frequencyRange?: 'FR1';
    coolingArchitecture?: string;
    enclosure?: string;
    baseArchitecture?: string;
  };

  defaults: {
    baselineScenarioId?: string;
    ambientC?: number;
    windMps?: number;
    solarWm2?: number;
  };

  schemaVersion: string;
  revision: string;
  metadata?: Record<string, unknown>;
};
```

## componentStore

```ts
type Component = {
  id: string;
  name: string;
  category?: string;
  qty: number;
  powerW: number;

  thermalSpec: {
    rjcCPerW?: number;
    limitType?: 'Tj' | 'Tc' | 'Ts' | 'Custom';
    limitC?: number;
    tim?: {
      type?: string;
      kWmK?: number;
      thicknessMm?: number;
    };
    boardType?: string;
  };

  modelingPreference?: {
    qtyMode?: 'aggregate' | 'individual' | 'grouped';
    templateId?: string;
    preferredBaseZone?: string;
  };

  provenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};
```

## networkStore
Owns:
- nodes
- edges
- zones
- template bindings
- layout
- active Rth source selection
- external mapping hooks
- network revision
- `requiresReview`

Does NOT own scenario solution.

## scenarioStore
Owns:
- ambient
- wind
- solar
- power scale
- boundary models
- fixed temperatures
- boundary overrides
- scenario revision

## solverStore
Owns:
- solver status
- solutionId
- sourceRevision / inputHash
- node temperatures
- edge Q
- edge ΔT
- energy balance
- warnings

## analysisStore
Owns Screen 08:
- analysisId
- candidate results
- bottleneck scores
- sensitivity studies
- improvement proposals
- analysis cache

## distributionStore
Owns Screen 09:
- dataset metadata
- statistics
- histogram
- scenario comparison
- temperature ranking

## overviewStore
Owns Screen 10:
- Overall Status
- summary KPIs
- readiness
- ResultsOverviewSnapshot

## reportStore
Owns Screen 11:
- report config
- report templates
- preview state
- ReportExportPayload

## exportStore
Owns Screen 12:
- export configuration
- selected artifacts
- ExportSession
- queue
- artifact results
- session export history

---

# 6. DIRTY / STALE / requiresReview

這三個概念必須分開。

## DIRTY
代表：

```text
source input changed; derived result must be recalculated
```

## STALE
代表：

```text
old result still exists but no longer matches current source revisions
```

## requiresReview
代表：

```text
structure may still be valid, but mapping/topology assumptions should be reviewed by user
```

主要用於 `networkStore.requiresReview`。

---

# 7. Canonical Invalidation Chain — Component Change

若 04 修改：

```text
Power
Rjc
TIM
Limit
Qty
Board Type
Template Preference
```

Propagation：

```text
component revision++
        ↓
networkStore.requiresReview = true [when mapped topology/parameters affected]
        ↓
solverStore = DIRTY
        ↓
analysisStore = DIRTY
        ↓
distributionStore = STALE
        ↓
overviewStore = STALE
        ↓
report snapshot = STALE
        ↓
dependent Screen 12 artifacts = BLOCKED/WARNING
```

---

# 8. Topology Change

05 add/delete/edit Node or Edge：

```text
network revision++
solver DIRTY
analysis DIRTY
distribution STALE
overview STALE
report snapshot STALE
dependent exports blocked
```

---

# 9. Boundary / Scenario Change

06 修改：

```text
Ambient
Wind
Solar
h_conv
h_rad
Area
Emissivity
Fixed T
Power Scale
Boundary Type
```

Propagation：

```text
scenario revision++
solver DIRTY
analysis DIRTY
distribution STALE
overview STALE
report snapshot STALE
dependent exports blocked
```

Topology normally remains valid.

---

# 10. Successful Re-Solve

07 successful solve：

```text
new solutionId
new sourceRevision
new inputHash [if implemented]
solver = SOLVED/WARNING
```

Then：

```text
analysisStore = DIRTY
distributionStore = DIRTY
overviewStore = DIRTY
report snapshot = STALE
```

07 must NOT silently regenerate 08/09/10/11.

---

# 11. 08 / 09 / 10 / 11 Dependency Rules

08 complete：

```text
analysisId = new
overviewStore = DIRTY
report snapshot = STALE
```

09 refresh：

```text
distributionId = new
overviewStore = DIRTY
report snapshot = STALE
```

10 refresh + Prepare Report Snapshot：

```text
overview current
snapshotId = new
report snapshot = CURRENT
```

11 layout-only change：

```text
reportConfig revision++
ReportExportPayload DIRTY
```

Must NOT dirty solver/analysis/distribution/overview.

12 export：

must not dirty any engineering state.

---

# 12. Revision Strategy

Authoritative stores expose revision IDs：

```text
projectRevision
componentRevision
networkRevision
scenarioRevision
```

Derived outputs store their source revision snapshot.

Example：

```ts
type SourceRevision = {
  projectRevision?: string;
  componentRevision: string;
  networkRevision: string;
  scenarioRevision: string;
};
```

If current revision differs from solution sourceRevision：

```text
solution = STALE
```

---

# 13. Derived Result IDs

Use explicit IDs：

```text
solutionId
analysisId
distributionId
overviewSnapshotId
reportConfigId
exportSessionId
```

Never rely on timestamp as the only identity.

---

# 14. Solver Input Contract

07 solver receives an immutable frozen input object：

```ts
type SolverInput = {
  projectId: string;
  scenarioId: string;

  nodes: SolverNode[];
  edges: SolverEdge[];

  fixedTemperatures: Record<string, number>;
  sourcePowersW: Record<string, number>;

  sourceRevision: SourceRevision;
};
```

Solver must not read mutable Zustand stores during matrix assembly.

---

# 15. Solver Output Contract

```ts
type ThermalSolution = {
  id: string;
  scenarioId: string;
  sourceRevision: SourceRevision;

  status: 'SOLVED' | 'WARNING' | 'FAILED';

  nodeTemperaturesC: Record<string, number>;

  edgeResults: Record<string, {
    heatFlowW: number;
    deltaTC: number;
    activeRthCPerW: number;
    activeRthSource: string;
  }>;

  energyBalance: {
    generatedW: number;
    rejectedW: number;
    residualW: number;
    errorPercent: number;
  };

  solvedAt: string;
  solverVersion: string;
};
```

---

# 16. Routes

```text
/01-project-info
/02-import-components
/03-flotherm-import
/04-component-manager
/05-thermal-path-builder
/06-boundary-conditions
/07-thermal-network
/08-bottleneck-analysis
/09-temperature-distribution
/10-results-overview
/11-report-preview
/12-export-center
```

03 route exists but shows Deferred until implementation.

---

# 17. Navigation Prerequisites

04 requires project.

05 requires components OR allows expert blank network.

06 requires boundary-side thermal structure.

07 requires valid topology + required boundaries configured.

08 requires current 07 solution.

09 requires current 07 solution.

10 requires current 07 solution; 08/09 may be partial.

11 requires ResultsOverviewSnapshot.

12 validates each artifact independently.

Route philosophy：

> Prefer opening the screen with prerequisite warning + CTA rather than hard-blocking navigation.

---

# 18. Shared UI Components

Mandatory reusable UI primitives：

```text
AppShell
TopHeader
Sidebar
BreadcrumbBar
BottomStatusBar
KpiCard
StatusBadge
FieldLabel
BilingualTooltip
EngineeringInfo
DirtyBanner
StaleBanner
ValidationPanel
EmptyState
ErrorState
LoadingState
ReadOnlyBadge
DataSourceBadge
ConfidenceBadge
```

Screens must not reimplement these independently.

---

# 19. Global Language Rule

From Screen 02 onward：

- English primary
- bilingual when space allows
- compact labels = English visible + zh-TW engineering tooltip
- browser native `title` alone is insufficient

Screens 09–12 enforce this especially strictly.

---

# 20. Provenance Framework

```ts
type SourcedValue<T> = {
  value: T;
  unit: string;

  source:
    | 'analytical'
    | 'datasheet'
    | 'manual'
    | 'vendor'
    | 'flotherm'
    | 'measurement'
    | 'correlation'
    | 'project-default';

  reference?: string;
  confidence?: 'high' | 'medium' | 'low';
  scenarioId?: string;
  importedAt?: string;
  updatedAt?: string;
};
```

---

# 21. FloTHERM Deferred Hooks

03 remains Deferred.

Node retains future：

```text
temperatureResults.flotherm
externalMappings.flotherm
```

Edge retains future：

```text
rth.flotherm
heatFlowResults.flotherm
externalMappings.flotherm
```

Scenario may retain：

```text
externalCaseMapping.flotherm
```

Do NOT：
- hard-code FloTHERM headers
- guess parser schema
- fabricate CFD values
- make 03 mandatory for Analytical workflow

---

# 22. Global Physics Rule — Rule 4

> Never derive segment thermal resistance from ΔT unless the heat flow through that exact segment is known.

Forbidden in branched/shared network：

```text
R_segment = ΔT / component total power
```

Allowed after solver：

```text
Q_edge = ΔT_edge / known R_edge
```

---

# 23. Bottleneck Global Rule

Never rank bottleneck by Rth alone.

Screen 08 score：

```text
35% Edge ΔT
45% full-network sensitivity
20% margin impact
```

Sensitivity must re-solve the full General Thermal Graph.

---

# 24. Persistence Model

Recommended persistent collections：

```text
projects
components
thermal_networks
scenarios
solutions
analyses
distribution_views
overview_snapshots
report_configs
export_metadata
```

Large graph data should preferably live under top-level `thermal_networks`.

---

# 25. Shared thermal_db.json Safety

Rules：

1. Preserve unknown fields.
2. Update only owned namespaces.
3. Merge nested objects.
4. Never replace the root object with a local schema.
5. On corruption, enter read-only/recovery state; do not silently reset DB.
6. Use optimistic concurrency / revision check when available.
7. File export never stores file bytes into shared DB.

---

# 26. Schema Versioning

Every major persistent object contains：

```text
schemaVersion
```

Migration policy：

```text
read old
→ migrate in memory
→ validate
→ persist only after successful migration
```

Never destructive auto-migrate without recovery path.

Recommended migration registry：

```text
migrations/
  project/
  component/
  network/
  scenario/
  solution/
```

---

# 27. Legacy Component Adapter

Map existing schema：

```text
Component     → name
Qty           → qty
Power(W)      → powerW
R_jc          → thermalSpec.rjcCPerW
TIM_Type      → thermalSpec.tim.type
Board_Type    → thermalSpec.boardType
Limit(C)      → thermalSpec.limitC
```

Preserve original source provenance.

---

# 28. Autosave Strategy

Editable persistent screens：

```text
01
04
05
06
11
```

may autosave drafts.

Derived screens：

```text
07
08
09
10
12
```

must not treat transient display changes as source engineering data.

---

# 29. Transaction Boundaries

Atomic operations：

- Apply component import
- Apply architecture template
- Rebuild qty representation
- Save boundary scenario
- Save report config

Failure must not leave partial authoritative state.

---

# 30. Error Taxonomy

```text
VALIDATION_ERROR
PERSISTENCE_ERROR
SCHEMA_ERROR
SOLVER_ERROR
ANALYSIS_ERROR
EXPORT_ERROR
STALE_DATA
READ_ONLY
```

Common issue shape：

```ts
type AppIssue = {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  screen?: string;
  entityId?: string;
  recoverable: boolean;
};
```

---

# 31. Validation Layers

01/02/04/06 → input validation

05 → graph validation

07 → pre-solve / numerical validation

08/09 → analysis validation

10 → summary readiness

11 → snapshot/report validation

12 → artifact/export validation

Each layer owns only its own validity.

---

# 32. Current / Cached / Stale Result

Every derived Store must distinguish：

```text
current result
cached historical result
stale result
```

Stale must never be silently displayed as current.

---

# 33. Scenario Separation

Scenario-dependent data must carry `scenarioId`：

- boundary Rth
- solution
- bottleneck analysis
- distribution
- overview snapshot
- report payload
- export session

Changing active scenario must not destroy other scenario results.

---

# 34. Immutable Computation Snapshots

Before：
- solve
- sensitivity batch
- export

freeze a consistent immutable input snapshot.

Do not compute against mutable stores that can change mid-task.

---

# 35. Web Worker Recommendations

Recommended for：
- large solver workloads
- Screen 08 sensitivity batch
- large ZIP / checksum export

V1 priority：correctness first.

---

# 36. Performance Targets

Typical project target：

```text
20–100 components
40–300 nodes
50–500 edges
```

Product targets：
- base solve < 1 s typical
- ~50-edge sensitivity ideally < 10 s on normal desktop
- long export always shows progress

---

# 37. Engineering Verification Suite

Mandatory categories：

1. Solver analytical tests
2. Invalidation propagation tests
3. Persistence / migration tests
4. Cross-screen integration tests
5. Export traceability tests

---

# 38. Solver Golden Tests

## Series

```text
10 W → 1 K/W → 1 K/W → Fixed 20°C
```

Expected：

```text
Middle = 30°C
Source = 40°C
Q = 10 W on both edges
```

## Parallel

10 W source, two equal 2 K/W branches to 20°C.

Expected：5 W per branch.

## Branch / Merge

Unequal branches split and merge.

Expected：heat redistributes according to conductance and total energy is conserved.

## Shared Base

Two sources → shared base → HSK.

Expected：shared edge carries summed net heat; source temperatures respond to shared Rth.

## Reverse Q

Nominal edge direction opposite actual gradient.

Expected：negative Q / reverse display / no solver error.

## Multiple Boundaries

Two fixed-temperature sinks.

Expected：heat splits to both sinks; rejected heat sums correctly.

## Singular

Disconnected island without reference.

Expected：FAILED with explicit singular-matrix issue.

## Energy Balance

Normal exact cases should be close to machine precision and always within green threshold.

---

# 39. Invalidation Test Matrix

Must test：

- Component power change
- Rjc change
- TIM change
- Qty change
- Node/Edge topology change
- Boundary change
- Scenario switch
- Solver re-solve
- 08 re-analysis
- 09 refresh
- 10 new snapshot
- 11 layout-only change

Example Ambient change in 06：

```text
scenario revision++
07 DIRTY
08 DIRTY
09 STALE
10 STALE
11 snapshot STALE
12 Temperature/PDF dependent artifacts BLOCKED
05 topology remains valid
04 component master unchanged
```

---

# 40. End-to-End Golden Flow

```text
01 Create Project
→ 02 Import Components
→ 04 Complete Component Specs
→ 05 Generate / Edit Network
→ 06 Configure Boundary
→ 07 Solve
→ 08 Analyze Bottlenecks
→ 09 Review Temperature Distribution
→ 10 Prepare Overview Snapshot
→ 11 Prepare Report
→ 12 Export Engineering Package
```

Expected：no stale result in final happy path.

---

# 41. End-to-End Mutation Flow

After successful export：

change PA Power in 04.

Expected：

```text
network requiresReview [if mapped source representation affected]
solver DIRTY
08 DIRTY
09 STALE
10 STALE
11 snapshot STALE
12 dependent export artifacts blocked
```

Re-run downstream pipeline to restore validity.

---

# 42. Reference Demo Project

Create one non-confidential synthetic FR1 demo project：

- 4 × Final PA
- 4 × Driver
- 1 × Filter
- 1 × FPGA
- 1 × Power Module
- zones: RF_LEFT / RF_RIGHT / DIGITAL / POWER
- shared HSK
- Ambient boundary

Use for：
- developer fixture
- regression test
- demo screenshots
- onboarding

Do not use proprietary customer CAD/test data.

---

# 43. Implementation Order

Recommended Codex phases：

```text
Phase 1 — Shared Types / Stores / Persistence
Phase 2 — Shared App Shell / UI primitives
Phase 3 — 01 / 02 / 04
Phase 4 — 05 / 06
Phase 5 — Solver core + 07
Phase 6 — 08 / 09
Phase 7 — 10
Phase 8 — 11 / 12
Phase 9 — E2E invalidation / migration / regression
Phase 10 — 03 FloTHERM after real export sample is available
```

---

# 44. 03 Deferred Contract

Until an actual FloTHERM export sample exists：

Do：
- keep route
- keep Deferred badge
- keep Node/Edge mapping hooks
- keep multi-source result slots

Do NOT：
- guess parser schema
- guess headers
- fabricate CFD results
- make 03 mandatory for 01→12 Analytical workflow

---

# 45. Analytical Workflow Must Be Complete Without 03

The product must fully support：

```text
Analytical Mode
```

from 01 → 12 without FloTHERM.

FloTHERM later enhances：
- calibration
- validation
- provenance
- comparison

but is not a hard dependency.

---

# 46. Codex Global Prohibitions

- Do not model General Thermal Graph as a Tree.
- Do not duplicate authoritative engineering data as editable current data across stores.
- Do not silently display stale results as current.
- Do not use Total Component Power as arbitrary Edge Q.
- Do not derive segment Rth from ΔT unless segment Q is known.
- Do not rank bottleneck by Rth alone.
- Do not let Screen 08 sensitivity mutate baseline network.
- Do not let Screen 09 solve the network.
- Do not let Screen 10 rerun engineering analysis.
- Do not let Screen 11 export files.
- Do not let Screen 12 modify report/thermal source inputs.
- Do not hard-code FloTHERM parser.
- Do not overwrite unknown shared DB fields.
- Do not destructive-migrate old projects silently.

---

# 47. Definition of Done

System integration is complete when：

```text
Input changes
→ invalidation propagates correctly
→ current/stale is always visible
→ recomputation restores downstream validity
→ every result remains traceable to source revisions
→ report snapshot is versioned
→ export package uses one consistent source snapshot
```

---

# 48. Final Principle

A trustworthy thermal engineering tool must answer：

1. **Where did this value come from?**
2. **Which exact project / scenario / network revision produced it?**
3. **Is it still current after upstream inputs changed?**

This System Integration specification exists to guarantee those three properties across Screens 01–12.
