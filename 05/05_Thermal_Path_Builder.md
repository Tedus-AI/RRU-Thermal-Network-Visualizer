# 05 — Thermal Path Builder / 熱路徑設定
## 5G FR1 Thermal Network Visualizer
### Screen Functional Specification for Codex

**Document ID:** `05_Thermal_Path_Builder`  
**Parent Architecture:** `00_Product_Vision_and_Architecture.md`  
**Previous:** `04_Component_Manager.md`  
**Deferred:** `03_FloTHERM_Import`  
**Next:** `06_Boundary_Conditions.md`  
**Priority:** P0 — Core Product  

---

# 0. Core Responsibility

Screen 05 是第一次真正建立 **General Thermal Graph** 的頁面。

04 只準備 Component thermal specification；05 才建立：

- Thermal Nodes
- Thermal Edges
- Architecture Templates
- Qty representation
- Shared Base / HSK structure
- Series / Parallel / Branch / Merge
- Analytical edge model
- Graph validation

05 **不做**：

- 完整 Boundary Conditions
- Final temperature solve
- Bottleneck analysis
- FloTHERM import
- Invented Edge Heat Flow Q

---

# 1. Screen 03 Deferred Compatibility

`03_FloTHERM_Import` 目前刻意延後，因為實際 FloTHERM export schema 尚未完成驗證。

05 必須保留：
- Node `externalMappings.flotherm`
- Edge `externalMappings.flotherm`
- Node analytical / flotherm / measurement temperature result slots
- Edge analytical / flotherm / measurement / manual Rth slots

05 禁止：
- 猜 FloTHERM CSV header
- 實作假的 FloTHERM parser
- 用 FloTHERM value 覆蓋 analytical value

---

# 2. User Flow

```text
Load Components from 04
→ Decide Qty Representation
→ Apply Architecture Templates
→ Generate Local Component Subgraphs
→ Build Shared Structure
→ Connect Thermal Ports
→ Add Parallel / Coupling Paths
→ Define Edge Models
→ Validate Graph
→ Save
→ Continue to 06 Boundary Conditions
```

---

# 3. UI Language

- English primary
- 空間足夠：English / 繁中
- 空間不足：English + accessible zh-TW tooltip
- 沿用固定 Deep Navy App Shell

Sidebar 中 `03 FloTHERM Import` 保留但顯示 Deferred / Coming Later。

---

# 4. Layout

```text
Top Header + Breadcrumb
┌───────────────┬───────────────────────────────┬──────────────────────┐
│ LEFT PANEL    │ CENTER GRAPH CANVAS           │ RIGHT INSPECTOR      │
│ Components    │ Toolbar                       │ Node Inspector       │
│ Templates     │ Cytoscape Thermal Graph       │ Edge Inspector       │
│ Structure     │ Validation overlays           │ Model / Source       │
└───────────────┴───────────────────────────────┴──────────────────────┘
Bottom Status + Save / Validate / Continue
```

建議：
- Left: 250–300 px
- Right: 340–400 px
- Center: flexible

---

# 5. Builder Stepper

Screen-specific 5 steps：

```text
1 Components
2 Templates
3 Shared Structure
4 Connections
5 Validate
```

---

# 6. Step 1 — Components

每個 component 顯示：

```text
Name
Category
Qty
Power per Device
Template Preference
Qty Modeling Preference
Preferred Base Zone
Readiness
```

讀取 Screen 04 的資料。

---

# 7. Qty Representation

對 Qty > 1 支援：

## Aggregate
一個 source node，power = Qty × Power。

注意：
> 這只代表 source power aggregation，不代表所有 downstream Edge Q 都等於 Total Power。

## Individual
例如 Qty=4：
```text
PA1
PA2
PA3
PA4
```

## Grouped
例如：
```text
PA Left ×2
PA Right ×2
```

更改 representation 若 subgraph 已存在，必須警告 topology rebuild risk。

---

# 8. Step 2 — Architecture Templates

V1 built-in：

1. Bottom Cool + Copper Coin
2. Bottom Cool + Thermal Via
3. Top Cool + Lid
4. Bare Die
5. Small Base + Heat Pipe
6. Direct Metal Mount
7. Custom

04 的 `templatePreference` 自動預選，但需使用者 Apply。

---

# 9. Template Architecture

Template 必須定義：

```text
Node prototypes
Edge prototypes
Ports
Required Parameters
Optional Parameters
Validation Rules
Template ID
Template Version
```

不能把模板畫死在 React component 中。

---

# 10. Template Ports

Local template **不得直接 hard-code `MAIN_BASE`**。

應使用 ports：

```text
HEAT_OUT
BOARD_OUT
TOP_OUT
HEAT_PIPE_OUT
DIRECT_BASE_OUT
```

例如：

```text
PA Junction
→ Case
→ Solder
→ Copper Coin
→ TIM
→ HEAT_OUT
```

Step 4 才把 `HEAT_OUT → RF_LEFT`。

---

# 11. Built-in Template Topologies

## Bottom Cool + Copper Coin
```text
Junction → Case/EPAD → Solder → Copper Coin → TIM → HEAT_OUT
```

## Bottom Cool + Thermal Via
```text
Junction → Case/EPAD → PCB Thermal Via Region → TIM/Contact → HEAT_OUT
```

## Top Cool + Lid
```text
Junction → Lid/Case → TIM → Pedestal → HEAT_OUT
```

## Bare Die
```text
Die/Junction → TIM → Pedestal/Base Contact → HEAT_OUT
```

## Small Base + Heat Pipe
```text
Junction → Case → TIM → Small Base
                         ├→ DIRECT_BASE_OUT
                         └→ HEAT_PIPE_OUT
```

## Direct Metal Mount
```text
Junction/Case → Contact → Metal Mount → HEAT_OUT
```

---

# 12. Template Preview & Apply

Preview 顯示：
- mini subgraph
- required inputs
- missing inputs
- generated ports

Apply 後才生成。

已有 subgraph 時：
```text
Replace Auto-generated Only
Replace Entire Component Subgraph
Cancel
```

Manual objects 不得 silently 被刪掉。

---

# 13. Step 3 — Shared Structure

Presets：

```text
Single Main Base
3-Zone Base
Functional Zones
Small Base + Main Base
Heat Pipe + Main Base
Custom
```

可建立：
- Main Base
- Base Zones
- Housing
- HSK Base
- Fin Root
- Fin Surface
- Ambient Placeholder
- Radiative Surrounding Placeholder

---

# 14. Shared Base Models

## Single Main Base
```text
MAIN_BASE → HSK_BASE → FIN_ROOT → FIN_SURFACE
```

## 3-Zone
```text
BASE_TOP ↔ BASE_MID ↔ BASE_BOTTOM
```

zone 間用 `Spreading` edge。

## Functional Zones
Preset：
```text
RF_LEFT
RF_RIGHT
DIGITAL
POWER
FILTER
```

可增刪與建立 coupling / spreading edge。

---

# 15. Boundary Placeholder

05 可以建立：

```text
FIN_SURFACE → AMBIENT_PLACEHOLDER
```

但此 edge 必須為：

```text
method = Boundary Derived
Rth = UNRESOLVED
```

05 不可假設：
- Ambient = 55°C
- h_conv
- h_rad
- wind
- solar

這些屬於 Screen 06。

---

# 16. Step 4 — Connections

主要工作：

```text
Component Port → Shared Node
```

例如：
```text
PA1 HEAT_OUT → RF_LEFT
FPGA HEAT_OUT → DIGITAL
Power Module HEAT_OUT → POWER
```

04 的 Preferred Base Zone 可用於：
`Auto Connect Suggested`

但必須 preview + Apply，不可 silent connect。

---

# 17. General Graph Requirements

必須支援：

```text
Series
Parallel
Branch
Merge
Shared Nodes
Coupling Cycles
Multiple Heat Sources
```

Graph **不能限制為 Tree**。

例如合法：

```text
Small Base
├→ Direct Conduction → Main Base
└→ Heat Pipe → Main Base
```

以及：

```text
RF Base ↔ Digital Base ↔ Power Base
```

Cycle 不可一律視為 error。

---

# 18. Node Types

V1：
```text
Heat Source
Junction
Die
Case
Lid
EPAD
PCB
Thermal Via
Copper Coin
TIM Interface
Solder Interface
Pedestal
Small Base
Main Base
Base Zone
Housing
Heat Pipe Evaporator
Heat Pipe Condenser
Heat Sink Base
Fin Root
Fin Surface
Ambient Placeholder
Radiative Surrounding Placeholder
Custom Node
```

---

# 19. Edge Types

V1：
```text
Package Rjc
Solid Conduction
TIM
Solder
Thermal Via
Contact
Heat Pipe
Spreading
Convection
Radiation
Combined Boundary
Custom Rth
```

---

# 20. Edge Rth Methods

```text
Direct Rth
L / kA
Package Rjc
TIM t / kA
Thermal Via Equivalent
Heat Pipe Equivalent
Spreading Correlation
Boundary Derived
Manual
Unresolved
```

05 可算 scenario-independent analytical Rth。



# 21. Analytical Edge Calculation

## Solid Conduction
```text
R = L / (kA)
```

## TIM
```text
R = t / (k A_eff)
```

## Package
```text
R = Rjc
```

## Heat Pipe
V1 使用 vendor/manual equivalent Rth。

## Spreading
只有 selected correlation + required parameters 足夠才計算；否則保持 `UNRESOLVED`。

---

# 22. No Full Solve in Screen 05

05 不顯示最終：
- Node Temperature
- Edge Heat Flow Q
- ΔT
- Thermal Margin
- Bottleneck

因 Boundary 尚未完成。

05 只顯示：
- topology
- source power
- analytical edge Rth
- unresolved status
- validation readiness

---

# 23. Thermal Node Schema

```ts
type ThermalNode = {
  id: string;
  name: string;
  type: ThermalNodeType;
  category?: string;
  componentId?: string;
  zoneId?: string;

  powerW?: number;

  temperatureResults?: {
    analytical?: ResultValue<number>;
    flotherm?: ResultValue<number>;
    measurement?: ResultValue<number>;
  };

  thermalLimit?: {
    type: 'Tj' | 'Tc' | 'Ts' | 'Custom';
    valueC: number;
  };

  boundary?: {
    role?: 'placeholder' | 'configured';
  };

  externalMappings?: {
    flotherm?: {
      objectAliases?: string[];
      mappingStatus?: 'unmapped' | 'partial' | 'mapped';
    };
  };

  position: { x: number; y: number };
  metadata?: Record<string, unknown>;
};
```

---

# 24. Thermal Edge Schema

```ts
type ThermalEdge = {
  id: string;
  from: string;
  to: string;

  type: ThermalEdgeType;
  method: EdgeRthMethod;

  rth: {
    analytical?: ResultValue<number>;
    flotherm?: ResultValue<number>;
    measurement?: ResultValue<number>;
    manual?: ResultValue<number>;
  };

  activeRthSource:
    | 'analytical'
    | 'flotherm'
    | 'measurement'
    | 'manual'
    | 'unresolved';

  heatFlowResults?: {
    analytical?: ResultValue<number>;
    flotherm?: ResultValue<number>;
    measurement?: ResultValue<number>;
  };

  parameters: Record<string, unknown>;

  externalMappings?: {
    flotherm?: {
      interfaceAliases?: string[];
      mappingStatus?: 'unmapped' | 'partial' | 'mapped';
    };
  };

  enabled: boolean;
  confidence?: 'high' | 'medium' | 'low';
  metadata?: Record<string, unknown>;
};
```

---

# 25. ResultValue

共用：

```ts
type ResultValue<T> = {
  value: T;
  unit: string;
  source:
    | 'analytical'
    | 'flotherm'
    | 'measurement'
    | 'datasheet'
    | 'manual';
  scenarioId?: string;
  reference?: string;
  confidence?: 'high' | 'medium' | 'low';
  importedAt?: string;
};
```

Analytical / FloTHERM / Measurement 必須可共存，不互相覆蓋。

---

# 26. Node Inspector

Tabs：
```text
Overview
Thermal Role
Connections
Source
External Mapping
```

Overview：
- Node Name
- Node Type
- Component
- Zone
- Source Power
- Limit

Connections：
- connected edges
- focus
- edit
- disable
- delete

External Mapping：
- FloTHERM status
- optional alias metadata
- 不解析格式

---

# 27. Edge Inspector

Tabs：
```text
Overview
Model
Parameters
Source
External Mapping
```

Overview：
- From
- To
- Type
- Method
- Active Rth
- Status
- Enabled

Model examples：

### Conduction
- Length
- K
- Area
- Calculated Rth

### TIM
- Thickness
- K
- Effective Area
- Calculated Rth

### Heat Pipe
- Equivalent Rth
- Source
- Reference

### Spreading
- Method
- Rth if known
- Confidence
- Notes

---

# 28. Parameter Link / Override

Edge parameters 可：

```text
Inherited
Override
```

例如：
`TIM K linked to Component TIM`

Screen 04 改 linked value 後：
```text
networkStore.requiresReview = true
```

05 提供：
```text
Refresh Linked Parameters
Keep Local Override
```

---

# 29. Graph Toolbar

```text
Select
Pan
Connect
Add Node
Add Edge
Undo
Redo
Auto Layout
Fit
Zoom
Validate
Show Ports
Show Labels
```

---

# 30. Layout Modes

```text
Auto
Left → Right
Top → Bottom
Hierarchical
Free
```

Node drag position 必須保存。

---

# 31. Visual Rules Before Solve

因 05 尚未 Solve：

## Node color
依：
```text
Node Type / Category
```

不是 Temperature。

## Edge color
依：
```text
Edge Type / Status
```

## Edge line style
```text
Solid  = Rth resolved
Dashed = unresolved / boundary-dependent
Dotted = disabled / tentative
```

Boundary Placeholder：
- dashed border
- warning icon

---

# 32. Template Ports Visual

Port 顯示：

```text
HEAT_OUT
BOARD_OUT
HEAT_PIPE_OUT
TOP_OUT
```

Unconnected：
- warning/orange

Connected：
- normal/green or optionally hidden

---

# 33. Step 5 — Validation

Validation severity：

```text
ERROR
WARNING
INFO
```

## Blocking Errors
- Active heat source has no thermal path
- Required port unconnected
- Edge references missing node
- Self-loop
- Negative Rth
- Invalid numerical parameter
- Missing required template node
- No path from active source toward boundary-side structure

## Warnings
- Boundary placeholder not configured
- Rth unresolved
- Spreading Rth unknown
- Multiple path split unknown
- External mapping not set
- Manual Rth lacks source/reference
- Optional template parameter missing

---

# 34. Cycles

合法 coupling cycle 不應視為 Error。

例如：
```text
RF_LEFT ↔ DIGITAL ↔ POWER ↔ RF_LEFT
```

只禁止：
- self-loop
- broken references
- invalid edge
- solver singularity 之後由 07/solver validation 處理

---

# 35. Possible Duplicate Edge

同 from/to 可以有：
```text
Convection
Radiation
```

但 same from + same to + same type + same method：
顯示 Warning：
`Possible duplicate edge`

---

# 36. Network Readiness KPI

Top cards：

```text
Components Modeled
Nodes
Edges
Unconnected Ports
Unresolved Rth
Blocking Errors
```

Example：
```text
15 / 18
42
47
3
5
0
```

---

# 37. Network Status

```text
EMPTY
DRAFT
NEEDS_REVIEW
VALID
DIRTY
READ_ONLY
```

---

# 38. Stable IDs

不可每次 render 重建隨機 ID。

建議：

```text
NODE_<componentId>_<role>_<index>
EDGE_<componentId>_<fromRole>_<toRole>
NODE_ZONE_RF_LEFT
NODE_HSK_BASE
```

---

# 39. Template Origin / Version

Template-generated object metadata：

```text
origin = template
templateId
templateVersion
componentId
modified = false/true
```

Manual：
```text
origin = manual
```

Template update 不可 silently rebuild existing project。

---

# 40. Manual Edit Protection

Template-generated edge 被手動改：
```text
modified = true
```

之後 rebuild：
```text
This edge was manually modified.
Preserve / Replace?
```

---

# 41. Undo / Redo

V1 至少支援：
- Add/Delete Node
- Add/Delete Edge
- Move Node
- Change Edge Model
- Apply Template
- Connect Port

---

# 42. Shared Base Zone Builder

`+ Add Zone`

Fields：
```text
Zone Name
Zone Type
Linked HSK
Notes
```

Preset：
```text
RF Left
RF Right
Digital
Power
Filter
```

---

# 43. Spreading Edge Builder

Fields：
```text
From Zone
To Zone
Method
Rth
Source
Confidence
```

Methods：
```text
Manual
Correlation
Unresolved
Future FloTHERM
```

`Future FloTHERM` 只是 source placeholder，不是 importer。

---

# 44. Heat Pipe Builder

V1 Simple：

```text
Evaporator
→ Equivalent Heat Pipe Edge
→ Condenser
```

Rth：
- Manual
- Vendor

Future 可拆：
```text
R_evap
R_axial
R_cond
```

---

# 45. Rule 4 Protection

> Never derive segment Rth from ΔT unless segment heat flow Q is known.

05 不得提供：
```text
R = temperature difference / component total power
```

因為 05 沒有 Edge Q。

---

# 46. Network Store

```ts
type ThermalNetwork = {
  projectId: string;
  schemaVersion: string;
  status: NetworkStatus;

  nodes: Record<string, ThermalNode>;
  edges: Record<string, ThermalEdge>;

  templates: Record<string, ComponentTemplateBinding>;
  zones: Record<string, BaseZone>;

  layout: {
    mode: string;
    positions: Record<string, { x: number; y: number }>;
  };

  validation: NetworkValidationResult;
  metadata: Record<string, unknown>;
};
```

Cytoscape 只是 view/interaction layer。

`networkStore` 是唯一 Graph source of truth。

---

# 47. Store Contracts

05 使用：

```text
componentStore  [read]
networkStore    [read/write]
solverStore     [invalidate only]
scenarioStore   [metadata read only]
```

不要把 Graph 存進 componentStore。

---

# 48. Solver Invalidation

任何：
- topology change
- Rth change
- Edge enable/disable
- source node power representation change

必須：
```text
solverStore.status = DIRTY
```

05 本身不 Solve。

---

# 49. Generate From Preferences

Network empty 時：

```text
Generate from Component Preferences
Start Blank
```

Generate preview：
```text
15 components will be modeled
42 nodes
39 local edges
3 shared zones suggested
5 components need review
```

使用者按：
`Generate Network`
才 commit。

---

# 50. Start Blank

Expert mode。

可從 left panel drag component 到 canvas。

若無 template：
`Choose Thermal Architecture`

若已有 preference：
`Use Bottom Cool + Copper Coin?`

---

# 51. Context Menu

Node：
```text
Inspect
Connect
Duplicate
Disable
Delete
Center
```

Edge：
```text
Inspect
Disable
Duplicate
Reverse Nominal Direction
Delete
```

Reverse nominal direction 只改 UI metadata，不代表 physical conductance 只能單向。

---

# 52. Empty / Loading / Error / Read-only

## Empty components
```text
No components available.
Complete Component Manager first.
```

## Empty network
```text
Build your thermal network
Generate from Preferences
Start Blank
```

## Loading
- graph skeleton
- component palette skeleton
- inspector disabled

## Error
```text
Unable to load thermal network.
Retry
Return to Component Manager
```

## Read-only
允許：
- pan
- zoom
- inspect
- export JSON

禁止：
- edit
- apply template
- add/delete

---

# 53. Save Behavior

`Save Network`：
- save nodes
- save edges
- save template bindings
- save zones
- save graph layout
- save validation
- preserve unknown metadata
- keep solver DIRTY

---

# 54. Save & Continue

條件：
```text
Blocking Errors = 0
```

Warnings 可 continue。

例如：
```text
5 thermal edges remain unresolved.
They must be completed in Screen 06 or later calibration.
Continue?
```

下一頁：
`06_Boundary_Conditions`



# 55. Frontend Modules

```text
src/
  screens/05-thermal-path-builder/
    ThermalPathBuilderView.tsx
    BuilderStepper.tsx
    ComponentPalette.tsx
    TemplatePalette.tsx
    SharedStructurePanel.tsx
    GraphToolbar.tsx
    ThermalGraphCanvas.tsx
    NodeInspector.tsx
    EdgeInspector.tsx
    NetworkValidationPanel.tsx
    GenerateNetworkPreview.tsx

  thermal/
    templates/
      templateRegistry.ts
      bottomCoolCoin.ts
      bottomCoolVia.ts
      topCoolLid.ts
      bareDie.ts
      smallBaseHeatPipe.ts
      directMetal.ts

    graph/
      networkBuilder.ts
      graphValidation.ts
      idFactory.ts
      templateRebuild.ts

    resistance/
      conduction.ts
      tim.ts
      via.ts
      heatPipe.ts
      spreading.ts
```

---

# 56. Cytoscape Requirement

05 graph canvas 建議使用 `Cytoscape.js`。

需要：
- selection
- pan
- zoom
- drag
- edge connection
- layout
- custom node style
- custom edge style
- context actions

Cytoscape state 不可取代 `networkStore`。

---

# 57. Engineering Tooltips

至少：

## Thermal Port
`Template connection point used to attach a component subgraph to the shared system structure.`  
繁中：`元件模板的熱連接埠，供 local subgraph 連到共用 Base / HSK 結構。`

## Qty Representation
`Controls whether identical devices are represented as aggregate, individual or grouped heat sources.`

## Spreading Resistance
`Equivalent resistance representing 3D heat spreading. Do not replace with L/kA unless the assumption is justified.`

## Boundary Placeholder
`Structural endpoint reserved for Screen 06 boundary-condition assignment.`

## Unresolved Rth
`Topology exists, but resistance is not yet known or depends on later boundary / CFD / measurement data.`

## Active Rth Source
`The source selected for later solver use. Analytical, FloTHERM, measurement and manual values remain separately traceable.`

---

# 58. Acceptance Criteria

## Inputs from 04
- AC-05-01 Reads readiness / template / qty / preferred zone.
- AC-05-02 Component preferences can generate a preview before commit.

## Quantity Modeling
- AC-05-03 Aggregate works.
- AC-05-04 Individual works.
- AC-05-05 Grouped works.
- AC-05-06 Changing representation warns about rebuild risk.

## Templates
- AC-05-07 Six built-in templates work.
- AC-05-08 Templates use ports.
- AC-05-09 Templates do not hard-code Main Base.
- AC-05-10 Template preview shows missing requirements.
- AC-05-11 Rebuild distinguishes generated vs manual objects.

## Shared Structure
- AC-05-12 Single Base works.
- AC-05-13 3-Zone Base works.
- AC-05-14 Functional Zones work.
- AC-05-15 Custom zones work.
- AC-05-16 HSK / Fin / Boundary placeholders can be added.

## General Graph
- AC-05-17 Series works.
- AC-05-18 Parallel works.
- AC-05-19 Branch works.
- AC-05-20 Merge works.
- AC-05-21 Physical coupling cycles are allowed.
- AC-05-22 Graph is not tree-only.
- AC-05-23 Stable IDs persist.
- AC-05-24 Node positions persist.
- AC-05-25 Add/Edit/Delete/Disable Node works.
- AC-05-26 Add/Edit/Delete/Disable Edge works.
- AC-05-27 Undo/Redo covers key graph edits.

## Edge Models
- AC-05-28 Package Rjc works.
- AC-05-29 Solid conduction L/kA works.
- AC-05-30 TIM t/kA works.
- AC-05-31 Thermal Via equivalent can be modeled.
- AC-05-32 Heat Pipe equivalent can be modeled.
- AC-05-33 Spreading can remain unresolved.
- AC-05-34 Boundary-derived edge remains unresolved until 06.
- AC-05-35 Unknown Rth never becomes zero.

## Validation
- AC-05-36 Orphan active source detected.
- AC-05-37 Required unconnected port detected.
- AC-05-38 Missing node reference is error.
- AC-05-39 Negative Rth is error.
- AC-05-40 Self-loop is error.
- AC-05-41 Cycle is not automatically error.
- AC-05-42 Possible duplicate edge is warning.
- AC-05-43 Boundary-not-configured is warning.
- AC-05-44 Blocking Errors gate Continue.

## Physics / Solver Separation
- AC-05-45 No full temperature solve occurs.
- AC-05-46 No Edge Q is invented.
- AC-05-47 Qty × Power is never treated as Edge Q.
- AC-05-48 Topology/Rth changes mark solver DIRTY.

## Screen 03 Compatibility
- AC-05-49 Node FloTHERM mapping hook exists.
- AC-05-50 Edge interface mapping hook exists.
- AC-05-51 Multi-source Rth slots exist.
- AC-05-52 Multi-source temperature slots exist.
- AC-05-53 No FloTHERM parser exists.
- AC-05-54 No FloTHERM headers are hard-coded.
- AC-05-55 External data never overwrites analytical provenance.

## UI / Navigation
- AC-05-56 Uses fixed shared App Shell.
- AC-05-57 Has 5-step Builder Stepper.
- AC-05-58 English-primary + zh-TW tooltip/bilingual support.
- AC-05-59 Empty / Loading / Error / Read-only / Dirty states exist.
- AC-05-60 Save & Continue routes to Screen 06.

---

# 59. Developer Test Cases

## Test A — 4 PA Individual
Input：
```text
Final PA
Qty=4
Power=52.13W each
Template=BOTTOM_COOL_COIN
Qty=INDIVIDUAL
Base Zone=RF_LEFT
```
Expected：
- PA1~PA4 local subgraphs
- each source = 52.13W
- suggested RF_LEFT connection
- no forced Edge Q

## Test B — FPGA Top Cool
Expected：
single TOP_COOL_LID subgraph to DIGITAL port.

## Test C — Heat Pipe Parallel
```text
Small Base
├→ Direct → Main Base
└→ Heat Pipe → Main Base
```
Expected：valid parallel topology.

## Test D — Zone Coupling Cycle
```text
RF_LEFT ↔ DIGITAL ↔ POWER ↔ RF_LEFT
```
Expected：valid coupling, not automatic error.

## Test E — Boundary Unconfigured
```text
FIN_SURFACE → AMBIENT_PLACEHOLDER
```
Expected：Warning + unresolved boundary edge.

## Test F — Missing Rjc
Expected：unresolved/warning, never fake zero.

## Test G — Qty Model Rebuild
Existing manual connection + change Individual → Aggregate.
Expected：explicit orphan/rebuild warning.

## Test H — FloTHERM Alias
Store alias only; no parsing or result import.

---

# 60. Codex Implementation Order

1. Read `00_Product_Vision_and_Architecture.md`
2. Read `04_Component_Manager.md`
3. Read `05_Thermal_Path_Builder.md`
4. View `05_Thermal_Path_Builder.png`
5. Load mock JSON
6. Confirm 03-deferred hooks
7. Implement shared Node/Edge types
8. Implement stable ID factory
9. Implement template registry + ports
10. Implement Qty modeling
11. Implement shared structure builder
12. Implement `networkStore`
13. Implement Cytoscape canvas
14. Implement Node/Edge inspectors
15. Implement analytical edge calculators
16. Implement graph validation
17. Implement rebuild/manual-preserve logic
18. Implement dirty / solver invalidation
19. Run acceptance checklist

---

# 61. Codex Must Not

- Do not model the graph as a Tree.
- Do not hard-code PA/FPGA paths in React components.
- Do not hard-code a Main Base ID inside templates.
- Do not run the final network solve in Screen 05.
- Do not assume Ambient = 55°C.
- Do not invent h_conv / h_rad / wind / solar.
- Do not use Qty × Power as Edge Q.
- Do not coerce unknown Rth to zero.
- Do not treat every cycle as invalid.
- Do not overwrite analytical values with future FloTHERM values.
- Do not guess FloTHERM CSV schema.
- Do not silently delete manual graph objects on template rebuild.
- Do not use Cytoscape internal state as the only source of truth.

---

# 62. Definition of Done

```text
Components from 04
→ Qty modeled
→ Templates applied
→ Local subgraphs generated
→ Shared structure created
→ Ports connected
→ Series / Parallel / Branch / Merge supported
→ Analytical Rth calculated where possible
→ Unknown / boundary-dependent Rth remains unresolved
→ Graph validated
→ Network saved
→ Ready for Screen 06
```

At the same time：

```text
No final temperature solve
No fake CFD
No fake Edge Q
No tree-only limitation
```

---

# 63. Output Contract to Screen 06

Screen 06 receives：

```text
Thermal Nodes
Thermal Edges
Boundary Placeholders
HSK / Fin structural nodes
Unresolved boundary-derived edges
Area / linked parameters where available
Network validation state
```

Screen 06 adds：

```text
Ambient Temperature
Wind
Solar
Convection h
Radiation
Fixed Temperature
Scenario-specific boundary parameters
```

---

# 64. Final Principle

**05_Thermal_Path_Builder 的工作是正確描述「熱可以怎麼走」。在 06 邊界條件完成以前，它不應假裝知道「每條路實際走多少 W」或「每個節點最後幾 °C」。**
