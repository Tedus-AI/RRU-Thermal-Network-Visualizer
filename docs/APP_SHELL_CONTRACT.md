# App Shell Contract

**Status:** Binding for all screens 01–12.
**Supersedes:** any Header / Sidebar / Status Bar design drawn in an individual
screen mockup.

## Why this document exists

`00.png` and `01.png` established a dark-navy application chrome. `02.png` was
drawn with a different one (white header, white sidebar, extra `00 Dashboard`
entry). Adopting each mockup's chrome would mean re-skinning the whole tool every
time a new screen package arrives.

The resolution: **the App Shell is fixed and owned centrally; individual screen
mockups contribute workflow ideas, not chrome.**

## The shell

```text
AppShell
├─ TopHeader          src/app/TopHeader.tsx
├─ MainSidebar        src/app/MainSidebar.tsx
└─ ScreenWorkspace    src/app/ScreenWorkspace.tsx   (each screen renders through it)
```

The Bottom Status Bar and the Breadcrumb Bar have both been removed. The header
already carries the project, scenario, save state and solver state, and the
project name (header selector) plus the screen (sidebar and page title) were
what the breadcrumb repeated. The header's right end shows the solver state
only — not the screen name, which would be a third copy.

### 新版本提醒（`src/app/updateCheck.ts`、`UpdateBanner.tsx`）

與 AI-Thermal、5G-RRU 同一套：建置時 `vite.config.ts` 產生版本號（台北時間＋短 commit，`2026.10.27.1402-0cae7fc`）
並在 `dist/` 放一份 `version.json`；開著的分頁在載入後 15 秒、每 5 分鐘、切回分頁時以 `cache:'no-store'` 讀它，
版本不同就在 header 上方跳一整條提醒（「立即更新」／「稍後」＝10 分鐘後再提醒）。

- 「立即更新」先把還沒寫入的修改寫完（`flushPendingWork`，最多等 15 秒）才重新載入；等不到就不重新載入、在提醒上說原因。
  網址帶 `?v=<新版本>` 讓 HTML 重新抓（GitHub Pages 會快取幾分鐘），載入後拿掉。
- header 標題底下是目前的版本（`v2026.10.27.1402`），讀到線上版本後標「✓ 最新」或「有新版本」。`vite dev` 是「開發版」、不檢查。
- 讀不到 `version.json`（離線、404、內容不對）一律當作不知道，不會跳提醒。

### 清空瀏覽器暫存（`src/data/browserCache.ts`、`BrowserCacheDialog.tsx`）

瀏覽器的 localStorage 只是專案的工作副本，GitHub Pages 上同網站的工具（AI-Thermal、5G-RRU、本工具）共用一份空間，
滿了會出現「瀏覽器儲存空間已滿」。**不影響存檔**（修改留在記憶體、照常寫進 SharePoint／資料夾），但提示會一直在。

- 入口：儲存狀態面板的「已滿」提示、設定 → 儲存用量。視窗寫出本工具的工作副本與同網站其他資料各佔多少。
- 清空＝刪掉 `tnv.*`（建置戳記除外）再重新載入，專案從 SharePoint／資料夾讀回來 —— 跟每次部署新版本時一樣。
  儲存位置設定（`tnv-storage-*`）、Microsoft 登入、面板大小（`tnvui.*`）與其他工具的資料都不動。
- 瀏覽器可能是唯一一份時不給清：SharePoint／資料夾都沒有連上、還有修改沒寫入、有專案不在任何一個連上的位置。
- **空間不夠時先騰位置**（`persistence.ts` 的 `parked`）：工作副本包含資料夾／SharePoint 裡的**每一個**專案，專案一多就超過配額；
  只清空沒用，重新載入又會全部讀回來（使用者回報：按了清空還是滿的）。現在瀏覽器拒絕寫入時，先把**其他專案**的工作副本
  移到記憶體（大的先移；不移正在寫的專案、目前開著的專案 `setPreferredCacheProject`、有修改還沒寫進資料夾的專案），再寫一次。
  移出去的這次照樣讀得到，下次從資料夾／SharePoint 讀回來。連目前的專案都放不下時，才會出現「空間不夠」的提示。
  契約測試：`src/data/persistenceQuota.test.ts`、`workspace.test.ts`（五個專案、配額只放得下兩個）。

### Kept from 00 / 01

- Dark navy Top Header and Left Sidebar.
- Project selector and active Scenario selector in the header.
- Import / Export / Library / Settings / Help header actions.
- Save state and solver state in the header.

### Adopted from the 02 mockup

- Sidebar grouping.
- Page titles with the screen number: `01 專案資訊`.
- Bilingual form-section and table headers where space allows.
- A workflow stepper — but see below, it is **not** part of the shell.

### Explicitly rejected

- The white header and white sidebar from `02.png`.
- The extra `00 Dashboard` sidebar entry (not in the architecture document; add it
  only when it has its own specification).

## Rules for screens 03–12

1. A screen renders its content through `ScreenWorkspace`. It does not render its
   own header, sidebar, breadcrumb or status bar.
2. A screen may not restyle the shell, change its colours, or add chrome-level
   controls. Anything that belongs to every screen is a shell change, made once,
   here.
3. When a new mockup shows different chrome, implement the mockup's **workflow and
   content**, and keep this shell. Raise the discrepancy rather than forking the
   design.
4. `WorkflowStepper` is **screen-specific**, not shell. Only wizard-style screens
   render one, passed into `ScreenWorkspace`'s `stepper` slot. Screen 02's is:

   ```text
   Source → Mapping → Validate → Duplicates → Apply
   ```

5. A readiness KPI row goes in `ScreenWorkspace`'s `metrics` slot, which renders it
   between the page title and the stepper — the order every mockup from 05 onward
   uses. The cards themselves are screen-specific; only their placement is shell.

## Language rule

**Traditional Chinese is the UI language.** (This replaces the 02 §3 rule —
English first, every label bilingual — which doubled the text on every screen
and squeezed narrow fields until they broke.)

- One language per label. No `English / 中文` pairs.
- English stays only for industry terms engineers use as-is: TIM, BLT, HSK, k,
  Rjc / θJC, PA, FR1 / FR2, RRU / AAU, Die-casting, Embedded, FloTHERM,
  SharePoint, and units. They are written into the Chinese string
  (`散熱器底座`, `Die-casting 鰭片`), not appended by a helper.
- Screens refer to each other by sidebar number and sidebar name — `03 元件管理`,
  `04 熱網路與邊界` — never `Screen 04`. The number is the sidebar's (`ScreenDef.no`),
  not the specification document's (`ScreenDef.code`): see "Two numbers" below.
- Say a thing once, where it applies: a constraint beside its field, a missing
  value in amber where it is missing. No standing paragraphs that read the same
  every visit; longer explanations go in a tooltip.
- The sidebar lists only screens that exist, numbered 01–07 without gaps. A
  deferred screen (FloTHERM Import) is hidden until it is built and takes the
  next free number when it ships. Screens that merged into another left no
  number of their own: Boundary Conditions is the surface half of 04 熱網路與邊界
  (`/boundary` redirects there with its query string); Results Overview is part
  of 05 求解與結果 (07 §59, `/results` redirects there); Report Preview and
  Export Center are 07 報告與匯出 (12 §61, `/export` opens it with its 匯出設定
  drawer, `?panel=export`).

### Two numbers

A screen has two numbers and they are not the same thing (`navigation.ts`):

| Sidebar `no` — what a reader sees | `code` — the id | Specification documents | Screen |
| --- | --- | --- | --- |
| 01 | 01 | 01/ | 專案資訊 |
| 02 | 02 | 02/ | 匯入硬體元件 |
| 03 | 04 | 04/ | 元件管理 |
| 04 | 05 | 05/, 06/（散熱表面） | 熱網路與邊界 |
| 05 | 07 | 07/, 10/（結果總覽） | 求解與結果 |
| 06 | 08 | 08/ | 瓶頸分析 |
| 07 | 10 | 11/（報告預覽）, 12/（匯出中心） | 報告與匯出 |
| — | 03 | 03/ | FloTHERM 匯入（延後，不在側欄） |

- **Anything a reader sees uses `no`**: sidebar, page title, every "到 04 …" hint,
  tooltips, toasts, validation messages, report source names, the export
  manifest. When code only has an id (`fix_in`, a lever's `screen`, a progress
  row), `displayNo(code)` gives the number to print; ids of merged-away screens
  answer with the screen they became part of.
- **`code` stays the id**: `fix_in`, `LeverScreen`, `source_screen`, the
  localStorage keys (`tnv.08.…`, `07.results`), and the spec folders with every
  `07 §59` citation in comments and docs. Changing them would orphan saved data
  for no reader-visible gain.
- So a comment that says "Screen 07" or "07 §59" means the specification
  document 07 — today's 05 求解與結果. Read it through the table above.

The shared helpers still take both names, because most call sites were written
bilingual. They now show the Chinese and fall back to the English only when no
Chinese was given:

| Situation | Helper | Shows |
| --- | --- | --- |
| Any text | `<Bi en="Add Zone" zh="新增區域" />` | 新增區域 |
| Form field label | `<FieldLabel label="Zone Name" zh="區域名稱" tooltip="…" />` | 區域名稱 + tooltip |
| `Field` primitive | `<Field label="Ambient" zh="環境溫度" hintZh="…" />` | 環境溫度 |
| Table column header | `<ColumnLabel label="Power" zh="每顆功耗" unit="W" />` | 每顆功耗 (W) |
| Page title | `ScreenWorkspace title="…" titleZh="…"` | 01 專案資訊 |
| Buttons, icon buttons | `title={biTitle('Apply', '套用')}` | 套用 |

New code writes the Chinese directly. Hand-written `English / 中文` strings are
being removed screen by screen; until a screen's turn comes, it shows the
helper-rendered labels in Chinese and its own strings as they were.
