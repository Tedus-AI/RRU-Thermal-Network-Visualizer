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
- AI-Thermal 專案（共用資料庫 `thermal_db.json`）
- Existing Project / 既有專案
- CSV
- Excel
- Paste Table / 貼上表格

本頁只建立乾淨、可追溯、已驗證的 Component Dataset。

> **本頁禁止建立 Thermal Node / Edge。**

Thermal topology 由 `05_Thermal_Path_Builder` 負責。

---

# 2. User Flow

三步（`WorkflowStepper`，原本五步：預覽、驗證、重複處理併入第 3 步，套用是動作不是一步）：

```text
① 來源          選來源 → 讀取 → 載入元件
② 對應欄位      欄位對應（必填欄位都對到才能下一步）
③ 檢查並套用    統計一行 → 擋下的問題 → 重複處理（有重複才出現）→ 預覽表 → 套用
→ 套用 N 顆並前往 04（主要）／▾ 套用並留在 02
```

- **AI-Thermal 專案、本工具其他專案**的欄位是本工具自己的（`SELF_MAPPED_SOURCES`），必填欄位一定對得到 →
  載入後直接到 ③，步驟列的 ② 標「全部自動對應 ✓」，仍可點回去看。檔案與貼上一律經過 ②。
- 套用後停在 ③（`phase = 'applied'`）：結果一行「已匯入（新增 N・更新 M…）」＋「再匯入其他來源」「前往 04 元件管理」。
- 底部列左邊：上一步／取消匯入／唯讀；右邊依步驟：「下一步：檢查並套用」、分割按鈕「套用 N 顆並前往 04 ▾」。

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

> 下面是原始規格的版面。實際版面（2026-10 精簡）：單欄、沒有右側面板；③ 的統計、驗證、專案影響合成
> 一行（`ReviewStatsLine`：「N 種・M 顆：」＋可篩選的狀態膠囊＋總功耗＋「匯入後 X 種・Y W」），
> 擋下的問題（必填欄位沒對到、錯誤列）才另外出現（`BlockingIssuesPanel`），重複處理只在有重複時出現
> （`DuplicateBar`）。AI-Thermal 來源在 ③ 多一張收合的「01 材料與製程」卡（含 5G-RRU 參數帶入）。

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

四張來源卡（CSV 與 Excel 合成一張「Excel 或 CSV 檔」，依副檔名決定讀法；每張一行中文說明）：

## AI-Thermal 專案
直接讀 AI-Thermal（pad & stud 工具）與 5G-RRU 共用的 `thermal_db.json`：SharePoint `ToolDatabase/thermal_db.json`
（本工具既有的 Microsoft 登入，唯讀），或本機檔案（AI-Thermal 的離線資料庫、「💾 備份資料庫」下載的檔案）。見 §6b。

## Existing Project / 既有專案
從 existing `5G-RRU-Quick-Volume-Evaluation-Tool` 或 shared DB Project 匯入。

## Excel 或 CSV 檔
`.xlsx` 或 `.csv`（逗號、分號或 tab 分隔）；多 sheet 時顯示工作表選單。舊版 `.xls` 請先另存為 `.xlsx`。

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

# 6b. AI-Thermal Project Import

實作：`src/importers/component/parseAiThermal.ts`（轉成與既有專案相同的 `ParsedTable`＋`_ref_spec`，走同一條
Mapping → Validation → Duplicate → Apply）、`AiThermalSourcePanel.tsx`、`sharepoint.readAiThermalDb`。**只讀，絕不寫回**
（那份資料庫由 AI-Thermal 與 5G-RRU 共用一把編輯鎖，本工具不參與）。

畫面：資料庫來源（SharePoint／本機檔案）→ 專案（RF／Digital／PWR 顆數）→ PCB 板厚、5G-RRU 已排除顆數、最後儲存 →
匯入範圍（RF／Digital／PWR、包含 5G-RRU 已排除的元件）→「5G-RRU 參數控制台 → 01 材料與製程」（見下）→
「會帶入／還要在 04 補」說明 →「載入元件（N 顆）」。

欄位對照（元件 ＝ `rf_data`／`digital_data`／`pwr_data` 的一筆；TH/ME ＝ `thermal_specs[specKey(名稱)]`，兩邊都有時 TH/ME 優先，
因為元件上的 `Board_Type`／`Pad_*` 只在 AI-Thermal 存檔時才由 TH/ME 推導）：

| AI-Thermal | 本工具 |
|---|---|
| `Component`、`Qty`、`Power(W)`、`Limit(C)` | 名稱、數量、單顆功耗、溫度上限 |
| 所在清單（Type `filter` → Filter）| 分類 RF／Digital／Power／Filter |
| `Limit_Ref`（沒填 → 兩工具共用的自動規則 `CompMerge.limitRef`）| 限溫類型，**一律已確認**（使用者決定：限溫對象屬於 AI-Thermal，要改回 AI-Thermal 改、再重新匯入）。Rjc = 0 的本體型元件 Tj → Tc。判定依據寫在「來源」分頁的「限溫對象」 |
| `R_jc`（沒有 → `Rth` 的 θJC，依散熱路徑取 top／bottom）| Rjc。**`R_jc = 0` → 表面／本體型熱源、Rjc 留空**（Rjc 0 會被 07 拒絕）|
| TH/ME `heatDirection`（→ 元件 `Board_Type`）| 散熱路徑：Copper Coin → 銅塊、Thermal Via → 板級導熱孔、IC top → 元件表面、Metal Face → 金屬散熱面（腔體濾波器、模組底板、法蘭；AI-Thermal 2026-10 新增）；None／舊值 → 依分類推定（未確認，不鎖）|
| TH/ME `heatSourceSize`／`heatSourceHeight` | 本體 L × W × H |
| TH/ME `epadSize`（→ `Pad_L/W`）| E-PAD（板級導熱孔的熱源面）|
| `projects[id].pcb_thickness[RF／Digital／PWR]` → 5G-RRU 元件 `Thick(mm)` → `global_params.t_PCB` | 板厚（只有板級導熱孔）|
| TH/ME `via`（AI-Thermal「Thermal Via 計算」的設計）＋元件 `TV_Qty`／`TV_ID_mil` | 板級導熱孔：設計完整 → 該元件**自訂**導熱孔等效 k ＝ K_eff、製程係數 1（K_eff 已含銅壁／塞孔／FR4 的比例，不再折減；與 5G-RRU 相同）；沒有設計／暫不納入／缺輸入／via 超過焊盤 → 不寫，沿用 01 的通用值。圓形焊盤且 TH/ME 沒填 `epadSize` → E-PAD 用等面積方形 |
| TH/ME `timModel`／`timType`（→ `TIM_Model`／`TIM_Type`）| TIM（`resolveAiThermalTim`）：依序找 ① AI-Thermal 型號庫連到的 TIM 管理工具材料（`tim_library[].srcId` = 01 材料的 `catalog.id`）② 名稱＝型號 ③ 名稱＝類型 ④ 該類型的內建材料（Grease／Pad／Putty，改過名也算）；名稱比對不分大小寫、空白與符號。None → 乾式金屬接觸。**都找不到 → 02 警告「TIM 不在 01 的材料清單」**，材料卡最上面列出這些型號（AI-Thermal 型號庫的 k 與填縫厚度），預設勾選、按「加入 01」才寫入（`AiTimOffer`）。原本只認完全同名，01 的 TIM 連到 TIM 管理工具改了名之後，每顆元件都沒有 TIM、也沒有警告 |
| TH/ME `icToHSK`（壓縮後縫隙）→ 型號 `gapThickness` | 壓合厚度 BLT（與材料預設相同就不寫，沿用材料）|
| TH/ME `bossSize`（元件表面路徑）| 記在凸台的「上次設定」（`mount_by_type.Pedestal`）：04 選「凸台」時帶入；接合方式仍是直接貼合 |
| 元件 `note`＋TH/ME `note` | 備註 |
| `_excluded`（5G-RRU 👁）| 預設不匯入；勾「包含已排除」→ 匯入為停用 |
| `Type`、限溫對象的判定、`Power_RT(W)`、`TIM_Model`、`TV_ID_mil`、`TV_Qty`、Thermal Via 等效 k（或用通用值的原因）、`bossSize`、板厚來源 | 元件「來源」分頁的保留欄位 |

- TH/ME 的 `hidden_components` **不是**排除（那是機構規格清單的隱藏，Driver／環形器／濾波器都在裡面，是真的熱源）。
- 封裝型式只認得 `filter` → Cavity Filter、`Power Modules` → Module，其餘留給 04。
- 本體型元件不報「缺 Rjc」、乾式金屬接觸不報「未指定 TIM」（`_ref_spec` 已經說明，既有專案匯入也一併修正）。
- **K_eff 的算法與 AI-Thermal、5G-RRU 共用同一份 `viaCalc.js`**（`src/importers/component/viaCalc.js`，三個 repo 逐字相同；
  `aiThermalVia.ts` 載入它）。**不要在這裡改**：在 AI-Thermal 改、複製到三個 repo，並更新 `aiThermalVia.test.ts` 釘住的 SHA-256。
  ⚠ 本工具的導熱孔熱阻用擴散面積（`spreading_area`），AI-Thermal／5G-RRU 用焊盤面積 → 同一個 K_eff，本工具的導熱孔熱阻較小
  （StarKcore-12L 的 Si5518：本工具 0.616、5G-RRU 0.759 °C/W）。計算方式未改。
- **5G-RRU 參數控制台 → 01 材料與製程**（`aiThermalMaterials.ts`、`RruMaterialsOffer`）：專案的 `global_params` 裡 5G-RRU **有存**的值
  （沒存的在 5G-RRU 是出廠預設，不帶）逐項列出「01 目前／5G-RRU」，勾選後按「帶入 01」才寫入（`patchMaterials`，來源 Imported、
  reference「5G-RRU 參數控制台（專案名）」）。01 沒有值或還是出廠預設 → 預設勾；01 已設定 → 預設不勾；相同的不列（只寫筆數）。

  | 5G-RRU | 01 |
  |---|---|
  | `Coin_L_Setting`／`Coin_W_Setting`／`Coin_T_Setting`、`K_Coin` | 銅塊長／寬／厚度、銅導熱係數 |
  | `K_Solder`／`t_Solder`／`Voiding` | 焊料導熱係數／厚度／有效面積率 |
  | `K_Via`／`Via_Eff` | 導熱孔等效 k／製程係數（通用值）|
  | `t_base`；`L_pcb + Top + Btm`、`W_pcb + Left + Right`（5G-RRU 的 `rruFootprint`）| 散熱器基座厚度；長 L、寬 W |
  | `K_Pad`／`t_Pad`、`K_Putty`／`t_Putty`、`K_Grease`／`t_Grease`（5G-RRU 沒選型號時用）| 內建 TIM「Pad」「Putty」「Grease」的 k／BLT（連結 TIM 管理工具的材料不改 k）|
- 測試：`aiThermalImport.test.ts`（StarKcore-12L 真實備份資料，parse → map → stage → apply；含 via 設計各種情況）、
  `aiThermalVia.test.ts`（共用 `viaCalc.js` 的 SHA-256 與載入）、`aiThermalMaterials.test.ts`（參數控制台 → 01）。


# 6c. 與 AI-Thermal 的連結（04 鎖定與「從 AI-Thermal 更新」）

使用者決定（2026-10）：AI-Thermal 匯入的欄位在 04 **鎖定＋✂ 解開**；AI-Thermal 改了**只提醒**，由 04 的
「從 AI-Thermal 更新」逐欄確認；AI-Thermal 刪掉的元件**預設保留**。實作 `src/domain/aiThermalLink.ts`（純函式）。

- 匯入時（`applyImport` → `withAiLink`）在元件的 `provenance.ai_link` 記下：AI-Thermal 專案 id、元件 id（`_cid`）、
  帶入時間、AI-Thermal 的最後儲存時間（`meta.timestamp`），以及 **AI-Thermal 有給的每個欄位的值**（`values`）。
  合併／取代既有元件時，連結記的是 AI-Thermal 自己的值（同一列當新元件來建），不是合併後的值；
  同一個專案重新匯入會保留已解開的欄位（`unlocked`）。其他來源不建連結。
- 欄位（`AI_FIELDS`）：名稱、數量、單顆功耗、限溫、限溫對象、Rjc（含本體型）、散熱路徑、本體大小、E-PAD、板厚、TIM（含 BLT）、
  導熱孔等效 k。**AI-Thermal 沒給的不鎖**（本工具要填的）；尺寸要長寬都有才算有給。名稱不鎖（只在更新時同步）。
- 「複製元件」的複本不帶連結（是新的一顆，不能讓兩顆對到 AI-Thermal 同一筆）。04 的行為見 04 規格 §25b。
- **連結功能上線前匯入的元件**（來源是 AI-Thermal、有專案 id、沒有連結：`isAiFirstLink`）不必重新匯入：04 的
  「從 AI-Thermal 更新」會做第一次連結（見 04 規格 §25b）。AI-Thermal 已沒有、選擇保留的元件標 `ai_unlinked`，不再提示連結。
- 測試：`src/importers/component/aiThermalSync.test.ts`（真實 StarKcore-12L 資料）、`src/data/componentImportStore.test.ts`。

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

實作：③ 上方一行結果「已匯入（新增 N・更新 M・略過 K）」＋按鈕「再匯入其他來源」「前往 04 元件管理」。
主要按鈕「套用 N 顆並前往 04」直接到 04；▾ 選「套用並留在 02」才停在這裡。

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
