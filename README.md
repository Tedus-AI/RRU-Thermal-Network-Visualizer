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
| 05 | Thermal Path Builder | ✅ |
| 06 | Boundary Conditions | ⏳ 待規格 |
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

## App Shell 規則

Header / Sidebar / Breadcrumb / Status Bar 為全專案共用且集中維護，個別 Screen 不得自行
更改或重新設計。完整規則見 [`docs/APP_SHELL_CONTRACT.md`](docs/APP_SHELL_CONTRACT.md)。
自 Screen 02 起 UI 以英文為主、中英並列，空間不足時以繁體中文 tooltip 補足。

## 線上版本

推上 `main` 後由 GitHub Actions 自動 build 並發布到 GitHub Pages：

<https://tedus-ai.github.io/RRU-Thermal-Network-Visualizer/>

首次開啟時可在空狀態頁按「載入示範專案」，載入 `01/01_Project_Info_mock.json`
對應的示範資料（18 components / 9 heat sources / 412.3 W）以檢視已填值的畫面狀態。

> 專案資料目前存在瀏覽器的 localStorage，不會上傳，也不會在不同裝置之間同步。

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
