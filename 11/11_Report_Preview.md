# 11 — Report Preview / 報告預覽
## 5G FR1 Thermal Network Visualizer
### Screen Functional Specification for Codex

**Document ID:** `11_Report_Preview`  
**Parent Architecture:** `00_Product_Vision_and_Architecture.md`  
**Previous:** `10_Results_Overview.md`  
**Deferred:** `03_FloTHERM_Import`  
**Next:** `12_Export_Center.md`  
**Priority:** P0 — Report Composition / Preview  

---

# 0. Screen Responsibility

Screen 10 已建立 `ResultsOverviewSnapshot`。

Screen 11 的任務是：

> **把目前 current snapshot 組成可預覽、可調整內容結構的 thermal engineering report。**

11 負責：

- Report Preview
- Report section selection
- Section order
- Cover / Header / Footer metadata
- Project / Scenario summary display
- Report content inclusion/exclusion
- Page preview
- Table / chart inclusion settings
- Engineering note / conclusion blocks
- Snapshot freshness check
- Report completeness validation
- Save report configuration
- Prepare export payload for Screen 12

11 不負責：

- Full solver → 07
- Bottleneck sensitivity → 08
- Temperature distribution analysis → 09
- Overall status recomputation → 10
- PDF / CSV / JSON actual file export → 12
- FloTHERM import → 03 later

---

# 1. Mandatory Language Rule — Screens 09–12

English is primary.

When space allows:

```text
Report Preview / 報告預覽
Section Order / 章節順序
```

When compact:

```text
Report Readiness
Snapshot Status
Page Layout
```

Visible English + Traditional Chinese engineering explanation on hover.

Requirements:

- use shared `FieldLabel / BilingualTooltip / EngineeringInfo`
- browser native `title=""` alone is insufficient
- tooltip must explain the function / engineering meaning

---

# 2. Fixed App Shell

Use the exact shared App Shell.

Sidebar exact order:

```text
01 Project Info
02 Import Components
03 FloTHERM Import [Deferred]
04 Component Manager
05 Thermal Path Builder
06 Boundary Conditions
07 Thermal Network
08 Bottleneck Analysis
09 Temperature Distribution
10 Results Overview
11 Report Preview ← Active
12 Export Center
```

Do not add, rename, reorder screens.

---

# 3. Prerequisite

11 requires a `ResultsOverviewSnapshot` from Screen 10.

Snapshot states:

```text
CURRENT
STALE
MISSING
WARNING
```

- CURRENT: snapshot matches current scenario / solver / analyses.
- STALE: 07 / 08 / 09 / limits / scenario changed after snapshot creation.
- MISSING: no snapshot exists.
- WARNING: snapshot current, but Report Readiness from 10 = WARNING.

If `MISSING`:
`No report snapshot is available. Return to Screen 10 and prepare a report snapshot.`

If `STALE`:
`Report snapshot is stale. Refresh the overview snapshot before final export.`

V1 allows stale preview only with a strong warning, but blocks export preparation.

---

# 4. Report Model

```ts
type ThermalReportConfig = {
  id: string;
  projectId: string;
  scenarioId: string;
  snapshotId: string;

  title: string;
  subtitle?: string;

  languageMode: 'english' | 'bilingual';
  pageSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';

  cover: ReportCoverConfig;
  sections: ReportSectionConfig[];
  headerFooter: HeaderFooterConfig;

  notes?: string;
  metadata?: Record<string, unknown>;
};
```

---

# 5. Default Report Template

V1 default:

`Thermal Engineering Summary`

Default section order:

1. Cover
2. Project & Scenario Summary
3. Overall Thermal Status
4. Critical Components
5. Thermal Network Summary
6. Bottleneck Analysis Summary
7. Temperature Distribution Summary
8. Solver & Energy Quality
9. Data Completeness & Confidence
10. Engineering Actions / Conclusions
11. Appendix: Source & Traceability

---

# 6. Section Selection & Order

Each section supports Included / Excluded.

Required by default:

- Cover
- Project & Scenario Summary
- Overall Thermal Status
- Solver & Energy Quality

Reorder actions:

- Drag to reorder
- Move Up
- Move Down
- Reset to Default

Section reorder must never mutate Screen 10 snapshot data.

---

# 7. Cover Page

Fields:

- Report Title
- Subtitle
- Project Name
- Project ID
- Customer / Program
- Scenario
- Prepared By
- Prepared Date
- Company / Team
- Confidentiality

Logo:
- Use Application / Company Logo
- Hide Logo

Report display overrides do not modify project master data.

---

# 8. Page Layout

V1:

- Page Size: A4 / Letter
- Orientation: Portrait / Landscape
- Default: A4 Portrait

Report content language:

- English
- Bilingual English / Traditional Chinese
- Default: Bilingual

---

# 9. Header / Footer

Options:

- Show Project Name
- Show Scenario
- Show Report Title
- Show Page Number
- Show Prepared Date
- Show Confidentiality

Footer optional text:
`Confidential — Engineering Use Only`

---

# 10. Report Preview Canvas

Center workspace must show paginated report preview.

Features:

- Page thumbnails
- Current page
- Zoom
- Fit Width
- Fit Page
- Previous Page
- Next Page

Recommended implementation:
HTML/CSS semantic report renderer.

Do not generate PDF inside Screen 11.


---

# 11. Page Thumbnails / Outline

Left panel tabs:

```text
Outline
Pages
```

Outline shows:

- section title
- included/excluded state
- required badge
- reorder affordance

Pages shows:

- page number
- page title
- thumbnail

Click page → focus preview.

---

# 12. Report Sections — Data Rules

All engineering values are read-only and come from Screen 10 snapshot or its referenced source results.

11 MUST NOT recalculate:

- temperatures
- margins
- bottleneck scores
- sensitivity improvements
- P95 / histogram statistics
- energy balance
- Overall Status

---

# 13. Project & Scenario Summary

Show:

- Project Name
- Project ID
- Customer / Program
- Stage
- Scenario
- Ambient
- Wind
- Solar
- Power Scale
- Result Mode
- Solver Status
- Last Solved

---

# 14. Overall Thermal Status Section

Read only from Screen 10 snapshot.

Show:

- Overall Status
- Max Temperature
- Worst Thermal Margin
- Top Bottleneck
- Energy Balance
- Total Power

If source Overall Status is WARNING / FAIL / INCOMPLETE:
render a report warning callout.

---

# 15. Critical Components Section

Default rows:

`Top 5`

Options:

```text
Top 5
Top 10
All
```

Default sort:

`Lowest Margin`

Columns:

- Component
- Node
- Temperature
- Limit Type
- Limit
- Margin
- Status

Do not recompute ranking.

---

# 16. Thermal Network Summary Section

Include:

- read-only solved network snapshot
- Node Count
- Edge Count
- Generated Heat
- Rejected Heat
- Energy Balance
- highlighted critical path if available

No topology editing.

If Screen 08 data unavailable:
highlight hottest-component path instead of fabricating a bottleneck path.

---

# 17. Bottleneck Analysis Summary Section

Read from snapshot / current Screen 08 result reference.

Default:

`Top 3`

Options:

```text
Top 3
Top 5
Top 10
```

Columns:

- Rank
- Edge
- Score
- Classification
- Sensitivity Improvement
- Affected Components
- Confidence

If unavailable:

`Bottleneck Analysis Not Available`

Do not fabricate rows.

---

# 18. Temperature Distribution Summary Section

Compact summary:

- Average Temperature
- P95 Temperature
- Nodes Above Warning
- Min Temperature
- Max Temperature
- Temperature Range Bar

Options:

- Include Histogram Snapshot
- Include Hot Node Table

Important:

11 may embed an **existing Screen 09 chart snapshot**.

11 MUST NOT:
- recalculate histogram bins
- regenerate percentile statistics from raw values
- expose Screen 09 analytical controls

---

# 19. Solver & Energy Quality Section

Show:

- Solver Status
- Solved Nodes
- Solved Edges
- Generated Heat
- Rejected Heat
- Residual
- Energy Error %
- Quality

Thresholds inherited from Screen 07.

---

# 20. Data Completeness & Confidence Section

Show:

- Components With Limits
- Components Without Limits
- Rth Source Counts
- Low-confidence Critical Edges
- Result Mode
- External CFD Validation

If Screen 03 is deferred:

`FloTHERM Validation: Deferred`

This is not a failure by itself.

---

# 21. Engineering Actions / Conclusions

Default read-only content:

- Engineering Action Summary from Screen 10
- Recommended Next Action
- Open Warnings

Additional report-only fields:

- Engineer Notes
- Conclusion Notes

These notes must be clearly marked as:

`Report-only text`

They do not modify engineering results.

---

# 22. Appendix: Source & Traceability

Show summary:

- Component data-source counts
- Rth source counts
- Scenario ID
- Solver Version
- Snapshot ID
- Snapshot Created Time
- Report Config ID
- External Mapping Status

Detailed raw traceability exports belong to Screen 12.

---

# 23. Section Inspector

Selecting a section opens right Inspector.

Tabs:

```text
Content
Display
Data
Notes
```

---

# 24. Inspector — Content

Examples:

Critical Components:

- Row Count
- Sort Mode
- Show Limit Type
- Show Margin
- Show Status

Bottleneck:

- Top N
- Show Score
- Show Sensitivity
- Show Confidence

Temperature Distribution:

- Show Range Summary
- Include Histogram Snapshot
- Include Hot Node Table

---

# 25. Inspector — Display

Options:

- Section Title
- Page Break Before
- Keep Table Together
- Compact Spacing

Avoid free-form word-processor behavior in V1.

---

# 26. Inspector — Data

Read-only:

- Snapshot Source
- Snapshot Status
- Source Screen
- Last Updated

---

# 27. Inspector — Notes

Optional:

- Section Note

Stored in report config only.

---

# 28. Snapshot Freshness Banner

Top banner shows:

```text
Snapshot: CURRENT
Snapshot: WARNING
Snapshot: STALE
```

Also show:

- Created At
- Scenario
- Result Mode

If stale:
strong warning styling.

---

# 29. Report Readiness

Screen 11 readiness enum:

```text
PREVIEW_READY
EXPORT_READY
WARNING
BLOCKED
```

PREVIEW_READY:
preview can render.

EXPORT_READY:
snapshot current + required sections valid.

WARNING:
snapshot current, but source Report Readiness from Screen 10 is WARNING,
or optional supporting sections are missing.

BLOCKED:
snapshot missing/stale or required report content invalid.

---

# 30. Thermal FAIL Does Not Block Reporting

If Overall Status = FAIL:

- preview remains valid
- failure callout is shown
- export may still be prepared if snapshot is current

Reason:
a failure report is valid engineering output.

Blocking is about stale/missing/inconsistent data, not unfavorable thermal performance.

---

# 31. Incomplete Data

If Overall Status = INCOMPLETE:

show:

`Incomplete Thermal Data`

Usually readiness = WARNING,
unless required source data is missing.

---

# 32. Prepare for Export

Button:

`Prepare for Export`

Screen 11 creates metadata only:

```ts
type ReportExportPayload = {
  reportConfigId: string;
  snapshotId: string;
  projectId: string;
  scenarioId: string;

  pageSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  languageMode: 'english' | 'bilingual';

  sectionOrder: string[];
  includedSections: string[];

  readiness: 'EXPORT_READY' | 'WARNING' | 'BLOCKED';
  generatedAt: string;
};
```

No file bytes are generated in Screen 11.

---

# 33. Report Configuration Actions

Actions:

- Save Report Layout
- Save As Template
- Reset Layout

Save As Template may store:

- section inclusion
- section order
- page settings
- header/footer
- display options

It MUST NOT store:

- project-specific temperatures
- scenario result values
- component IDs
- bottleneck values
- thermal solution values

---

# 34. Default Template

Built-in V1:

`Thermal Engineering Summary`

Future template names may be reserved, but not implemented unless specified.

---

# 35. Report Validation

Blocking:

- Snapshot missing
- Snapshot stale
- Required section missing
- Report title empty
- Invalid page configuration
- Required section references unavailable data

Warnings:

- Source Overall Status = WARNING
- Some components lack limits
- Bottleneck section unavailable
- Temperature distribution section unavailable
- Analytical-only / no CFD validation
- Low-confidence critical edges

---

# 36. Validation Panel

Show:

- Snapshot
- Required Sections
- Project Metadata
- Scenario Metadata
- Solver Summary
- Report Notes
- Export Payload

Each status:

```text
READY
WARNING
MISSING
STALE
```

---

# 37. No Recalculation Rule

11 MUST NOT:

- solve network
- recalculate node temperatures
- recalculate bottleneck score
- run sensitivity
- recalculate temperature statistics
- change Overall Status
- change solver quality result

---

# 38. No Export Rule

11 MUST NOT:

- generate PDF
- generate CSV
- generate JSON
- export PNG files
- generate ZIP
- choose export destination

All actual artifact export belongs to Screen 12.

---

# 39. No Thermal Input Editing

11 must not edit:

- Power
- Rth
- Boundary
- Thermal Limits
- Topology
- Scenario physics

Only navigate back to relevant screen.

---

# 40. Page Count / Zoom / Preview Modes

Estimated Page Count is derived from rendered layout.

Zoom:

```text
50%
75%
100%
125%
Fit Width
Fit Page
```

Default:

`Fit Width`

Preview modes:

```text
Document
Outline
```

No WYSIWYG freeform canvas.

---

# 41. Formal Layout

Recommended:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb + 11 Report Preview + Snapshot / Readiness KPI                   │
├────────────────┬──────────────────────────────────────────┬──────────────────┤
│ LEFT           │ CENTER                                   │ RIGHT            │
│ Template       │ Paginated Report Preview                │ Section Inspector│
│ Outline/Pages  │ Page Toolbar                            │ Snapshot Status  │
│ Thumbnails     │ Current Report Page                     │ Readiness        │
│                │                                          │ Validation       │
├────────────────┴──────────────────────────────────────────┴──────────────────┤
│ Bottom Actions / Status                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# 42. Header KPI Cards

Formal UI must show:

- Snapshot Status
- Overall Status
- Report Readiness
- Page Count
- Language
- Page Size

Example:

```text
CURRENT
WARNING
WARNING
8
Bilingual
A4 Portrait
```

---

# 43. Bottom Actions

- Back to Results Overview
- Refresh Snapshot Status
- Save Report Layout
- Prepare for Export
- Continue to Export Center

Continue → Screen 12.

Condition:

`Report Readiness != BLOCKED`

If WARNING:
confirmation required.

---

# 44. Bottom Status Bar

Show:

- Project
- Scenario
- Snapshot Status
- Overall Status
- Report Readiness
- Report Template
- Last Saved
- User

---

# 45. Empty / Loading / Read-only

Empty:

`No report snapshot available. Prepare one in Screen 10.`

CTA:
`Go to Results Overview`

Loading:

- outline skeleton
- page skeleton
- inspector disabled

Never retain previous-scenario report content.

Read-only:

Can:
- view pages
- navigate outline
- zoom
- inspect source metadata

Cannot:
- change layout
- edit report notes
- save template
- prepare export payload

---

# 46. Store Contracts

```text
overviewStore      [read snapshot]
projectStore       [read metadata]
scenarioStore      [read metadata]
reportStore        [read/write config]
solverStore        [read freshness metadata]
analysisStore      [read freshness metadata]
distributionStore  [read freshness metadata]
```

Thermal master data is not stored in `reportStore`.

---

# 47. Suggested Modules

```text
src/
  screens/11-report-preview/
    ReportPreviewView.tsx
    ReportHeaderSummary.tsx
    ReportOutlinePanel.tsx
    PageThumbnailPanel.tsx
    ReportPreviewCanvas.tsx
    ReportSectionInspector.tsx
    ReportReadinessPanel.tsx
    SnapshotStatusPanel.tsx
    ReportValidationPanel.tsx

  report/
    reportTypes.ts
    defaultTemplate.ts
    reportConfig.ts
    sectionRegistry.ts
    snapshotAdapter.ts
    reportValidator.ts
    exportPayloadBuilder.ts
```

---

# 48. Required Hover Tooltips

Compact English-only labels requiring zh-TW engineering explanation:

- Snapshot Status
- Report Readiness
- Section Order
- Page Break Before
- Keep Table Together
- Snapshot Source
- Source Screen
- Language Mode
- Prepare for Export
- Export Payload
- Analytical-only
- External CFD Validation

Example:

`Snapshot Status`

Tooltip:

`報告快照狀態：確認本報告引用的 Screen 10 結果是否仍與目前 Scenario、Solver、08/09 分析及 thermal limits 一致。`



---

# 49. Acceptance Criteria

- AC-11-01 Requires ResultsOverviewSnapshot.
- AC-11-02 Snapshot CURRENT / STALE / MISSING / WARNING works.
- AC-11-03 Stale snapshot visibly warned.
- AC-11-04 Exact fixed App Shell.
- AC-11-05 Exact Sidebar 01–12.
- AC-11-06 03 FloTHERM Deferred.
- AC-11-07 11 Report Preview active.
- AC-11-08 Default report template works.
- AC-11-09 Section inclusion/exclusion works.
- AC-11-10 Section reorder works.
- AC-11-11 Cover fields work.
- AC-11-12 Page Size A4/Letter works.
- AC-11-13 Portrait/Landscape works.
- AC-11-14 English/Bilingual report language works.
- AC-11-15 Header/Footer controls work.
- AC-11-16 Page thumbnails work.
- AC-11-17 Zoom / Fit Width / Fit Page works.
- AC-11-18 Overall Status section reads snapshot only.
- AC-11-19 Critical Components section reads snapshot only.
- AC-11-20 Bottleneck summary reads snapshot only.
- AC-11-21 Distribution summary reads snapshot only.
- AC-11-22 Existing 09 histogram snapshot may be embedded without recalculation.
- AC-11-23 Solver quality reads snapshot only.
- AC-11-24 Data completeness reads snapshot only.
- AC-11-25 Engineering Actions read snapshot only.
- AC-11-26 Engineer report-only notes work.
- AC-11-27 Source & Traceability appendix works.
- AC-11-28 Section Inspector works.
- AC-11-29 Report Readiness PREVIEW_READY/EXPORT_READY/WARNING/BLOCKED works.
- AC-11-30 FAIL thermal status does not automatically block reporting.
- AC-11-31 Snapshot stale/missing blocks export preparation.
- AC-11-32 Save Report Layout works.
- AC-11-33 Save As Template excludes project result data.
- AC-11-34 Prepare for Export creates metadata payload only.
- AC-11-35 No PDF/CSV/JSON/PNG/ZIP actual export in 11.
- AC-11-36 No solver/sensitivity/statistics recalculation.
- AC-11-37 No thermal input editing.
- AC-11-38 English-primary application UI rule enforced.
- AC-11-39 Compact English-only fields have zh-TW engineering tooltips.
- AC-11-40 Native title alone is not accepted.
- AC-11-41 Continue → Screen 12 when not BLOCKED.

---

# 50. Developer Test Cases

## Test A — Current Warning Snapshot

Input:

```text
Snapshot CURRENT
Overall Status WARNING
Report Readiness from 10 WARNING
```

Expected:

```text
Preview available
Report Readiness WARNING
Prepare for Export allowed with confirmation
```

## Test B — Stale Snapshot

Input:

```text
snapshot created
then Screen 07 re-solved
```

Expected:

```text
Snapshot STALE
Preview visibly marked stale
Prepare for Export blocked
```

## Test C — FAIL Result

Input:

```text
Overall Status FAIL
Snapshot CURRENT
```

Expected:

```text
Preview allowed
Failure callout included
Export not blocked solely due to FAIL
```

## Test D — No Bottleneck Data

Input:

```text
08 unavailable
```

Expected:

```text
Bottleneck section shows Not Available
Validation WARNING
No fabricated ranking
```

## Test E — Save Template

Expected:

Template stores layout/section settings only.

It must not contain:
- temperatures
- component IDs
- scenario result values
- bottleneck scores

---

# 51. UI ↔ MD Audit Checklist

Formal `11_Report_Preview.png` must show:

## Shell
- [ ] Fixed App Shell
- [ ] Exact Sidebar 01–12
- [ ] 03 FloTHERM Deferred
- [ ] 11 Report Preview active

## Header KPI
- [ ] Snapshot Status
- [ ] Overall Status
- [ ] Report Readiness
- [ ] Page Count
- [ ] Language
- [ ] Page Size

## Left Panel
- [ ] Report Template
- [ ] Outline / Pages tabs
- [ ] Section list
- [ ] Included / excluded state
- [ ] Reorder affordance
- [ ] Page thumbnails

## Center
- [ ] Paginated report preview
- [ ] Current page / page count
- [ ] Previous / Next
- [ ] Zoom
- [ ] Fit Width / Fit Page
- [ ] Report page reflects snapshot values

## Right
- [ ] Section Inspector
- [ ] Content / Display / Data / Notes tabs
- [ ] Snapshot Status
- [ ] Report Readiness
- [ ] Validation

## Report Content
- [ ] Project & Scenario Summary
- [ ] Overall Thermal Status
- [ ] Critical Components
- [ ] Thermal Network Summary
- [ ] Bottleneck Summary
- [ ] Temperature Distribution Summary
- [ ] Solver & Energy Quality
- [ ] Data Completeness & Confidence
- [ ] Engineering Actions
- [ ] Source & Traceability Appendix

## Actions
- [ ] Back to 10
- [ ] Refresh Snapshot Status
- [ ] Save Report Layout
- [ ] Prepare for Export
- [ ] Continue to 12

## Forbidden
- [ ] No solver controls
- [ ] No Rth sensitivity controls
- [ ] No Histogram Bin analytical controls
- [ ] No actual PDF/CSV/JSON/PNG/ZIP export button
- [ ] No export destination
- [ ] No fake FloTHERM result
- [ ] No thermal input editing

## Language
- [ ] bilingual visible where space allows
- [ ] compact English labels have hover affordance
- [ ] zh-TW engineering tooltip exists in JSON

---

# 52. Final Principle

**11 的工作是「把 10 的 current engineering snapshot 排成可預覽的報告」，不是重新分析，也不是實際匯出。所有熱分析數值都必須追溯回 07/08/09/10；真正產生 PDF、CSV、JSON、圖片與壓縮包，全部留給 12 Export Center。**
