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

> **現況（2026-10）**：浮動面板分左右兩半（約 1120 px，標題列「收合圖」可收回單欄 560 px）。
>
> - 左半是表單，分頁為 **概要／散熱路徑／建模偏好／來源**。「散熱路徑」合併了原本的「熱規格」與「幾何」：
>   最上面以圖示選主要散熱路徑，下面依熱流順序一層一張卡片 —— 熱源與限溫 → 封裝本體 → 散熱面 →
>   焊料＋銅塊（銅塊焊接）／電路板與導熱孔（板級導熱孔）→ TIM → 與散熱器的接合（圖示選接合方式）→ 散熱器底座。
>   每張卡片右上角寫這一層的熱阻；所有欄位與 §15–§21 相同、DOM id 不變（待處理清單的連結照常可用）。
> - 右半是「散熱路徑圖」：剖面（預設）／立體（爆炸圖，可旋轉）兩種，一層一個顏色、與左邊卡片同色。
>   點左邊欄位 → 圖上亮起那一層並標出該欄位量的尺寸；點圖上的層或熱阻鏈 → 跳到設定它的卡片。
> - 圖下方「熱阻鏈（單顆）」：每一段熱阻就是 05 對同一顆元件建出來的那條邊（`buildComponentSubgraph`＋
>   `buildMountChain`，不另寫公式）；另依限溫推回「底座表面最高約 X °C」，是估算。底座擴散與鰭片仍由 05／07 求解。

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

AI-Thermal 鎖定的限溫對象／散熱路徑／TIM 不改（`bulkPatchFor(values, isAiLocked)`），完成訊息寫出有幾筆沒改。

---

# 25. Add / Duplicate / Delete / Disable

## Add
最小：Name、Category、Qty、Power、Limit Type、Limit。

## Duplicate
複製 thermal spec / geometry；不複製 future FloTHERM mapping、graph mapping、solver result，也不複製與 AI-Thermal 的連結
（`provenance.ai_link`：複本是新的一顆，不能讓兩顆對到 AI-Thermal 同一筆）。

## Delete
刪除＝**05 與 06 跟著刪**（使用者要求，2026-10；取代原本「標 orphaned、不在 04 重寫 topology」）：`src/data/componentDeletion.ts`。
- 05：這個元件擁有的所有節點（範本產生與手畫的）、熱阻、port 連線、版面位置、FloTHERM 對應、架構綁定一起移除
  （`thermal/graph/componentPruning.ts`）；指向被刪節點的連線一併移除。
- 06：每個情境裡建在這些節點上的邊界端口指派，以及只被它們使用的邊界設定檔，一併移除並存檔。
- 原因：原本「依偏好產生」只重建現有元件，刪掉的元件子圖一直留在 05；計算投影找不到元件就跳過，節點上存的功耗**照樣算進 07**。
- 舊專案：只要元件清單與熱路徑屬於同一個專案而且不一致（熱路徑裡有清單沒有的元件），打開時自動清掉並提示
  （`startComponentDeletionSync`，AppShell 啟動）；元件清單是空的時候不動（可能是還沒載入）。05「依偏好產生」也會先清。
- 測試：`src/data/componentDeletion.test.ts`。

## Reorder
每一列最前面的 ↑／↓ 把元件上移／下移一列（`moveComponent`）。篩選時是跟「畫面上看得到的上一列／下一列」交換位置；
順序存在元件清單裡（其他頁照這個順序列出），不影響計算、不讓結果失效。

## Disable
資料保留；既有 mapping 需 review，solver DIRTY。

---

# 25b. AI-Thermal 帶入的欄位：鎖定＋✂、「從 AI-Thermal 更新」

使用者決定（2026-10）。連結本身（`provenance.ai_link`、哪些欄位、怎麼建）見 02 規格 §6c；邏輯在 `src/domain/aiThermalLink.ts`。

**鎖定（UX 慣例 2：鎖定＋✂ 解鎖逃生口）**
- AI-Thermal 有給、沒被解開的欄位（`isAiLocked`）是**參照值**，不是輸入框：
  - 表格（`AiCellRef`）：白底黑字＋小「AI」標籤；tooltip 寫取自 AI-Thermal（帶入日期）與兩個改法。表格裡不放 ✂（一列維持一行）。
    數量、單顆功耗、限溫（`Tj 225`）、Rjc（本體型顯示「本體」）、散熱路徑、TIM。
  - 檢視面板（`AiOwned`／`AiLockedBox`）：同一格放白底文字＋藍色左邊線＋「AI-Thermal」＋ ✂。概要：數量、單顆功耗；散熱路徑分頁：
    主散熱路徑（四張卡停用、下面一行「取自 AI-Thermal 的主散熱路徑」＋ ✂）、熱源基準（跟著 Rjc 一起鎖）、限制類型、溫度上限、Rjc、
    封裝大小（長×寬×高一格）、E-PAD（長×寬一格）、板厚、導熱孔等效 k、TIM（含 BLT；鎖定時不顯示 BLT 編輯）。
    鎖定框保留原本欄位的 id（`ins-limit`、`geo-package_L_mm`…），待處理清單的連結照樣跳得到。
- ✂（`unlockAiField`）：這一欄改由本工具維護 → 變回原本的輸入框，底下一行「已解開・AI-Thermal 是 X ↺ 改回 AI-Thermal」
  （值相同時寫「已解開，目前與 AI-Thermal 相同 ↺ 鎖回」，`relockAiField` 把 AI-Thermal 的值寫回並重新鎖定）。
  - 表格裡解開的欄位在格子右上角標一個小「✂AI」（`AiCellUnlocked`，藍色；值與 AI-Thermal 不同時琥珀色）：tooltip 寫 AI-Thermal 的值，
    點一下改回並鎖定。⚠ 沒有這個標記時，解開的欄位與「AI-Thermal 沒給」的欄位在表格裡看起來一模一樣（使用者回報過：
    以為是工具鎖不上）。解開狀態在重新匯入同一個專案時保留（02 §6c），所以這個標記是表格上唯一回得去的提示。
  - 散熱路徑 AI-Thermal 沒指定（主散熱路徑 None 或未選 → 連結裡沒有 `heat_path`，由本工具推定或確認）：
    表格下拉的 tooltip 與檢視面板主散熱路徑卡片下方寫「AI-Thermal 沒有指定主散熱路徑…到 AI-Thermal 選，再按『從 AI-Thermal 更新』」
    （`aiNotStated`／`AI_HEAT_PATH_UNSTATED`）。之後 AI-Thermal 選了、值與這裡相同 → 更新時一起鎖定（`plan.relock`），數值不變。
- 封裝型式、接合方式、擴散範圍、量測位置、建模偏好、備註是本工具的，不鎖。
- 防呆：04 所有寫入都經過 `ComponentManagerView` 的 `patchComponent`，以**值**比對（`aiLockedChanges`）擋下改到鎖定欄位的修改並提示按 ✂。

**從 AI-Thermal 更新**（有連到 AI-Thermal 的元件時才出現）
- 工具列按鈕「從 AI-Thermal 更新」；有更新時按鈕與頁首都變琥珀色（「AI-Thermal 有更新（N 顆）」）。
- 背景檢查（`useAiThermalUpdate`）：進 04 時若 SharePoint **不必跳登入視窗**就讀得到，讀一次資料庫比對；讀不到就不做事
  （登入視窗只在按鈕之後才會跳）。對話框裡可選「從 SharePoint 讀取」或本機的 `thermal_db.json`。**只讀，不寫回 AI-Thermal。**
- AI-Thermal 目前的元件用 02 同一條路建（`freshAiThermalComponents`：全部清單、含 5G-RRU 已排除的），比對（`planAiUpdate`）：
  先用 AI-Thermal 元件 id（`_cid`，AI-Thermal 改名也對得到），再用上次同步時的名稱。
- 對話框（`AiThermalUpdateDialog`）逐欄列「本工具 → AI-Thermal」：
  - 預設**勾**：AI-Thermal 擁有、沒被解開的欄位，以及名稱。
  - 預設**不勾**並寫原因：解開後改過的（「本工具已解開並改過」）、本工具改過的名稱、AI-Thermal 原本沒有而本工具填過的。
  - **沒勾的欄位保留本工具的值，並改為不鎖定**（使用者選了自己的值）。
  - AI-Thermal 新增的元件：預設不勾（勾選即加入）；5G-RRU 已排除的收在「展開」裡，加入後為停用。
  - AI-Thermal 已沒有的元件：**保留**，解除連結改由本工具維護；可勾「同時停用」。
  - 與本工具既有元件同名、沒有連結的不列入（寫一行說明）。
- **第一次連結**（舊版匯入、還沒有連結的元件，`isAiFirstLink`：來源 AI-Thermal＋專案 id）：頁首藍色「N 顆待連結 AI-Thermal」
  （不必讀資料庫就算得出來）、工具列照樣有按鈕。比對一樣先用匯入時的元件 id、再用名稱。舊版沒有記下 AI-Thermal 當時的值 →
  數值不同的欄位**分不出是哪一邊改的，預設不勾**（「第一次連結：分不出是哪一邊改的」）；本工具空白、AI-Thermal 有值的預設勾
  （補空格不會蓋掉任何東西）；完全相同的元件套用後直接連結並鎖定。對話框上方一段說明，另有「全部用 AI-Thermal／全部保留本工具」。
- **補鎖定**（`plan.relock`）：已連結、數值都相同，但 AI-Thermal 現在多給了連結裡沒有的欄位（例：匯入時 TIM 對不到、之後在 04 手動選了
  AI-Thermal 指的同一個材料）→ 對話框列一行「另有 N 顆…套用後一起鎖定，數值不變」，套用時改寫成 AI-Thermal 的形式並鎖定，不讓結果失效。
  TIM 比較以實際的壓合厚度為準（`sameFor`：寫明的 BLT 等於材料預設＝沿用材料），不會因為一邊寫明 0.5、一邊沿用材料的 0.5 就判成不同。
- 套用（`applyAiPlan`）：寫進元件、連結換成 AI-Thermal 現在的值；依改到的欄位走 §32 的失效矩陣（新增元件 → 熱網路需要更新）。
  頁首提醒只算「有預設勾選的變更」與「已刪除」的元件，所以都看過、決定保留本工具的值之後就不再提醒。
- 測試：`src/importers/component/aiThermalSync.test.ts`。

---

# 25c. 常溫功耗（`power_rt_W`）

AI-Thermal 的 `Power_RT(W)`（Pd@25°C）。檢視面板「概要」在單顆功耗下面一格「常溫功耗」（`ins-power-rt`）：
連動 AI-Thermal 時與單顆功耗一樣鎖定＋✂（`AiOwned` field `power_rt`）；沒連動或解開後是一般數字欄，placeholder「同單顆功耗」。

- **只有 01 的情境「功耗」選「常溫 Pd」時才用到**（01 §51）；高溫情境（預設）一律用單顆功耗。
- 空白＝沒有這個 key（不寫 0）：常溫情境暫用單顆功耗，07 列出是哪些元件。
- 改它屬於功耗變更（`component_power_changed`，求解失效），與單顆功耗同一組。
- 「從 AI-Thermal 更新」比對、勾選、鎖定的規則與單顆功耗相同；AI-Thermal 清掉這個值時，本工具的值不會被清掉（與其他欄位一致）。
- 表格不另開一欄（一列維持一行）；02「從既有專案複製元件」照樣帶過去（`Power_RT(W)` 欄）。

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
