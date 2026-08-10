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
| 02 | Import Components | ⏳ 待規格 |
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

React 18 + TypeScript + Vite + Zustand + Tailwind CSS v4。
Screen 07 之後會依 00 §39 引入 Cytoscape.js（網路圖）與 Plotly.js（工程圖表）。

## 開發指令

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build
npm test           # vitest — solver / validation / Rule 4 / Rule 9
```

首次開啟時可在空狀態頁按「載入示範專案」，載入 `01/01_Project_Info_mock.json`
對應的示範資料（18 components / 9 heat sources / 412.3 W）以檢視已填值的畫面狀態。

## 專案結構

```text
src/
  app/            Master App Shell：Header / Sidebar / StatusBar / 導覽與 route guard
  domain/         Project、Scenario、Component 的領域模型與列舉
  thermal/        Thermal Graph 核心
    types.ts          Node / Edge / RthValue / Provenance / SolverState schema
    rth.ts            Rth 多來源值物件；Rule 4 與 Rule 9 的程式碼層防護
    networkSolver.ts  [G][T]=[P] nodal solver、edge Q/ΔT 回算、energy balance
    networkValidation.ts  Solve 前檢查（orphan、boundary、zero/negative Rth …）
  data/           Shared stores：project / scenario / component / network / solver
    persistence.ts    localStorage adapter，merge 寫入並保留他工具的欄位
  project/        Screen 01 Project Info
  screens/        Screen 02–12 佔位頁
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
