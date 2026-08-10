# 02 — Import Hardware Components / 匯入硬體元件
## 5G FR1 Thermal Network Visualizer
### Screen Functional Specification for Codex

**Document ID:** `02_Import_Components`  
**Parent:** `00_Product_Vision_and_Architecture.md`  
**Previous Screen:** `01_Project_Info.md`  
**Screen Type:** Data Import / Mapping / Validation  
**Priority:** P0

---

# 1. Purpose / 目的

本頁把既有硬體元件資料安全匯入目前 Thermal Network Project，來源包含：
- Existing Project / 既有專案
- CSV
- Excel
- Paste Table / 貼上表格

本頁只建立乾淨、可追溯、已驗證的 Component Dataset。

> **本頁禁止建立 Thermal Node / Edge。**

Thermal topology 由 `05_Thermal_Path_Builder` 負責。

---

# 2. User Flow

```text
Select Source
→ Load Data
→ Preview Rows
→ Map Columns
→ Validate
→ Resolve Duplicates
→ Review Import Summary
→ Apply Import
→ Continue to Component Manager
```

---

# 3. UI Language Standard / UI 語言規則

從 Screen 02 起，後續畫面建議統一：

1. **English first**。
2. 空間足夠時中英並列，例如 `Import Source / 匯入來源`。
3. 空間不足時只顯示英文，但 hover / tooltip 顯示繁體中文。
4. 不要只依賴 browser native `title`；建立 reusable `FieldLabel` / `BilingualTooltip`。

Example:

```tsx
<FieldLabel label="Power" zh="元件單顆功耗" unit="W" />
```

重要欄位 tooltip：
- Power：元件單顆功耗（W）
- Rjc：Junction-to-Case 熱阻（°C/W）
- Limit：元件允許最高溫度
- Board Type：主要 PCB 導熱方式
- TIM：Thermal Interface Material / 熱介面材料
- Total Power：Qty × Power 的元件總功耗摘要，**不是 Thermal Edge heat flow Q**

---

# 4. Layout

```text
Top Header
├─ Project selector
├─ Active Scenario
├─ Save / Import / Export / Settings / Help

Left Sidebar
└─ 02 Import Hardware Components active

Main Workspace
├─ A. Import Source
├─ B. Source Detail
├─ C. Component Preview
├─ D. Column Mapping
├─ E. Duplicate Handling
└─ F. Search / Filter / Review

Right Panel
├─ G. Import Summary
├─ H. Validation
├─ I. Project Impact
└─ J. Recommended Next Step

Bottom Action Bar
├─ Back
├─ Cancel Import
├─ Re-validate
├─ Apply Import
└─ Apply & Continue
```

Main 70–75%，Right 25–30%。

---

# 5. Import Source / 匯入來源

四個 source cards：

## Existing Project / 既有專案
從 existing `5G-RRU-Quick-Volume-Evaluation-Tool` 或 shared DB Project 匯入。

## CSV File / CSV 檔案
支援 `.csv`。

## Excel File / Excel 檔案
支援 `.xlsx` / `.xls`；多 sheet 時顯示 Sheet selector。

## Paste Table / 貼上表格
可貼 Excel tab-separated data 或 CSV-style text。

---

# 6. Existing Project Import

欄位：
- Source Project / 來源專案
- Last Updated
- RF count
- Digital count
- Power count

Import Scope：
```text
[x] RF Components
[x] Digital Components
[x] Power Components
[ ] Hidden / Excluded Components
```

來源若帶：
- `_ref_origin_project`
- `_ref_origin_id`
- `_ref_locked`

需保留 lineage / provenance。

---

# 7. File / Paste Loading

Upload zone：
- Drop file here
- Browse File
- filename
- file type
- detected rows
- detected columns

Excel 多 sheet：
- Sheet dropdown

Paste Table：
- large textarea / spreadsheet-like paste area
- `Parse Table / 解析表格`

---

# 8. Staging Architecture — 必須

**Preview 不得直接修改 `componentStore`。**

```text
Raw Source
→ Parser
→ Column Mapping
→ Normalization
→ Staging Rows
→ Validation
→ User Review
→ Apply Import
→ componentStore
```

Cancel Import 直接清除 staging data。

建議獨立：
`componentImportStore`

---

# 9. Component Preview Table

預設欄位：

```text
Import
Status
Category
Component
Qty
Power
Total Power
Height
Pad L
Pad W
Thickness
Board Type
Limit
Rjc
TIM
Source
Duplicate Action
```

支援：
- sort
- search
- filter
- row include/exclude
- inline edit
- validation highlighting

Inline editable：
- Category
- Component
- Qty
- Power
- Limit
- Rjc
- Board Type
- TIM

修改後立即 revalidate row。

---

# 10. Canonical Legacy Fields

目前 existing tool canonical source fields：

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

Existing categories：

```text
rf      → RF
digital → Digital
pwr     → Power
```

Target categories：

```text
RF
Digital
Power
Filter
Other
```

---

# 11. Column Mapping / 欄位對應

完全符合 canonical schema 時：

`✓ All required columns mapped automatically`

若來源是：

```text
Device Name
Count
Power Dissipation
Junction Case R
```

可自動 map：

```text
Device Name       → Component
Count             → Qty
Power Dissipation → Power(W)
Junction Case R   → R_jc
```

Target dropdown：
```text
Ignore Column
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
Category
```

---

# 12. Auto-Mapping Alias Examples

```json
{
  "Component": ["component", "device", "device name", "part name", "元件", "元件名稱"],
  "Qty": ["qty", "quantity", "count", "數量"],
  "Power(W)": ["power", "power(w)", "power dissipation", "dissipation", "watt", "功耗"],
  "R_jc": ["r_jc", "rjc", "theta jc", "junction case", "junction-to-case"]
}
```

---

# 13. Required vs Optional

Required：
```text
Component
Qty
Power(W)
```

Strongly Recommended：
```text
Category
Limit(C)
R_jc
```

Optional：
```text
Height(mm)
Pad_L
Pad_W
Thick(mm)
Board_Type
TIM_Type
```

缺 Rjc / Limit / TIM 可以先匯入，但必須 Warning，交給 Screen 04 補完整。

---

# 14. Validation

Status enum：
```text
VALID
WARNING
ERROR
DUPLICATE
EXCLUDED
```

## ERROR — 該 row 不可 import
- Component empty
- Qty <= 0
- Qty not integer
- Power < 0
- Rjc < 0
- invalid numeric format
- unresolved required mapping

## WARNING — 可 import
- Category missing
- Limit missing
- Rjc missing
- TIM missing
- Board Type unknown
- Power = 0
- unknown enum mapped to Custom

**禁止 parse failure silently 變 0。**

---

# 15. Board Type Mapping

Canonical：
```text
Thermal Via
Copper Coin
None
Custom
```

Aliases：
```text
Via
Thermal Vias
Cu Coin
Copper Slug
No Board Path
```

無法辨識 → `Custom` + Warning。

---

# 16. TIM Mapping

V1：
```text
Grease
Pad
Pad2
Putty
None
Custom
```

既有 Volume Tool 中 Copper Coin die-attach Solder 可能已包在既有計算概念中。

> Screen 02 不得擅自把 legacy Solder 轉成獨立 Thermal Edge。

---

# 17. Duplicate Handling / 重複資料

Duplicate 判斷 V1：
```text
Component Name + Category
```

Global policy：
```text
Skip
Replace Existing
Merge Non-empty Fields
Import as New Variant
```

Per-row 可 override。

### Merge Non-empty
Imported non-empty → replace target field  
Imported empty → keep existing

### Replace Existing
只覆蓋 component-owned fields，保留 unknown metadata。

### New Variant
例如：
`Final PA (Imported)`

---

# 18. Search / Filter / Bulk Actions

Toolbar：
- Search
- Category
- Status
- Duplicate
- Included Only
- Reset Filters

Bulk：
- Include All Valid
- Exclude Errors
- Set Category
- Set Duplicate Strategy
- Clear Selection

---

# 19. Total Power Preview

每列：
`Total Power = Qty × Power(W)`

Summary：
```text
RF       284.5 W
Digital   71.0 W
Power     41.8 W
Filter    15.0 W
----------------
Total    412.3 W
```

> **這是 component dissipation summary，不是 Edge Q。**

---

# 20. Right Panel — Import Summary

顯示：
```text
Detected Rows       22
Included Rows       18
Valid               14
Warnings             3
Errors               1
Duplicates           4
Total Power       412.3 W
```

Category breakdown：
```text
RF          6 types / 284.5 W
Digital     4 types /  71.0 W
Power       5 types /  41.8 W
Filter      1 type  /  15.0 W
Other       2 types /   0.0 W
```

---

# 21. Right Panel — Validation

例如：
```text
✓ Required fields mapped
✓ 18 rows ready
⚠ 3 rows missing Rjc
⚠ 2 rows missing thermal limit
✕ 1 row has invalid Qty
```

點擊 issue：
- filter table
- scroll/focus first affected row

---

# 22. Project Impact Preview

```text
Current Components       5
New Components          +13
Replaced                  2
Skipped                   3
Projected Total          18
Projected Power       412.3 W
```

---

# 23. Apply Import

流程：

```text
1 Validate staging
2 Block ERROR rows
3 Apply duplicate policy
4 Normalize canonical component
5 Save provenance
6 Write componentStore
7 Update project metadata
8 Invalidate stale solver/network state when needed
9 Show success summary
```

---

# 24. Network / Solver Interaction

若 Project 已有 Thermal Network：

### 新增 component
不得自動建立 graph。

顯示：
```text
New components were imported.
They are not yet connected to the thermal network.
Assign thermal architecture before solving.
```

設定：
```text
networkStore.requiresReview = true
solverStore.status = DIRTY
```

### Replace/Merge 改變已映射 component 的：
- Power
- Rjc
- Limit
- TIM
- Board Type

則：
```text
solverStore.status = DIRTY
network review = REQUIRED
```

---

# 25. Success State

```text
Import completed successfully

18 components imported
2 existing components updated
3 rows skipped
0 errors
```

CTA：
- `Review Components →`
- `Import More`

`Apply & Continue` → Screen 04 Component Manager。

---

# 26. Empty / Loading / Error / Read-only

## Empty
`Choose an import source to begin.`

## Loading
- Loading source project...
- Reading file...
- Analyzing columns...

切換 source 時不可殘留上一份 preview。

## Error
- Unable to read file
- Unsupported format
- Unable to load source project

## Read-only destination
Preview allowed，Apply disabled。

顯示：
`Current project is read-only. Duplicate the project to import components.`

---

# 27. Provenance

正式 component 至少保留：

```json
{
  "provenance": {
    "source_type": "ExistingProject",
    "source_project_id": "RRU_VOLUME_REF_A",
    "source_project_name": "RRU Volume Reference A",
    "source_file": null,
    "imported_at": "2026-08-10T14:00:00+08:00"
  }
}
```

若有原始 lineage 也保留。

---

# 28. Suggested Canonical Component Model

```json
{
  "id": "CMP_FINAL_PA",
  "name": "Final PA",
  "category": "RF",
  "qty": 4,
  "power_W": 52.13,

  "thermal_spec": {
    "r_jc_C_per_W": 0.35,
    "limit_C": 180,
    "limit_type": "Tj",
    "height_mm": 250,
    "pad_L_mm": 20,
    "pad_W_mm": 10,
    "thickness_mm": 2.5,
    "board_type": "Copper Coin",
    "tim_type": "Grease"
  },

  "thermal_profile": null,

  "provenance": {
    "source_type": "ExistingProject",
    "source_project_id": "RRU_VOLUME_REF_A"
  }
}
```

---

# 29. Legacy Adapter Requirement

不要要求一次 migration 既有 DB。

建立：
```text
legacyComponentToCanonical()
canonicalComponentToLegacy()
```

例如：
```text
Component → name
Power(W)  → power_W
R_jc      → thermal_spec.r_jc_C_per_W
Limit(C)  → thermal_spec.limit_C
TIM_Type  → thermal_spec.tim_type
```

---

# 30. Suggested Module Structure

```text
src/
  screens/02-import-components/
    ImportComponentsView.tsx
    ImportSourceCards.tsx
    ComponentPreviewTable.tsx
    ColumnMappingPanel.tsx
    DuplicatePolicyPanel.tsx
    ImportSummaryPanel.tsx

  stores/
    componentImportStore.ts

  importers/component/
    parseCsv.ts
    parseExcel.ts
    parsePaste.ts
    parseExistingProject.ts
    detectHeaders.ts
    autoMapColumns.ts
    normalizeComponent.ts
    validateImportRow.ts
    legacyAdapter.ts
```

---

# 31. Performance

V1 target：
`<= 500 rows`

若 >500：
顯示 `Large import detected` warning。

Future 可做 virtualization。

---

# 32. Accessibility

- status 必須 icon + text，不只顏色
- tooltip 可 keyboard focus
- mapping dropdown 有 label
- error 與 row/field 關聯
- source cards 使用 button semantics

---

# 33. Acceptance Criteria

- AC-02-01 Existing Project import works
- AC-02-02 CSV import works
- AC-02-03 Excel import + sheet selection works
- AC-02-04 Paste Table works
- AC-02-05 Preview uses staging store
- AC-02-06 Canonical columns auto-map
- AC-02-07 Manual mapping works
- AC-02-08 Required errors block row import
- AC-02-09 Missing optional thermal fields only warn
- AC-02-10 Duplicate policy supports Skip / Replace / Merge / Variant
- AC-02-11 Per-row duplicate override works
- AC-02-12 Apply updates componentStore
- AC-02-13 Provenance is preserved
- AC-02-14 Unknown metadata is preserved
- AC-02-15 Relevant imported changes invalidate solver result
- AC-02-16 Import does not create Nodes/Edges
- AC-02-17 Total Power preview is correct
- AC-02-18 Total Power is never treated as Edge Q
- AC-02-19 Apply & Continue routes to Screen 04
- AC-02-20 UI is English-primary with Traditional Chinese bilingual/tooltip support

---

# 34. Codex Do Not

- 不要 preview 時直接改 componentStore
- 不要在 Screen 02 建 graph
- 不要把 Total Power 當 Edge Q
- 不要丟掉 provenance
- 不要 parse error → 0
- 不要整顆覆蓋 shared Project
- 不要因缺 Rjc/TIM 就拒絕基本 import
- 不要用 RF/Digital category hard-code thermal topology

---

# 35. Definition of Done

```text
Existing / CSV / Excel / Paste import works
+
Staging / Mapping / Validation is safe
+
Duplicate handling is explicit
+
Provenance is preserved
+
No graph topology is created
+
Stale solve state is invalidated safely
+
User can continue to Component Manager
```

---

# 36. Final Principle

**Screen 02 的核心不是「把 Excel 塞進資料庫」，而是建立安全的 Staging → Mapping → Validation → Provenance pipeline，確保之後 Thermal Network 的每一顆 Heat Source 都有可信且可追溯的來源資料。**
