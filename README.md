# RRU Thermal Network Visualizer

**5G FR1 Thermal Network Visualizer** — RRU Thermal Path & Bottleneck Analyzer.

把 5G FR1 基站的熱傳路徑轉換成可計算、可視覺化、可解釋的 Thermal Resistance
Network，回答「熱從哪裡來、卡在哪一段、改哪裡最有效」。

架構最高準則見 [`00/00_Product_Vision_and_Architecture.md`](00/00_Product_Vision_and_Architecture.md)。
任何與該文件衝突的區域性需求，一律以其中定義的 Thermal Graph / Solver /
Data Provenance / Physics Correctness 原則為準。

## 開發狀態

| Screen | 功能 | 狀態 |
| --- | --- | --- |
| — | Phase 0 Foundation（App Shell、Routing、Thermal Graph 資料模型、Solver、Validation、Shared Stores、Persistence） | ✅ |
| 01 | Project Info | ✅ |
| 02 | Import Components | ✅ |
| 03 | FloTHERM Import | ⏸ 刻意延後（見下） |
| 04 | Component Manager | ✅ |
| 05 | 熱網路與邊界（Thermal Path Builder＋Boundary Conditions 合併） | ✅ |
| 06 | Boundary Conditions | ↪ 併入 05（`/boundary` 自動導到 05） |
| 07 | Thermal Network | ⏳ 待規格 |
| 08 | Bottleneck Analysis | ⏳ 待規格 |
| 09 | Temperature Distribution | ⏳ 待規格 |
| 10 | Results Overview | ⏳ 待規格 |
| 11 | Report Preview | ⏳ 待規格 |
| 12 | Export Center | ⏳ 待規格 |

## 技術堆疊

React 18 + TypeScript + Vite + Zustand + Tailwind CSS v4，Excel 解析使用 read-excel-file，
熱網路畫布使用 Cytoscape.js + dagre（05 §56）。Screen 07 之後會依 00 §39 再引入
Plotly.js（工程圖表）。

Cytoscape 只是 view / interaction layer：Graph 的唯一真實來源是 `networkStore`，
畫布上的任何操作都回寫 store，再由 store 重新渲染畫布。

## Screen 03 為何延後

側欄目前不列出 03（等實作後再出現，其他頁編號不變）。

`03_FloTHERM_Import` 目前**刻意延後，不是取消**：FloTHERM 實際 export schema 尚未用真實輸出檔
驗證，猜格式的成本遠高於等待。因此 04 起的資料模型已預留完整整合介面：

- `externalMappings.flotherm`（物件別名、偏好 junction/case 物件、映射狀態）
- `ResultValue<T>`：source / scenario / reference / confidence
- Node 的 analytical / flotherm / measurement 溫度插槽
- Edge 的 analytical / flotherm / measurement / manual 熱阻插槽與 active source

程式碼中**沒有**任何 FloTHERM parser 或 CSV 欄位假設。回補 03 時不需重構 04～10。

## Screen 05 的物理界線

05 只描述「熱可以怎麼走」，不假裝知道「每條路實際走多少 W」或「每個節點最後幾 °C」：

- 不做 solve，不顯示 Node Temperature、Edge Heat Flow Q、ΔT 或 Thermal Margin。
- `Qty × Power` 只用於 source node 的功耗聚合，永遠不是任何 Edge 的 Heat Flow Q。
- 參數不足的 Rth 維持 `unresolved`（`null`），不會被填成 0。
- `FIN_SURFACE → AMBIENT_PLACEHOLDER` 只是結構終點；Ambient、h_conv、h_rad、
  wind、solar 全部屬於 Screen 06。
- 模板結束於 PORT（`HEAT_OUT` / `BOARD_OUT` / `TOP_OUT` / `HEAT_PIPE_OUT` /
  `DIRECT_BASE_OUT`），不硬綁 Main Base；Step 4 才把 port 接到共用結構。
- Graph 不限制為 Tree：series / parallel / branch / merge / shared node / coupling cycle
  都合法，區域間的耦合迴圈不會被判為錯誤。
- 元件進 HSK 基座的擴散邊（Lee 圓盤擴散）擴散到多大的底座，由 04 逐元件選擇：
  **整片基座**（預設）、**依熱量分配**（面積 = 基座 × 該邊熱流 ÷ 進入基座總熱流，
  熱流取自 07 的求解，不用元件額定功耗；05 在求解前顯示整片基座）、**指定面積**（每顆）。
  縮小範圍假設周圍底座不比平均溫度高，適合遠離熱源群的元件；07 的求解訊息會列出所有縮小範圍的元件。

## 05 邊界部分（原 Screen 06）的物理界線

05「熱網路與邊界」的 ② 散熱表面／③ 環境／④ 檢查是原本 06 的工作，設定「情境相關邊界條件」：

- 邊界條件不新增、不刪除任何節點或連線，也不會改寫熱網路的存檔（拓樸只在 ①「進階編修」裡改）。
- 環境溫度、對流 h、輻射參數、太陽負載、固定溫度**依情境儲存**，鍵值為
  `projectId + networkId + scenarioId`，不寫進 base topology。
- 05 **不求解**，也不顯示節點溫度、Edge Heat Flow Q、ΔT 或瓶頸排名。
- 邊界熱阻只是**求解前的輸入預覽**，畫面上明確標示；
  `Rconv = 1/(hA)`、`h_rad = εσF·(Ts²+Ta²)(Ts+Ta)`（割線線性化，周圍溫度取情境環境溫度；
  `4εσF·T³` 只在 T 取兩者平均時才近似成立）、對流與輻射為**並聯（導熱率相加）**。
- 太陽負載是**外部熱輸入**，與元件功耗分開儲存，由 07 決定如何注入求解。
- 固定溫度是 Dirichlet 邊界，絕熱是「刻意不導熱」，兩者都不會被偽造成熱阻。
- 參數不足一律維持 `null` 並在驗證中擋下，不會被填 0。

## App Shell 規則

Header / Sidebar 為全專案共用且集中維護，個別 Screen 不得自行更改或重新設計。
完整規則見 [`docs/APP_SHELL_CONTRACT.md`](docs/APP_SHELL_CONTRACT.md)。
UI 以繁體中文為主，只保留業界慣用的英文術語（TIM、BLT、HSK、Rjc、PA、Die-casting、Embedded…）；
畫面之間以「05 熱路徑建立」這樣的編號＋名稱互相引用。

## 線上版本

推上 `main` 後由 GitHub Actions 自動 build 並發布到 GitHub Pages：

<https://tedus-ai.github.io/RRU-Thermal-Network-Visualizer/>

首次開啟時可在空狀態頁按「載入示範專案」，載入 `01/01_Project_Info_mock.json`
對應的示範資料（18 components / 9 heat sources / 412.3 W）以檢視已填值的畫面狀態。

專案同時存在 **SharePoint**（團隊共用）與**本機資料夾**（Chrome / Edge），見下節。
瀏覽器的 localStorage 只是工作副本，每次開啟都會從儲存位置重新讀取。

## 專案儲存位置：SharePoint ＋ 本機資料夾（同時使用）

每次存檔都會**同時寫入**已設定的兩個位置，兩邊各自記錄「還沒寫到哪一邊」，
連不上的那一邊恢復後自動補寫：

- **SharePoint**（團隊共用）：開啟時優先從這裡讀取，拿到所有人的最新版本。
- **本機資料夾**（這台電腦的副本）：SharePoint 離線或登入過期時照常存檔；
  SharePoint 連不上時直接用本機副本開啟繼續工作，恢復連線後點一下就補傳。

任一個即可開始使用，另一個之後可在右上角儲存狀態或 Settings 設定。

### SharePoint

連線方式與 Project TIM Manager 相同：同一個 Azure 應用程式（MSAL.js 彈出式登入，
重新導向頁 `auth.html`）、同一個 SharePoint 網站 `Thermal-Spec-DB`，設定在
`src/data/sharepoint.ts` 的 `SHAREPOINT_CONFIG`。資料樹與本機資料夾相同，每個專案一個檔：

```text
Thermal-Spec-DB（網站）
└─ 文件（Shared Documents）
   └─ RRU_Thermal_Network/
      └─ Database/
         ├─ <專案代號>.tnv.json          每個專案一個檔
         └─ component-library.tnv.json   共用元件庫
```

- 資料夾不存在時視為空的專案清單，第一次存檔會自動建立。
- 不另設 Backup 資料夾：SharePoint 會保留每個檔案的版本歷程，刪除的檔案在網站資源回收筒可還原。
- 每次寫入都帶 `If-Match: <eTag>`（新檔案用 `conflictBehavior=fail`），不會覆蓋別人的版本。
  同一專案被同事先存了新版本時（412），你的版本另存為「`<名稱> (conflict copy …)`」新專案並自動切換過去，
  原專案顯示 SharePoint 上的版本（本機副本兩個都會有）。以下情況不算衝突：對方只是重存而內容相同、
  自己逾時但其實已寫入、或檔案正是這台瀏覽器上次同步的版本。
- 元件庫是共用檔：兩人同時存檔時依項目合併（每個零件以較新的 `saved_at` 為準）；
  代價是剛刪除的零件若同時有人存檔元件庫，會被合併回來。
- 切換專案前會先比對 SharePoint，有較新版本（且本機沒有未寫入的修改）就先讀入；
  切回分頁時也會檢查目前專案，Header 顯示「雲端有新版」可重新載入。

### TIM 材料參照 TIM 管理工具

TIM 材料由 **TIM 管理工具**（Project-TIM-management-tool）建立；它在同一個網站自動產生
`TIM_Manager/Database/tim_catalog.json`（TIM 型號目錄，只有材料屬性：Vendor、Model、Pad / Putty / Grease、k 與量測標準…）。
01「材料與製程預設」的 TIM 表格按「**從 TIM 管理工具帶入**」勾選材料：

- 加入的材料標「TIM 管理工具」：**名稱與 k 跟著 TIM 管理工具**（每次開工具第一次讀目錄時自動更新並顯示「已依 TIM 管理工具更新」；
  k 的來源記為規格書、參照「TIM 管理工具 · Vendor Model · 量測標準」）。元件以材料 id 參照，所以名稱改了也不會斷。
- **BLT 仍在本專案填**（壓合後的厚度依設計而定，不屬於材料）；新加入的 BLT 先帶各類型的典型值，標為推定值（灰字）。
- 本專案已有同名的材料會改為連結它（元件不受影響）；✂ 解除連結＝保留目前的名稱與 k、改回本專案自行維護。
- 讀取目錄需要能不跳視窗取得 SharePoint 權杖；讀不到（本機資料夾、離線）時，已連結的材料照用存下來的值。唯讀時只提示有更新、不改專案。
- 程式：`src/domain/timCatalog.ts`（格式、跟隨規則）、`src/data/timCatalogStore.ts`、`src/project/TimCatalogPicker.tsx`。

**部署前提**：Azure 應用程式（clientId `17fc1ab4-…`）的「單頁應用程式（SPA）」重新導向 URI 必須加入
`https://tedus-ai.github.io/RRU-Thermal-Network-Visualizer/auth.html`
（本機開發另加 `http://localhost:5173/auth.html`），否則登入會出現 AADSTS50011。

### 本機資料夾

每個專案一個 `.tnv.json`，加上 `component-library.tnv.json`；與 SharePoint 的 `Database` 資料夾內容相同。
需要 File System Access API（Chrome / Edge）。從 SharePoint 讀取後，本機副本會自動更新成同樣內容：

- 本機有、SharePoint 沒有的專案 → 上傳到 SharePoint。
- 第一次與 SharePoint 配對（或本機檔案被工具以外改過）而內容不同 → SharePoint 版本不動，
  本機版本另存為「`<名稱> (local copy …)`」新專案（兩邊都有），不會覆蓋任何一邊。
- SharePoint 上已刪除的專案 → 本機檔案移到資料夾內的 `Replaced/`，不會刪除。
- 刪除專案時兩邊都要連得上（否則另一邊的檔案會讓專案再出現），工具會先提示。

### Header 儲存狀態

Header 中間的兩行區塊：

```text
☁ SharePoint  ✓ 已儲存   10:09
🖴 本機        ✓ 已儲存   10:09
```

每一行顯示該位置的寫入狀態：已儲存／寫入中／需重新登入／需重新授權／離線（改用本機副本）／
未寫入／儲存失敗／雲端有新版／未設定，右側數字是待補寫的專案數。
登入過期或權限失效時**點該行即可修復**；其他情況點擊展開面板，可看完整位置、帳號、上次寫入，
以及「連線 SharePoint」「選擇資料夾」「開啟資料夾」「切換帳號」「重新載入」「儲存設定」。

## 開發指令

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build
npm test           # vitest — solver / validation / Rule 4 / Rule 9
```

## 部署

`.github/workflows/deploy.yml`：

- Pull request → 只跑 test 與 build，不發布。
- Push 到 `main` → build 後發布到 GitHub Pages。
- Pages 專案站台掛在 `/<repo>/` 底下，所以 CI build 會帶 `VITE_BASE_PATH`，
  前端則以 `basename={import.meta.env.BASE_URL}` 對應。
- Pages 沒有 rewrite 規則，直接開啟 `/project/<id>/info` 這類深層網址會落到
  `404.html`；build 後會把 `index.html` 複製成 `404.html`，讓 router 自行解析路徑。

首次啟用需要在 repo 的 **Settings → Pages → Build and deployment → Source**
選擇 **GitHub Actions**。

## 專案結構

```text
src/
  app/            Master App Shell：Header / Sidebar / StatusBar / 導覽與 route guard
  domain/         Project、Scenario、Component 的領域模型與列舉
  adapters/       Legacy 元件資料雙向轉換
  importers/      匯入管線：解析、欄位對應、正規化、驗證、重複處理、Apply
  thermal/        Thermal Graph 核心
    types.ts          Node / Edge / RthValue / Provenance / SolverState schema
    rth.ts            Rth 多來源值物件；Rule 4 與 Rule 9 的程式碼層防護
    networkSolver.ts  [G][T]=[P] nodal solver、edge Q/ΔT 回算、energy balance
    networkValidation.ts  Solve 前檢查（orphan、boundary、zero/negative Rth …）
  data/           Shared stores：project / scenario / component / network / solver
    persistence.ts    localStorage adapter，merge 寫入並保留他工具的欄位
    folderStore.ts    兩個儲存位置（SharePoint ＋ 本機資料夾）同時寫入、讀取來源、補寫、配對、衝突副本
    sharepoint.ts     MSAL 登入與 Microsoft Graph 請求（設定同 Project TIM Manager）
    sharepointFolder.ts  SharePoint 資料夾（與本機資料夾同一個 DirectoryHandle 介面，eTag 條件寫入）
  project/        Screen 01 Project Info
  screens/        Screen 02 Import Components、04 Component Manager，以及其餘佔位頁
  ui/             共用 UI primitives 與 toast
  mock/           01 規格附帶的示範資料
```

## 核心不變條件

程式碼層已固定下列規則，後續 Screen 不得繞過：

1. **Node + Edge 通用圖** — 支援 series / parallel / branch / merge / shared node，不限制為 Tree。
2. **Solver 不認識元件型別** — 只處理 nodes、edges、power、boundary conditions。
3. **Rule 4** — `deriveRthFromDeltaT()` 在 segment Q 未知時回傳 `unresolved`，不產生數字；
   禁止以元件總功耗代替未知的 edge Q。
4. **Rule 9** — `RthValue` 同時保存 analytical / flotherm / measurement 與各自 provenance，
   FloTHERM 匯入預設不奪取 `active_source`。
5. **Rule 6** — 任何 topology / power / Rth / boundary / scenario 變動都會呼叫
   `solverStore.invalidate()`，舊結果轉為 `DIRTY`，不得繼續當成有效值顯示。
6. **Shared DB 安全** — 專案寫入採 merge 語意，未知的 sibling 欄位原樣保留。
7. **未知不等於零** — 未知的 Rjc、功耗、溫度上限一律以 `null` 保存並顯示 N/A，絕不以 0 代替。
8. **Total Power ≠ Edge Q** — `Qty × Power` 只是元件功耗摘要，不可作為熱網路邊的熱流依據。
