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
| 03 | Import FloTHERM | ⏳ 待規格 |
| 04 | Component Manager | ⏳ 待規格 |
| 05 | Thermal Path Builder | ⏳ 待規格 |
| 06 | Boundary Conditions | ⏳ 待規格 |
| 07 | Thermal Network | ⏳ 待規格 |
| 08 | Bottleneck Analysis | ⏳ 待規格 |
| 09 | Temperature Distribution | ⏳ 待規格 |
| 10 | Results Overview | ⏳ 待規格 |
| 11 | Report Preview | ⏳ 待規格 |
| 12 | Export Center | ⏳ 待規格 |

## 技術堆疊

React 18 + TypeScript + Vite + Zustand + Tailwind CSS v4，Excel 解析使用 read-excel-file。
Screen 07 之後會依 00 §39 引入 Cytoscape.js（網路圖）與 Plotly.js（工程圖表）。

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
  importers/      匯入管線：解析、欄位對應、正規化、驗證、重複處理、Apply
  thermal/        Thermal Graph 核心
    types.ts          Node / Edge / RthValue / Provenance / SolverState schema
    rth.ts            Rth 多來源值物件；Rule 4 與 Rule 9 的程式碼層防護
    networkSolver.ts  [G][T]=[P] nodal solver、edge Q/ΔT 回算、energy balance
    networkValidation.ts  Solve 前檢查（orphan、boundary、zero/negative Rth …）
  data/           Shared stores：project / scenario / component / network / solver
    persistence.ts    localStorage adapter，merge 寫入並保留他工具的欄位
  project/        Screen 01 Project Info
  screens/        Screen 02 Import Components、以及 03–12 佔位頁
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
