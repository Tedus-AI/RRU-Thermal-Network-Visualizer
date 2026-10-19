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
- Screens refer to each other by number and sidebar name — `05 熱路徑建立`,
  `06 邊界條件` — never `Screen 05`.
- Say a thing once, where it applies: a constraint beside its field, a missing
  value in amber where it is missing. No standing paragraphs that read the same
  every visit; longer explanations go in a tooltip.
- The sidebar lists only screens that exist. A deferred screen (03 FloTHERM
  Import) is hidden until it is built; the other numbers do not move.

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
