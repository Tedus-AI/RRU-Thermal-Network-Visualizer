# 01 — Project Info
## 5G FR1 Thermal Network Visualizer
### Screen Functional Specification for Codex

**Document ID:** `01_Project_Info`  
**Parent Architecture:** `00_Product_Vision_and_Architecture.md`  
**Screen Type:** Project Setup / Project Context  
**Priority:** P0 Foundation  
**Primary Users:** Thermal Engineer / System Engineer / Project Owner  
**Status:** Development Specification  

---

# 1. Screen Purpose

`01_Project_Info` 是整個 5G FR1 Thermal Network Visualizer 的專案入口頁。

此頁的任務不是進行熱計算，而是建立並維護後續所有功能共同使用的：

- Project identity
- Product context
- Thermal design context
- Project stage
- Ownership
- Default scenario
- Cooling architecture summary
- Project health / readiness

後續所有 Screen 必須讀取這裡的 Project Context。

---

# 2. User Goal

使用者在此頁應能快速完成：

1. 建立新專案。
2. 輸入專案基本資訊。
3. 指定產品類型與 FR1 thermal context。
4. 指定主要散熱方式。
5. 建立第一個 Default Scenario。
6. 確認目前專案是否具備進入下一階段所需的必要資料。
7. 儲存 / Duplicate / Archive 專案。

---

# 3. Entry Point

左側導覽：

```text
專案與匯入
└── 01 專案資訊
```

新專案建立後預設進入此頁。

若從既有 Project 開啟，也先進入此頁顯示 Project Overview。

---

# 4. App Shell

此頁必須沿用 00 Master UI：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Top Header                                                                   │
├──────────────┬──────────────────────────────────────────────┬────────────────┤
│ Left Sidebar │ Main Workspace                               │ Right Panel    │
│              │                                              │                │
├──────────────┴──────────────────────────────────────────────┴────────────────┤
│ Bottom Status Bar                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 4.1 Top Header

固定顯示：

- App Logo
- `5G Thermal Network Explorer`
- Project selector
- Active Scenario selector
- Save
- Import
- Export
- Settings

此頁 Project selector 若為新專案：

```text
New Project
```

---

# 5. Page Layout

`01_Project_Info` 建議分為三個主要區域：

```text
Main Left / Center:
A. Project Identity
B. Product & Thermal Context
C. Default Scenario
D. Notes

Right Panel:
E. Project Overview
F. Project Health
G. Next Step

Bottom:
H. Action Bar
```

比例建議：

```text
Main form:      65–70%
Right panel:    30–35%
```

---

# 6. Section A — Project Identity

## 6.1 Project Name

**Label:** `Project Name`  
**Type:** text  
**Required:** Yes  
**Example:** `CBNG_FR1_RRU_EVT2`

Rules:

- 1–80 characters
- Trim leading/trailing spaces
- Display name 可包含空白、中英文、`-`、`_`

---

## 6.2 Project ID

**Label:** `Project ID`  
**Type:** text  
**Required:** Yes  
**Behavior:** Auto-generate from Project Name, but editable before first save.

Example:

```text
CBNG_FR1_RRU_EVT2
```

Rules:

- Unique
- Database key safe
- 建議 regex：

```text
^[A-Za-z0-9_-]{3,64}$
```

第一次儲存後：

- Project ID default read-only
- 若要修改需使用 Rename / Clone workflow
- 不允許一般 form edit 直接改 primary key

---

## 6.3 Customer

**Label:** `Customer / Program`  
**Type:** text  
**Required:** No

Example:

```text
CBNG / Verizon
```

---

## 6.4 Project Owner

**Label:** `Project Owner`  
**Type:** text or identity selector  
**Required:** No

若目前 app 有 user identity：

- 自動帶入目前使用者
- 允許修改

---

## 6.5 Project Stage

Dropdown：

```text
Concept
Architecture
EVT
DVT
PVT
MP
Field Validation
```

Default：

```text
Concept
```

---

## 6.6 Description

Textarea：

```text
Project Description
```

建議高度：

`80–120 px`

---

# 7. Section B — Product & Thermal Context

此區是 01 與一般 Project Management Tool 最大不同之處。

---

## 7.1 Product Type

Dropdown / segmented control：

```text
RRU
AAU
Small Cell
Outdoor Radio
Indoor Radio
Custom
```

Default：

```text
RRU
```

---

## 7.2 Frequency Range

固定：

```text
FR1
```

V1 允許顯示但預設鎖定。

未來可擴：

```text
FR1
FR2
Custom
```

但本工具 V1 產品定位是 FR1。

---

## 7.3 Cooling Architecture

Dropdown：

```text
Natural Convection
Forced Convection
Heat Pipe Assisted
Vapor Chamber Assisted
Liquid Cooling
Hybrid
Custom
```

Default：

```text
Natural Convection
```

Tooltip：

> 此欄位是專案最高層散熱策略摘要，不直接建立 Thermal Network。實際 Node / Edge 於 Thermal Path Builder 定義。

---

## 7.4 Enclosure Type

Dropdown：

```text
Outdoor Sealed
Outdoor Vented
Indoor
IP-rated Custom
Custom
```

Default：

```text
Outdoor Sealed
```

---

## 7.5 Main Heat Rejection

Multi-select：

```text
Rear Heat Sink
Front Heat Sink
Side Heat Sink
Housing Surface
Heat Pipe
Internal Fan
External Fan
Liquid Cold Plate
Other
```

Default：

```text
Rear Heat Sink
```

---

## 7.6 Base Architecture

Dropdown：

```text
Single Main Base
Multi-zone Main Base
Small Base + Main Base
Heat Pipe + Main Base
Direct Housing
Custom
```

Default：

```text
Single Main Base
```

此欄位只是 architecture summary。

真正的 topology 在 Screen 05 建立。

---

# 8. Section C — Default Scenario

新專案建立時，自動建立：

```text
SCN_001
```

Name：

```text
Baseline
```

---

## 8.1 Ambient Temperature

Label：

```text
Ambient Temperature
```

Unit：

```text
°C
```

Default：

```text
55
```

可設定範圍：

```text
-40 ~ 85°C
```

---

## 8.2 Wind Speed

Unit：

```text
m/s
```

Default：

```text
0
```

Range：

```text
0 ~ 30
```

---

## 8.3 Solar Load

Unit：

```text
W/m²
```

Default：

```text
0
```

Range：

```text
0 ~ 1500
```

---

## 8.4 Power Scale

Default：

```text
1.00
```

Range：

```text
0 ~ 2.0
```

---

## 8.5 Scenario Name

Default：

```text
Baseline
```

使用者可立即改：

```text
55C_0mps
```

---

# 9. Section D — Notes

Textarea：

```text
Project Notes / Thermal Assumptions
```

用途：

- Customer thermal requirement
- GR-487 assumption
- Solar condition
- Known hardware restrictions
- Special test conditions

V1 使用純文字。

Future：

- Markdown
- Attachment links

---

# 10. Right Panel E — Project Overview

Card title：

```text
Project Overview
```

KPI：

```text
Components           0
Heat Sources         0
Total Power          0.0 W
Thermal Nodes        0
Thermal Edges        0
Scenarios            1
FloTHERM Mapping     Not Imported
Last Solve           Not Solved
```

---

# 11. Right Panel F — Project Health

Card title：

```text
Project Health
```

顯示 checklist。

---

## 11.1 Project Metadata

若：

- Project Name valid
- Project ID valid

顯示：

```text
✓ Project metadata complete
```

否則：

```text
! Missing project identity
```

---

## 11.2 Components

若尚未匯入：

```text
○ Components not imported
```

點擊：

跳至 Screen 02。

---

## 11.3 Thermal Architecture

若尚未建立：

```text
○ Thermal network not created
```

未來點擊：

跳 Screen 05。

---

## 11.4 Boundary Conditions

如果至少有 Baseline scenario：

```text
✓ Baseline scenario created
```

否則：

```text
! Missing boundary condition
```

---

## 11.5 FloTHERM

初期：

```text
○ FloTHERM data not imported
```

這不是 Error。

只顯示 Optional。

---

## 11.6 Solve

初期：

```text
○ Network not solved
```

---

# 12. Right Panel G — Next Step

Card：

```text
Recommended Next Step
```

新專案：

```text
Import Hardware Components
```

Button：

```text
Continue to Import Components →
```

跳：

`Screen 02`

若 components 已存在但 network 未建：

```text
Assign Thermal Architecture
```

跳：

`Screen 05`

若 network 已建但 boundary invalid：

跳：

`Screen 06`

若 ready to solve：

跳：

`Screen 07`

---

# 13. Bottom Action Bar

固定於 Main Workspace bottom。

按鈕：

```text
Cancel
Duplicate Project
Archive
Save Project
Save & Continue
```

---

# 14. Save Project Behavior

按 `Save Project`：

1. Validate required fields。
2. 建立 / update Project。
3. 若為新 Project，自動建立 Baseline Scenario。
4. 保留既有未知 project sibling fields。
5. Show toast：

```text
Project saved successfully
```

6. 更新 top header project selector。

---

# 15. Save & Continue

新 Project：

```text
Save
→
Screen 02 Import Components
```

既有 Project：

依 Project Health 決定 Recommended Next Step。

---

# 16. Duplicate Project

點擊後 Modal：

```text
Duplicate Project

New Project Name
New Project ID

Copy:
[x] Components
[x] Thermal Network
[x] Scenarios
[ ] FloTHERM Mapping
[ ] Solver Results
```

Default：

- Copy Components = Yes
- Copy Network = Yes
- Copy Scenarios = Yes
- Copy FloTHERM mapping = No
- Copy Solver result = No

理由：

CFD / solved results 通常與 scenario / geometry version 強相關。

---

# 17. Archive

需 confirmation。

Modal：

```text
Archive Project?

Project will be hidden from default project list.
Data will not be deleted.
```

Buttons：

```text
Cancel
Archive Project
```

---

# 18. Unsaved Changes / Dirty State

任一欄位修改後：

Project Store：

```text
dirty = true
```

Top Header Save 按鈕顯示：

```text
● Unsaved
```

使用者切換 Project / route 時：

Modal：

```text
You have unsaved changes.

Stay
Discard
Save & Continue
```

---

# 19. Validation Rules

## Error

阻止 Save：

- Project Name empty
- Project ID empty
- Project ID duplicated
- Project ID invalid format
- Ambient not numeric
- Wind speed negative
- Solar load negative
- Power scale negative

---

## Warning

允許 Save：

- Customer empty
- Owner empty
- Description empty
- No components
- No FloTHERM data

---

# 20. Empty State

如果完全沒有 project：

Main：

```text
Create your first thermal network project
```

CTA：

```text
+ New Project
```

---

# 21. Loading State

Project loading：

- Form skeleton
- Right KPI skeleton
- Save disabled

不可顯示舊 project 資料。

---

# 22. Error State

Project load failed：

```text
Unable to load project.

Retry
Return to Project List
```

技術錯誤可放 expandable detail：

```text
Show technical details
```

---

# 23. Read-only State

當：

- DB locked
- Archived
- Permission read-only

UI：

- Inputs disabled
- Header badge：

```text
READ ONLY
```

仍允許：

- View
- Export
- Duplicate

不允許：

- Save
- Archive change
- Modify

---

# 24. Project Data Schema

```json
{
  "project_id": "CBNG_FR1_RRU_EVT2",
  "project_name": "CBNG FR1 RRU EVT2",
  "customer": "CBNG / Verizon",
  "owner": "Tedus",
  "description": "FR1 outdoor RRU thermal network development",
  "product_type": "RRU",
  "frequency_range": "FR1",
  "project_stage": "EVT",
  "cooling_architecture": "Natural Convection",
  "enclosure_type": "Outdoor Sealed",
  "main_heat_rejection": [
    "Rear Heat Sink"
  ],
  "base_architecture": "Small Base + Main Base",
  "active_scenario_id": "SCN_001",
  "status": "active",
  "meta": {
    "created_at": "2026-08-10T10:00:00+08:00",
    "updated_at": "2026-08-10T10:00:00+08:00",
    "schema_version": "1.0"
  }
}
```

---

# 25. Scenario Schema

```json
{
  "id": "SCN_001",
  "project_id": "CBNG_FR1_RRU_EVT2",
  "name": "55C_0mps",
  "ambient_C": 55,
  "wind_mps": 0,
  "solar_W_m2": 0,
  "power_scale": 1,
  "notes": "Baseline natural convection scenario",
  "is_default": true
}
```

---

# 26. Project Overview Derived Data

不要直接永久存以下 KPI，除非 cache 有 versioning。

應由各 store derive：

```text
Component Count
Heat Source Count
Total Power
Node Count
Edge Count
Scenario Count
FloTHERM Mapping Count
Last Solve Status
```

---

# 27. Store Contract

建議：

```text
projectStore
scenarioStore
componentStore
networkStore
solverStore
```

01 主要寫：

```text
projectStore
scenarioStore
```

01 只讀：

```text
componentStore
networkStore
solverStore
```

用於 Project Overview。

---

# 28. Required Frontend Components

建議：

```text
ProjectInfoView
ProjectIdentityForm
ThermalContextForm
BaselineScenarioForm
ProjectOverviewPanel
ProjectHealthPanel
RecommendedNextStep
ProjectActionBar
DuplicateProjectModal
ArchiveProjectModal
UnsavedChangesModal
```

---

# 29. Suggested Component Tree

```text
ProjectInfoView
├── PageHeader
├── ProjectIdentityForm
├── ProductThermalContextForm
├── BaselineScenarioForm
├── ProjectNotes
├── RightSidebar
│   ├── ProjectOverviewPanel
│   ├── ProjectHealthPanel
│   └── RecommendedNextStep
└── ProjectActionBar
```

---

# 30. Responsive Behavior

主要目標仍是 Desktop engineering app。

## >= 1440 px

三欄完整。

## 1024–1439 px

右 panel 縮至 300px。

## < 1024 px

右 panel 移至 main 下方。

不需優先針對 mobile 做完整 network editing。

---

# 31. Accessibility

要求：

- Input 都有 label
- Error 不只靠顏色
- Button 有 text / aria-label
- Tab order 合理
- Disabled state 清楚

---

# 32. Tooltips

至少：

## Cooling Architecture

> Project-level cooling strategy. Actual thermal paths are defined later in Thermal Path Builder.

## Base Architecture

> High-level mechanical base structure. This does not create graph topology by itself.

## Power Scale

> Multiplier applied to component power for this scenario.

---

# 33. Project Health Logic

Pseudo：

```javascript
health = {
  projectIdentity:
    isValid(projectName) &&
    isValid(projectId),

  components:
    componentCount > 0,

  thermalNetwork:
    nodeCount > 0 &&
    edgeCount > 0,

  baselineScenario:
    scenarioCount > 0,

  flotherm:
    flothermMappingCount > 0,

  solved:
    lastSolveStatus === "SOLVED"
}
```

---

# 34. Recommended Next Step Logic

```javascript
if (!health.projectIdentity)
  return "Complete Project Information";

if (!health.components)
  return "Import Hardware Components";

if (!health.thermalNetwork)
  return "Assign Thermal Architecture";

if (!health.baselineScenario)
  return "Define Boundary Conditions";

if (!health.solved)
  return "Solve Thermal Network";

return "Review Results";
```

FloTHERM 不應阻止 basic workflow。

---

# 35. Database Safety

若沿用現有 shared database：

## 必須

- `updateDoc` / merge semantics
- 保留未知 project sibling fields
- 不整顆 replace project document
- 不覆蓋其他 tool 的 thermal_specs / validation / tcPlacement 等資料

## 建議

01 只修改：

```text
project_name
meta
project_context
active_scenario_id
```

若現有 schema 不方便，新增：

```text
project_context
```

比大量新增 top-level project keys 更安全。

---

# 36. Recommended Storage Shape

建議 project：

```json
{
  "project_name": "CBNG FR1 RRU EVT2",

  "project_context": {
    "customer": "CBNG / Verizon",
    "owner": "Tedus",
    "description": "",
    "product_type": "RRU",
    "frequency_range": "FR1",
    "project_stage": "EVT",
    "cooling_architecture": "Natural Convection",
    "enclosure_type": "Outdoor Sealed",
    "main_heat_rejection": ["Rear Heat Sink"],
    "base_architecture": "Small Base + Main Base"
  },

  "active_scenario_id": "SCN_001"
}
```

這樣減少與既有工具欄位衝突。

---

# 37. Scenario Storage

若 thermal network 使用獨立 collection：

```text
thermal_networks/<project_id>/scenarios
```

或 nested：

```text
thermal_networks/<project_id>.scenarios
```

由實際 DB adapter 能力決定。

但 Project Info UI 不應直接依賴 storage backend。

UI 只呼叫：

```text
scenarioStore.createDefaultScenario()
scenarioStore.updateScenario()
```

---

# 38. Mock KPI Example

當已有部分資料：

```text
Components           18
Heat Sources          9
Total Power        412.3 W
Thermal Nodes         0
Thermal Edges         0
Scenarios             1
FloTHERM Mapping      Not Imported
Last Solve            Not Solved
```

Project Health：

```text
✓ Project metadata complete
✓ Hardware components imported
○ Thermal network not created
✓ Baseline scenario created
○ FloTHERM data not imported
○ Network not solved
```

Recommended：

```text
Assign Thermal Architecture
```

---

# 39. UI Visual Design Requirements

此頁不應做成一般企業 ERP 表單。

應維持工程工具風格：

- Dark/navy left sidebar
- Light engineering workspace
- Blue/cyan primary accent
- Clear section headers
- Technical KPI cards
- Minimal decoration
- High data readability
- No glassmorphism
- No excessive gradients
- No nested card explosion

---

# 40. Main Screen Visual Hierarchy

優先順序：

1. Project identity
2. Product / cooling architecture
3. Default scenario
4. Project readiness
5. Navigation to next engineering step

---

# 41. UI Image Requirements

對應 mockup：

```text
01_Project_Info.png
```

UI 圖應包含：

- 00 Master App Shell
- 左側 01 active
- Project Identity form
- Product & Thermal Context
- Baseline Scenario
- Right Project Overview
- Right Project Health
- Recommended Next Step
- Bottom Save & Continue

---

# 42. Acceptance Criteria

## AC-01

新 Project 可輸入 Project Name / ID 並成功 save。

## AC-02

Project ID duplicate 時不可 save。

## AC-03

第一次 Save 自動建立 Baseline Scenario。

## AC-04

修改任何欄位後顯示 dirty state。

## AC-05

切換頁面時 dirty project 出現 unsaved warning。

## AC-06

Project Overview 正確讀取其他 store derived KPI。

## AC-07

Project Health 可正確辨識 components / graph / scenario / solve status。

## AC-08

Recommended Next Step 依 readiness 自動更新。

## AC-09

Save 不得覆蓋既有 project unknown fields。

## AC-10

Archived / locked project 正確進入 read-only。

## AC-11

Save & Continue 可跳到 Screen 02。

## AC-12

FloTHERM 未匯入不能視為 blocking error。

---

# 43. Developer Test Cases

## Test A — New Empty Project

Expected：

```text
Metadata warning
Components missing
Network missing
Baseline available after save
```

---

## Test B — Duplicate Project ID

Expected：

```text
Inline error
Save disabled
```

---

## Test C — Existing Project with Components

Expected：

```text
Component KPI > 0
Recommended Next Step = Assign Thermal Architecture
```

---

## Test D — Existing Solved Project

Expected：

```text
Last Solve = Solved
Recommended Next Step = Review Results
```

---

## Test E — Dirty Form

Expected：

```text
Unsaved badge
Route guard
```

---

## Test F — Read Only

Expected：

```text
All inputs disabled
Duplicate / Export allowed
Save hidden or disabled
```

---

# 44. Codex Implementation Order for Screen 01

1. Read `00_Product_Vision_and_Architecture.md`
2. Add route `/project/:id/info`
3. Add / reuse shared projectStore
4. Add scenarioStore baseline support
5. Implement ProjectInfoView
6. Implement validation
7. Implement Project Overview derived KPIs
8. Implement Project Health
9. Implement Recommended Next Step
10. Implement dirty state / route guard
11. Implement save / duplicate / archive
12. Run acceptance criteria

---

# 45. Codex Do Not

不要：

- 在 01 建立 thermal nodes / edges
- 在 01 計算 Rth
- 在 01 執行 thermal solver
- 把 Cooling Architecture 直接 hard-code 成 graph
- 將 Project Overview KPI 存成永久真值
- 整顆 replace shared project document

---

# 46. Definition of Done

Screen 01 完成必須滿足：

```text
User can create project
+
Project context can persist
+
Baseline scenario exists
+
Project readiness is visible
+
Next development step is obvious
+
No thermal graph logic is hard-coded in this page
+
Shared DB safety is preserved
```

---

# 47. Screen 01 Output Contract

完成後提供給 Screen 02 / 04 / 05：

```text
project_id
project_name
project_context
active_scenario_id
default scenario
```

---

# 48. Next Screen

完成本頁後：

# `02_Import_Components`

`02` 會開始把現有 5G RRU Volume Evaluation Tool 的 component data 導入 Thermal Network 專案。

---

# 49. Final Screen Principle

**01_Project_Info 的功能是建立「這是一個什麼 5G FR1 thermal project」的共同上下文，而不是提前決定熱要怎麼流。**

真正的熱流 topology 必須留給：

# `05_Thermal_Path_Builder`
