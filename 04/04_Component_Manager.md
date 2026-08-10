# 04 — Component Manager / 元件管理
## 5G FR1 Thermal Network Visualizer
### Screen Functional Specification for Codex

**Document ID:** `04_Component_Manager`  
**Parent Architecture:** `00_Product_Vision_and_Architecture.md`  
**Previous Implemented Screen:** `02_Import_Components.md`  
**Deferred Screen:** `03_FloTHERM_Import`  
**Next Screen:** `05_Thermal_Path_Builder.md`  
**Priority:** P0

---

# 0. Critical Development Note — Screen 03 Is Intentionally Deferred

本專案目前刻意暫時跳過 `03_FloTHERM_Import`。原因不是取消 FloTHERM 整合，而是 **FloTHERM 實際 Results/Table/CSV export schema 尚未用真實輸出檔確認**。

目前先完成 Analytical / Manual Thermal Network 主流程：

```text
01 Project Info
→ 02 Import Components
→ 04 Component Manager
→ 05 Thermal Path Builder
→ 06 Boundary Conditions
→ 07 Thermal Network
→ 08 Bottleneck Analysis
→ 09 Temperature Distribution
→ 10 Results Overview
→ 11 Report Preview
→ 12 Export Center
```

完成後再回補：

```text
03 FloTHERM Import
→ Node Temperature Mapping
→ Edge Heat Flow Mapping
→ Effective Rth Calibration
→ Analytical vs FloTHERM Comparison
```

## 0.1 Codex 必須理解

**Screen 03 is deferred, not removed.** 04～10 的資料模型必須現在就保留 FloTHERM integration hooks。

現在禁止：
- 猜 FloTHERM CSV header。
- hard-code 未驗證的 FloTHERM export format。
- 建假的 FloTHERM parser。
- 將未來 CFD 值設計成會覆蓋 Analytical 原始值。

現在必須預留：
- Component external mapping hooks。
- Node analytical / flotherm / measurement temperature result slots。
- Edge analytical / flotherm / measurement / manual Rth slots。
- Result provenance / scenario / confidence。

---

# 1. Purpose / 頁面目的

`04_Component_Manager` 是所有已匯入元件的正式資料管理與 Thermal Specification 準備頁。

Screen 02：Import / Staging / Mapping / Validation。  
Screen 04：**Review / Complete / Normalize / Manage / Prepare。**  
Screen 05：真正建立 Thermal Nodes / Edges / topology。

本頁管理：
- 元件名稱、Category、Qty、Power。
- Limit Type / Limit。
- Rjc。
- Package / Contact Geometry。
- Board thermal path specification。
- TIM。
- Thermal completeness。
- Architecture template preference。
- Base-zone preference。
- Qty modeling preference。
- Provenance。
- Future FloTHERM external mapping hooks。

> **本頁不得建立 Thermal Node / Edge。**

---

# 2. Primary User Flow

```text
Review Imported Components
→ Fix Missing Thermal Properties
→ Confirm Tj / Tc / Ts Limit
→ Confirm Rjc
→ Confirm Package / Contact Geometry
→ Confirm Board Path
→ Confirm TIM
→ Prepare Architecture Preference
→ Validate Readiness
→ Save
→ Continue to Thermal Path Builder
```

---

# 3. UI Language Standard

延續 02：
1. English primary。
2. 空間足夠時 `English / 繁中`。
3. 空間不足時顯示英文，hover / accessible tooltip 顯示繁中。
4. 使用 shared `FieldLabel` / `BilingualTooltip`，不要每頁重新寫。

---

# 4. Shared App Shell

04 必須沿用固定 Shell：
- Deep navy Top Header。
- Deep navy Left Sidebar。
- Breadcrumb。
- Shared Main Workspace。
- Deep navy Bottom Status Bar。

Sidebar 正式順序：
```text
01 Project Info
02 Import Components
03 FloTHERM Import [Deferred]
04 Component Manager  ← Active
05 Thermal Path Builder
06 Boundary Conditions
07 Thermal Network
08 Bottleneck Analysis
09 Temperature Distribution
10 Results Overview
11 Report Preview
12 Export Center
```

不得因 04 mockup 自行創造新 Dashboard / route。

---

# 5. Layout

```text
Breadcrumb + Page Title

Top KPI / Readiness Cards

Category Tabs + Toolbar

Main Component Table                    Right Inspector
                                        ├─ Overview
                                        ├─ Thermal Spec
                                        ├─ Geometry
                                        ├─ Architecture Prep
                                        ├─ Source
                                        └─ External Mapping

Bottom Action Bar
```

Main table 約 70–75%，Inspector 25–30%。

---

# 6. Top KPI / Readiness

Cards：
```text
Components
Heat Sources
Total Power
Ready for Network
Warnings
Errors
```

Example：
```text
Components          18
Heat Sources        15
Total Power      412.3 W
Ready               13
Warnings              4
Errors                1
```

---

# 7. Component Readiness

Minimum ready：
- Name valid。
- Qty > 0。
- Power >= 0。
- Category assigned。
- Limit Type assigned。
- Limit valid。
- Package / thermal interface strategy not unresolved。

Strongly recommended for Heat Source：
- Rjc。
- Contact geometry。
- Board type。
- TIM。

缺 Strongly Recommended → `WARNING`，不是整個 Project blocking error。

---

# 8. Category Tabs

```text
All
RF
Digital
Power
Filter
Other
```

每 tab 顯示 count、total power、Ready/Warning。

---

# 9. Toolbar

Filters：
```text
Search
Status
Category
Heat Source
Source
Thermal Completeness
Reset
```

Actions：
```text
+ Add Component
Duplicate
Disable
Delete
Save to Library
Bulk Edit
Columns
```

---

# 10. Main Table Columns

Default：
```text
Enabled
Status
Category
Component
Qty
Power
Total Power
Limit Type
Limit
Rjc
Package
Board Type
TIM
Thermal Profile
Source
```

Optional：
```text
Height
Pad L
Pad W
Thickness
Contact Area
External Mapping
Last Updated
```

---

# 11. Key Field Semantics

## Qty
Qty 不代表一定建立 Qty 個獨立 thermal source node；Screen 05 依 `Network Representation` 決定 Aggregate / Individual / Grouped。

## Power
單顆元件功耗 W。

## Total Power
`Qty × Power`，只作元件功耗摘要。**不是 Thermal Edge heat flow Q。**

## Limit Type
V1：`Tj / Tc / Ts / Custom / Unknown`。

不得依 Category 強制所有元件使用 Tj。

## Rjc
未知時使用 `null / N/A`，**禁止用 0 表示 unknown**。

## Package
例如：QFN、BGA、LGA、Lidded BGA、Bare Die、Module、Shielded Module、Custom。

## Board Type
`Thermal Via / Copper Coin / Direct Metal / PCB Only / None / Custom`。

## TIM
`Grease / Pad / Pad2 / Putty / PCM / Gap Filler / Solder / None / Custom`。

TIM spec 不等於一定建立獨立 Edge；由 Screen 05 決定。

## Thermal Profile
狀態：`Not Assigned / Draft / Ready / Custom`。
代表 Screen 05 建模準備，不是 topology。

---

# 12. Inline Editing

允許：Enabled、Category、Qty、Power、Limit Type、Limit、Rjc、Board Type、TIM。

每次 thermal-relevant change：
```text
componentStore.dirty = true
```

若 component 已被既有 network mapping 使用：
```text
networkStore.requiresReview = true
solverStore.status = DIRTY
```

---

# 13. Right Inspector Tabs

```text
Overview / 概要
Thermal Spec / 熱規格
Geometry / 幾何
Architecture Prep / 架構準備
Source / 來源
External Mapping / 外部映射
```

---

# 14. Overview

Fields：
```text
Component Name
Category
Enabled
Qty
Power per Device
Total Power [derived]
Heat Source / Passive
Notes
```

---

# 15. Thermal Spec

Fields：
```text
Limit Type
Thermal Limit
Rjc
Rjb [future optional]
Rja [reference only]
```

Rjc / Limit 等關鍵值需能保存：
```text
value
source
reference
confidence
```

---

# 16. Geometry

Fields：
```text
Package Type
Package L / W / H
Thermal Contact L / W
Custom Contact Area
Pad / EPAD L / W
Board Thickness
Copper Coin Thickness
Custom Thickness
```

Contact Area 可用 `L × W` derived，或切換 Custom Area。

---

# 17. Board Path

Type：
```text
Thermal Via
Copper Coin
Direct Metal
PCB Only
None
Custom
```

### Thermal Via fields
```text
PCB Thickness
Effective K
Via Efficiency
Pad L / W
Optional Via Count
Optional Via ID
```

### Copper Coin fields
```text
Coin L
Coin W
Coin Thickness
Copper K
Die-attach / Solder model reference
```

注意：此頁不建立 Copper Coin Edge。

---

# 18. TIM

Fields：
```text
TIM Type
K
Thickness
Contact Area Mode
Compression [metadata]
Source
```

支援：
```text
Using Project Default
Override for this Component
```

---

# 19. Architecture Prep — Boundary With Screen 05

Screen 04 可以保存 `Architecture Template Preference`：
```text
Unassigned
Bottom Cool + Copper Coin
Bottom Cool + Thermal Via
Top Cool + Lid
Bare Die
Small Base + Heat Pipe
Direct Metal Mount
Custom
```

**本頁不能因選 template 就生成 Node / Edge。**

Screen 05 才負責：
```text
Generate Nodes
Generate Edges
Connect Base Zone
Create Shared Paths
```

---

# 20. Preferred Base Zone

可保存 hint：
```text
Unassigned
RF Left
RF Right
Digital
Power
Filter
Custom
```

只是一個 placement hint，不是 actual thermal node mapping。

---

# 21. Qty Modeling Preference

對 Qty > 1：
```text
Decide Later
Aggregate
Individual
Grouped
```

04 只保存 preference；05 才實際生成 PA1～PA4 或 group node。

---

# 22. Validation

## ERROR
- Name empty。
- Qty <= 0。
- Power < 0。
- Rjc < 0。
- Invalid thermal limit。
- Invalid geometry number/unit。

## WARNING
- Rjc missing for heat source。
- Limit missing。
- Limit Type unknown。
- TIM unresolved。
- Board Type unresolved。
- Contact Area missing。
- Architecture Template unassigned。
- Imported value lacks source。

---

# 23. Thermal Completeness

使用 checklist，不做黑箱 score：
```text
Identity
Power
Limit
Package
Rjc
Contact Geometry
Board Path
TIM
Architecture Prep
```

顯示如 `7 / 9 complete`。

---

# 24. Bulk Edit

可 bulk：
```text
Category
Limit Type
Board Type
TIM
Architecture Template Preference
Base Zone Preference
Enable / Disable
```

禁止 bulk Component Name。

---

# 25. Add / Duplicate / Delete / Disable

## Add
最小：Name、Category、Qty、Power、Limit Type、Limit。

## Duplicate
複製 thermal spec / geometry；不複製 future FloTHERM mapping、graph mapping、solver result。

## Delete
若已被 network 引用：刪 component 後將 mapping 標 orphaned，`network review required`，不在 04 自動重寫 topology。

## Disable
資料保留；既有 mapping 需 review，solver DIRTY。

---

# 26. Save to Component Library

保存：
- Name / Category。
- Default Power。
- Thermal spec。
- Package / Geometry。
- Board path。
- TIM defaults。

不保存：
- Project-specific Base Zone。
- FloTHERM mapping。
- Graph node IDs。
- Solver results。
- Scenario temperatures。

---

# 27. Provenance

顯示：
```text
Imported From
Original Project / File
Import Date
Last Modified
Modified By
Per-field Data Source
```

建議核心 type：
```ts
type SourcedValue<T> = {
  value: T | null;
  source: ThermalDataSource;
  reference?: string;
  confidence?: 'high' | 'medium' | 'low';
  updatedAt?: string;
}
```

---

# 28. 03 FloTHERM Deferred Compatibility Contract

本節是 04 必須實作或預留的未來相容契約。

## 28.1 Component External Mapping Hook

```ts
externalMappings?: {
  flotherm?: {
    objectAliases?: string[];
    preferredJunctionObject?: string;
    preferredCaseObject?: string;
    mappingStatus?: 'unmapped' | 'partial' | 'mapped';
  };
}
```

04 UI 可顯示：
```text
FloTHERM Mapping
Not Mapped
```

可允許 optional manual alias text，但**不解析、不驗證 FloTHERM 格式**。

## 28.2 Shared Result Type

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

## 28.3 Future Node Temperature Result Hook

```ts
type TemperatureResultSet = {
  analytical?: ResultValue<number>;
  flotherm?: ResultValue<number>;
  measurement?: ResultValue<number>;
};
```

## 28.4 Future Edge Multi-source Rth Hook

```ts
type EdgeRthSet = {
  analytical?: ResultValue<number>;
  flotherm?: ResultValue<number>;
  measurement?: ResultValue<number>;
  manual?: ResultValue<number>;
};

type ActiveRthSource =
  | 'analytical'
  | 'flotherm'
  | 'measurement'
  | 'manual';
```

## 28.5 Never Overwrite Analytical

未來 03 匯入不能做：
```text
edge.rth = FloTHERM value
```

必須共存：
```text
edge.rth.analytical
edge.rth.flotherm
edge.rth.measurement
edge.activeRthSource
```

## 28.6 Do Not Guess FloTHERM Schema

現在不得建立：
```text
flothermTemperatureColumn
flothermHeatFlowColumn
```
這種具體 parser assumption。

只建立 external hooks 與 canonical multi-source containers。

---

# 29. Recommended Component Model

```ts
type ComponentRecord = {
  id: string;
  name: string;
  category: 'RF' | 'Digital' | 'Power' | 'Filter' | 'Other';
  enabled: boolean;
  qty: number;
  powerW: SourcedValue<number>;

  thermalSpec: {
    limitType: 'Tj' | 'Tc' | 'Ts' | 'Custom' | 'Unknown';
    limitC: SourcedValue<number> | null;
    rjcCPerW: SourcedValue<number> | null;
    packageType?: string;
    geometry?: Record<string, number | string | boolean | null>;
    boardPath?: {
      type: 'Thermal Via' | 'Copper Coin' | 'Direct Metal' | 'PCB Only' | 'None' | 'Custom';
      parameters?: Record<string, number | string | boolean>;
    };
    tim?: {
      type: string;
      inheritance: 'project' | 'component';
      kWmK?: SourcedValue<number>;
      thicknessMm?: SourcedValue<number>;
    };
  };

  architecturePrep: {
    templatePreference:
      | 'UNASSIGNED'
      | 'BOTTOM_COOL_COIN'
      | 'BOTTOM_COOL_VIA'
      | 'TOP_COOL_LID'
      | 'BARE_DIE'
      | 'SMALL_BASE_HEAT_PIPE'
      | 'DIRECT_METAL'
      | 'CUSTOM';
    preferredBaseZone?: string;
    qtyModelPreference: 'DECIDE_LATER' | 'AGGREGATE' | 'INDIVIDUAL' | 'GROUPED';
  };

  provenance?: Record<string, unknown>;
  externalMappings?: {
    flotherm?: {
      objectAliases?: string[];
      preferredJunctionObject?: string;
      preferredCaseObject?: string;
      mappingStatus?: 'unmapped' | 'partial' | 'mapped';
    };
  };
  metadata?: Record<string, unknown>;
};
```

---

# 30. Legacy Compatibility

現有 legacy fields：
```text
Component
Qty
Power(W)
Height(mm)
Pad_L
Pad_W
Thick(mm)
Board_Type
Limit(C)
R_jc
TIM_Type
```

不要要求 DB 立即 migration。

建立：
```text
legacyComponentToCanonical()
canonicalComponentToLegacy()
```

並保留 unknown legacy fields。

Legacy `Height(mm) / Thick(mm) / Pad_L / Pad_W` 可能帶既有 Volume Tool 特定語意，04 不可默默重新解讀；需要時標 `Needs Review`。

---

# 31. Store Contracts

04 主要：
```text
componentStore
projectStore [read]
networkStore [read + review flag]
solverStore [invalidate]
```

03 deferred 只需要 external mapping metadata；**不要現在建立 flothermImportStore**。

---

# 32. Solver / Network Invalidation Matrix

| Change | Network Review | Solver Dirty |
|---|---:|---:|
| Component Name | if mapped | if mapped |
| Category | Yes | Yes |
| Qty | Yes | Yes |
| Power | maybe topology unchanged | Yes |
| Limit | No | Yes for risk results |
| Rjc | No topology change | Yes |
| TIM Type | Yes | Yes |
| Board Path | Yes | Yes |
| Geometry | Yes | Yes |
| Architecture Preference | Yes | Yes |
| Provenance only | No | No |
| FloTHERM alias only | No | No |

---

# 33. External Mapping Inspector

因 03 deferred：
```text
External Mapping / 外部映射

FloTHERM
Status: Not Mapped
Object aliases: [optional text]

Screen 03 is deferred.
Parser integration will be added after the core analytical workflow is complete.
```

此區不應有 Upload FloTHERM / Detect Columns 等功能。

---

# 34. Empty / Loading / Error / Read-only

## Empty
`No components in this project.`
CTA：Import Components / Add Component。

## Loading
Table + KPI skeleton；不可顯示上一個 project data。

## Error
`Unable to load component data.` Retry / Return to Project Info。

## Read-only
可 View / Export / Duplicate Project；不可 Edit / Delete / Save current project。

---

# 35. Bottom Action Bar

```text
Back
Save Changes
Validate All
Save & Continue
```

有 blocking Error → Save & Continue disabled。

Warnings 可繼續，但 confirm：
`4 components still have thermal warnings. Continue anyway?`

跳 Screen 05。

---

# 36. Suggested Frontend Modules

```text
src/
  screens/04-component-manager/
    ComponentManagerView.tsx
    ComponentTable.tsx
    ComponentToolbar.tsx
    ComponentInspector.tsx
    ThermalSpecPanel.tsx
    GeometryPanel.tsx
    ArchitecturePrepPanel.tsx
    ProvenancePanel.tsx
    ExternalMappingPanel.tsx
    ComponentReadinessPanel.tsx

  models/
    component.ts
    sourcedValue.ts

  adapters/
    legacyComponentAdapter.ts

  thermal/types/
    resultValue.ts
    thermalNode.ts
    thermalEdge.ts
    thermalDataSource.ts
```

---

# 37. Acceptance Criteria

- **AC-04-01** Imported components appear in All/Category tabs。
- **AC-04-02** Search/filter/status filter work。
- **AC-04-03** Inline editing works。
- **AC-04-04** Inspector edits Thermal Spec / Geometry / Architecture Prep。
- **AC-04-05** Limit Type supports Tj/Tc/Ts/Custom/Unknown。
- **AC-04-06** Unknown Rjc remains null/N/A, never coerced to 0。
- **AC-04-07** Project Default vs Component Override is visible。
- **AC-04-08** Thermal completeness/readiness updates correctly。
- **AC-04-09** Bulk Edit works。
- **AC-04-10** Add/Duplicate/Disable/Delete work。
- **AC-04-11** Library save excludes project-specific Graph/FloTHERM/Solver data。
- **AC-04-12** Template Preference does not create Nodes/Edges。
- **AC-04-13** Base Zone Preference does not create Base Node。
- **AC-04-14** Qty modeling only stores preference。
- **AC-04-15** Thermal changes invalidate downstream results correctly。
- **AC-04-16** Provenance is traceable。
- **AC-04-17** Legacy adapter reads current tool data correctly。
- **AC-04-18** Unknown legacy fields are preserved。
- **AC-04-19** External FloTHERM mapping hooks exist。
- **AC-04-20** No FloTHERM export schema is guessed/hard-coded。
- **AC-04-21** Shared Node/Edge types reserve analytical/flotherm/measurement result slots。
- **AC-04-22** UI is English-primary with zh-TW tooltip/bilingual support。
- **AC-04-23** Empty/Loading/Error/Read-only/Dirty states exist。
- **AC-04-24** Save & Continue routes to Screen 05。

---

# 38. Developer Test Cases

## A — Ready PA
Final PA / Qty4 / 52.13W / Tj180 / Rjc0.35 / Copper Coin / Grease → `READY`。

## B — Missing Rjc
→ `WARNING`, 可保存並進 05。

## C — Negative Rjc
→ `ERROR`。

## D — DDR Case Limit
`Limit Type = Tc`，不可強迫轉 Tj。

## E — Qty4 Individual
04 只保存 `INDIVIDUAL`，不建立 PA1～PA4。

## F — Existing Network
Power 52→60W → solver DIRTY，network review 依 mapping context。

## G — Add FloTHERM Alias
輸入 `RF_Board/PA1/Package` → 只保存 alias，不解析 temperature。

## H — Unknown Legacy Field
Save 後仍存在。

---

# 39. Codex Implementation Order

1. Read 00。
2. Read 04。
3. 明確認知 03 deferred contract。
4. Inspect Screen 02 canonical component output。
5. Implement `SourcedValue` / `ResultValue`。
6. Implement future-compatible Node/Edge types。
7. Implement legacy adapter。
8. Implement Component Manager UI。
9. Implement Inspector。
10. Implement validation/readiness。
11. Implement library actions。
12. Implement external mapping placeholder/hook。
13. Implement dirty/network-review/solver invalidation。
14. Run acceptance checklist。

---

# 40. Codex Must Not

不要：
- 因跳過 03 就刪掉 FloTHERM integration hooks。
- 猜 FloTHERM CSV schema。
- hard-code FloTHERM column headers。
- 在 04 建 Node / Edge。
- 在 04 run thermal solver。
- 用 Total Power 當 Edge Q。
- 用 0 代表 unknown Rjc。
- 把 Tj 當所有元件唯一 Limit Type。
- 依 Category hard-code topology。
- 覆蓋 unknown DB fields。
- 用 FloTHERM result 覆蓋 Analytical value。
- 把 Component Library 存入 project-specific graph/mapping/result。

---

# 41. Definition of Done

```text
Imported components are clean and editable
+
Thermal specs are ready for Network Builder
+
Per-field provenance is traceable
+
Architecture preferences exist but no graph is created
+
Legacy compatibility is preserved
+
Future FloTHERM hooks are reserved
+
No unverified FloTHERM assumptions exist
+
Downstream solver/network invalidation is correct
+
User can proceed to Screen 05
```

---

# 42. Output Contract to Screen 05

Screen 05 receives：
```text
Component identity
Category
Qty
Power
Limit Type / Limit
Rjc
Package
Geometry
Board Path
TIM
Architecture Template Preference
Base Zone Preference
Qty Modeling Preference
Provenance
External Mapping Hooks
```

Screen 05 才建立：
```text
Thermal Nodes
Thermal Edges
Series / Parallel / Branch / Merge
Actual Base-zone nodes
Shared thermal paths
```

---

# 43. Final Principle

**04_Component_Manager 的工作是把「元件資料」整理成可靠的熱工程規格，供 Screen 05 建立 Thermal Network。03 雖然延後，但 external simulation mapping 與 multi-source result hooks 必須現在就保留，確保回補 FloTHERM 時不需要重構 04～10。**
