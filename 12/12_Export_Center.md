# 12 — Export Center / 匯出中心
## 5G FR1 Thermal Network Visualizer
### Screen Functional Specification for Codex

**Document ID:** `12_Export_Center`  
**Parent Architecture:** `00_Product_Vision_and_Architecture.md`  
**Previous:** `11_Report_Preview.md`  
**Deferred:** `03_FloTHERM_Import`  
**Priority:** P0 — Final Artifact Export / Package Delivery  

---

# 0. Screen Responsibility

Screen 11 已準備 `ReportExportPayload`。

Screen 12 的任務是：

> **把目前可用的 Report / Thermal Network / Result Data 實際輸出成檔案。**

12 負責：

- PDF report export
- HTML report export [optional if implemented]
- Temperature CSV export
- Thermal Network JSON export
- Thermal Network CSV export
- Bottleneck CSV export
- Scenario / Boundary JSON export
- Chart / Snapshot PNG export
- Engineering Package ZIP export
- Traceability Manifest
- Filename rules
- Export validation
- Export queue / progress
- Export history
- Local download

12 不負責：

- 修改報告版面 → 11
- 修改 Results Overview → 10
- Temperature analytics → 09
- Bottleneck sensitivity → 08
- Solve network → 07
- Boundary editing → 06
- Topology editing → 05
- FloTHERM import → 03 later

---

# 1. Mandatory Language Rule — Screens 09–12

English is primary.

When space allows:

`Export Center / 匯出中心`

When compact:

`Artifact`, `Format`, `Validation`, `Destination`

Visible English + Traditional Chinese engineering explanation on hover.

Required:
- `FieldLabel / BilingualTooltip / EngineeringInfo`
- native browser `title=""` alone is insufficient
- tooltip must explain engineering meaning

---

# 2. Fixed App Shell

Sidebar exact order:

1. Project Info
2. Import Components
3. FloTHERM Import [Deferred]
4. Component Manager
5. Thermal Path Builder
6. Boundary Conditions
7. Thermal Network
8. Bottleneck Analysis
9. Temperature Distribution
10. Results Overview
11. Report Preview
12. Export Center ← Active

Do not add, rename, reorder screens.

---

# 3. Export Prerequisites

Different artifacts have different prerequisites.

## PDF Report
Requires:
- `ReportExportPayload`
- Report Readiness != BLOCKED

## Thermal Network JSON / CSV
Requires:
- valid `networkStore`
- Screen 11 not required

## Temperature CSV
Requires:
- current Screen 07 solution

## Bottleneck CSV
Requires:
- current Screen 08 analysis

## Scenario / Boundary JSON
Requires:
- scenario + boundary configuration

## Package ZIP
Includes only selected artifacts that individually pass validation.

---

# 4. Per-Artifact Readiness

```text
READY
WARNING
BLOCKED
NOT_AVAILABLE
EXPORTING
EXPORTED
FAILED
```

- READY: may export
- WARNING: may export after confirmation
- BLOCKED: source invalid/stale
- NOT_AVAILABLE: source does not exist
- EXPORTING: generating
- EXPORTED: completed
- FAILED: generation error

---

# 5. Global Export Status

```text
READY
WARNING
PARTIAL
EXPORTING
COMPLETE
FAILED
```

`PARTIAL` means some artifacts succeeded while others failed/unavailable.

---

# 6. Main Layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb + 12 Export Center + Export Status                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ A. Export KPI Cards                                                         │
├───────────────────────────┬────────────────────────────────┬─────────────────┤
│ B. Artifact Selection     │ C. Export Configuration       │ F. Validation   │
│ D. Package Presets        │ D. Export Queue / Progress    │ G. History      │
│                           │ E. Package Builder             │                 │
├───────────────────────────┴────────────────────────────────┴─────────────────┤
│ H. Bottom Actions / Status                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# 7. Top KPI Cards

Formal UI must show:

- Export Status
- Ready Artifacts
- Warnings
- Blocked
- Package Size Estimate
- Last Export

---

# 8. Artifact Catalog

V1:

- PDF Report
- HTML Report [optional]
- Temperature Results CSV
- Thermal Network JSON
- Thermal Network CSV
- Bottleneck Analysis CSV
- Scenario & Boundary JSON
- Charts / Snapshots PNG
- Engineering Package ZIP
- Traceability Manifest JSON

---

# 9. PDF Report Export

Source:
- Screen 11 ReportExportPayload
- ResultsOverviewSnapshot
- Report Config

Output:
`.pdf`

Must preserve:
- page size
- orientation
- language
- section order
- included sections
- header/footer

12 must not change report layout.

---

# 10. Temperature Results CSV

Columns:

- Project
- Scenario
- Node ID
- Node Name
- Component
- Category
- Node Type
- Zone
- Temperature C
- Limit Type
- Limit C
- Margin C
- Result Source
- Solved At

---

# 11. Thermal Network JSON

Export canonical graph:

- Nodes
- Edges
- Zones
- Template Bindings
- Layout
- Active Rth Source
- Rth provenance
- External mapping metadata
- Schema Version

Preserve unknown metadata fields.

---

# 12. Thermal Network CSV

Export two logical tables:

`nodes.csv`

Columns:
- Node ID
- Name
- Type
- Component
- Zone
- Power W
- Limit Type
- Limit C
- Temperature C
- Scenario

`edges.csv`

Columns:
- Edge ID
- From
- To
- Type
- Method
- Active Rth
- Rth Source
- Q W
- Delta T C
- Confidence
- Enabled

If no current solution, Q / Delta T may be blank.

---

# 13. Bottleneck CSV

Source: current Screen 08 analysis.

Columns:

- Rank
- Edge ID
- Edge
- Path
- Type
- Rth
- Q
- Delta T
- Sensitivity Improvement
- Margin Impact
- Affected Components
- Score
- Classification
- Confidence
- Source
- Reduction %
- Target Metric

Stale 08 => BLOCKED.

---

# 14. Scenario & Boundary JSON

Export:

- Scenario ID
- Ambient
- Wind
- Wind Direction
- Solar
- Power Scale
- Boundary Overrides
- Boundary Models
- Boundary Sources
- Scenario Metadata

---

# 15. PNG Snapshots

Export only already supported views:

- 07 Solved Thermal Network
- 08 Bottleneck Overlay
- 09 Temperature Histogram
- 09 Component Bars [if available]
- 10 Results Overview
- 11 Report Page Preview [optional]

Do not invent new analytical views in 12.


---

# 16. Engineering Package ZIP

Recommended structure:

```text
/report/
  thermal_report.pdf

/data/
  temperatures.csv
  bottlenecks.csv
  network_nodes.csv
  network_edges.csv
  scenario_boundary.json
  thermal_network.json

/images/
  thermal_network.png
  bottleneck_overlay.png
  temperature_histogram.png
  results_overview.png

/traceability/
  manifest.json
```

Only include selected + valid artifacts.

---

# 17. Traceability Manifest

Every Engineering Package ZIP should include:

`manifest.json`

Suggested schema:

```ts
type ExportManifest = {
  packageId: string;
  projectId: string;
  scenarioId: string;
  createdAt: string;
  appVersion: string;
  schemaVersion: string;

  reportSnapshotId?: string;
  reportConfigId?: string;
  solverVersion?: string;

  artifacts: Array<{
    type: string;
    filename: string;
    status: 'included' | 'warning';
    sourceScreen: string;
    sourceVersion?: string;
    checksum?: string;
  }>;

  warnings: string[];
};
```

---

# 18. Filename Convention

Default:

```text
<ProjectID>_<Scenario>_<Artifact>_<YYYYMMDD_HHmm>
```

Examples:

```text
CBNG_FR1_RRU_EVT2_55C_0mps_Thermal_Report_20260812_1250.pdf
CBNG_FR1_RRU_EVT2_55C_0mps_Temperature_Results_20260812_1250.csv
```

Sanitize:

- spaces → `_`
- invalid filesystem chars removed
- length capped
- V1 prefer safe ASCII slug

---

# 19. Filename Preview

Show:

`Filename Preview`

User may override base filename.

Override does not change project/scenario master data.

---

# 20. Destination

V1 default:

`Browser Download`

Optional:

`Choose Folder`

only if File System Access API is supported.

Fallback must always be:

`Browser Download`

No server storage required.

---

# 21. Package Builder

Selectable artifacts:

- PDF Report
- Temperature CSV
- Network JSON
- Network CSV
- Bottleneck CSV
- Scenario JSON
- PNG Snapshots
- Manifest

Preset:

`Engineering Package`

selects all recommended READY artifacts.

---

# 22. Artifact Selection States

Checkbox states:

- Selected
- Unselected
- Disabled
- Warning

BLOCKED / NOT_AVAILABLE:
disabled + reason.

WARNING:
selectable + warning badge.

---

# 23. Export Presets

V1 presets:

- Engineering Package
- Report Only
- Data Only
- Images Only
- Custom

Engineering Package:
all recommended READY/WARNING artifacts.

Report Only:
PDF + manifest.

Data Only:
CSV/JSON + manifest.

Images Only:
available PNG snapshots + manifest.

---

# 24. Global Export Configuration

Fields:

- Base Filename
- Timestamp
- Include Project ID
- Include Scenario ID
- Overwrite Handling
- ZIP Compression

Overwrite Handling:

- Auto Rename
- Confirm

Browser Download defaults to Auto Rename.

---

# 25. Per-Artifact Settings

## PDF
`Use Screen 11 Layout`

No page-layout editing here.

## CSV
- delimiter = comma
- encoding
- include units in header
- decimal precision

## JSON
- Pretty
- Compact

Default = Pretty.

## PNG
- 1x
- 2x

Default = 2x.

---

# 26. Decimal Precision

CSV numeric precision options:

- 2
- 3
- 4

Default:

`3`

Only affects serialized CSV, not internal stored precision.

---

# 27. CSV Encoding

Default:

`UTF-8 with BOM`

Recommended for Excel + Traditional Chinese.

Alternative:

`UTF-8`

---

# 28. Export Queue

Columns:

- Artifact
- Format
- Status
- Progress
- Filename
- Size
- Action

Statuses:

READY / EXPORTING / EXPORTED / FAILED.

---

# 29. Progress

For multi-artifact export:

```text
Preparing 2 / 7
Rendering PDF
Writing CSV
Generating ZIP
```

Show progress bar.

Support:

`Cancel Export`

Cancel stops remaining work safely.

---

# 30. Failure Isolation

One artifact failure must not crash the entire export.

Example:

```text
PDF FAILED
CSV EXPORTED
JSON EXPORTED
ZIP PARTIAL
```

Global/package status:

`PARTIAL`

If package still generated, manifest records warnings/failures.

---

# 31. Export Validation

Blocking examples:

- PDF payload missing
- report snapshot stale
- temperature solution stale
- bottleneck analysis stale
- network schema invalid
- serialization failure
- filename empty
- no artifact selected

Warnings:

- Analytical-only
- no FloTHERM validation
- some components lack limits
- low-confidence Rth
- optional image unavailable

---

# 32. Readiness Panel

Show source readiness:

- Report
- Thermal Solution
- Bottleneck Analysis
- Temperature Distribution
- Network Data
- Scenario / Boundary
- Snapshots

Each:

READY / WARNING / BLOCKED / NOT AVAILABLE.

---

# 33. Export History

V1 session history:

- Time
- Package / Artifact
- Status
- Filename
- Size

Actions:

- Download Again [if blob/object URL still available]
- Copy Filename
- View Manifest

History may be session-only.

Do not claim persistence across browser refresh unless implemented.

---

# 34. Export Result Panel

After success show:

`Export Complete`

with:

- exported file count
- package filename
- total size
- warnings
- download buttons

---

# 35. Local Export / Privacy

V1:

- artifacts generated locally in browser
- project data is not automatically uploaded externally
- no external service required

UI can show:

`Local Export`

---

# 36. Shared DB Safety

File generation must not mutate shared thermal DB.

Allowed optional metadata:

- lastExportAt
- lastExportPackageId
- lastExportArtifactTypes

under dedicated namespaced field.

Never store file bytes in shared DB.
Never overwrite unknown sibling fields.

---

# 37. FloTHERM Deferred Compatibility

Screen 03 remains Deferred.

12 may later export real:

- external mapping metadata
- FloTHERM result slots

But current V1 must not fabricate FloTHERM values.

Manifest may state:

`External CFD Validation: Deferred`

---

# 38. PDF Renderer

Recommended architecture:

```text
Screen 11 semantic report DOM/config
→ PDF renderer
```

Possible implementations:

- browser print pipeline
- pdf-lib
- jsPDF / HTML conversion

Requirement:

PDF must match Screen 11 semantic config.

Do not rebuild a different report in 12.

---

# 39. CSV / JSON Generators

Dedicated modules:

```text
exportTemperatureCsv.ts
exportNetworkCsv.ts
exportNetworkJson.ts
exportBottleneckCsv.ts
exportScenarioJson.ts
```

Do not bury serialization logic inside React UI components.

---

# 40. ZIP Generator

Recommended:

`JSZip`

Logic:

`packageBuilder.ts`

Manifest is generated before ZIP finalization.

---

# 41. Optional Checksum

Optional V1:

`SHA-256`

Use Web Crypto API.

If not implemented:
omit checksum.

Never fabricate checksum.

---

# 42. WARNING Export Rule

If selected artifact status = WARNING:

show confirmation before export.

Example:

`This report contains warnings or incomplete supporting analyses. Export anyway?`

Manifest records warnings.

---

# 43. BLOCKED Report Rule

If Report Readiness = BLOCKED:

PDF is unavailable.

Independent artifacts may still export if valid.

Example:
Network JSON may remain READY.

---

# 44. Thermal FAIL Does Not Block Export

Overall Thermal Status = FAIL is valid engineering output.

Do not block export solely due to FAIL.

Blocking depends on stale/missing/inconsistent data.

---

# 45. Stale Solution Handling

If Screen 07 = DIRTY:

Temperature CSV:
`BLOCKED`

Bottleneck CSV:
`BLOCKED`

Network JSON:
may remain exportable as configuration,
with:

`solutionStatus = STALE`

if selected.

---

# 46. Package Warning Summary

Before export show warnings:

```text
2 warnings
- 3 components missing thermal limits
- External CFD validation deferred
```

If selected artifacts contain WARNING:
confirmation required.

---

# 47. Export Session Consistency

At export start freeze one:

`ExportSession`

All artifacts in that session must use the same:

- project revision
- scenario revision
- solver solution
- analysis result
- distribution result
- report snapshot/config

Do not mix versions during a long export.

---

# 48. ExportSession Schema

```ts
type ExportSession = {
  id: string;
  startedAt: string;

  projectId: string;
  scenarioId: string;

  projectRevision?: string;
  solverSolutionId?: string;
  analysisId?: string;
  distributionId?: string;
  reportSnapshotId?: string;
  reportConfigId?: string;

  selectedArtifacts: ExportArtifactRequest[];

  status:
    | 'READY'
    | 'EXPORTING'
    | 'COMPLETE'
    | 'PARTIAL'
    | 'FAILED'
    | 'CANCELLED';
};
```

---

# 49. Artifact Result Schema

```ts
type ExportArtifactResult = {
  id: string;
  type: ExportArtifactType;
  filename: string;

  status:
    | 'EXPORTED'
    | 'WARNING'
    | 'FAILED'
    | 'SKIPPED';

  mimeType: string;
  sizeBytes?: number;
  checksumSha256?: string;

  warnings: string[];
  error?: string;
};
```



---

# 50. Formal Screen Actions

Main actions:

- Validate Selected
- Export Selected
- Export Engineering Package
- Clear Queue

Bottom actions:

- Back to Report Preview
- Save Export Preset
- Export Selected
- Finish

Recommended V1:

`Finish → Screen 10 Results Overview`

---

# 51. Status Bar

Show:

- Project
- Scenario
- Export Status
- Selected Artifacts
- Report Readiness
- Result Mode
- Last Export
- User

---

# 52. Empty / Loading / Read-only

## Empty
`No exportable artifacts are currently available.`

Actions:
- Go to Report Preview
- Go to Thermal Network

## Loading
- artifact-list skeleton
- validation skeleton
- queue disabled
- no previous-project state retained

## Read-only
Local export remains allowed.

Can:
- select artifact
- validate
- export locally
- view current history

Cannot:
- save preset
- write export metadata

if storage policy is locked.

---

# 53. Export Store

Recommended:

`exportStore`

Stores:

- current export config
- selected artifacts
- export queue
- export session
- current-session history
- artifact results

Does not store permanent file bytes in shared project DB.

---

# 54. Store Contracts

```text
reportStore        [read export payload]
overviewStore      [read snapshot]
solverStore        [read solution]
analysisStore      [read 08]
distributionStore  [read 09]
networkStore       [read graph]
scenarioStore      [read scenario/boundary]
projectStore       [read metadata]
exportStore        [read/write export state]
```

---

# 55. Recommended Modules

```text
src/
  screens/12-export-center/
    ExportCenterView.tsx
    ExportKpiBar.tsx
    ArtifactSelectionPanel.tsx
    ExportConfigurationPanel.tsx
    ExportQueue.tsx
    ExportValidationPanel.tsx
    ExportHistoryPanel.tsx
    ExportResultPanel.tsx

  export/
    exportTypes.ts
    filenameBuilder.ts
    exportValidator.ts
    exportSession.ts
    exportTemperatureCsv.ts
    exportNetworkCsv.ts
    exportNetworkJson.ts
    exportBottleneckCsv.ts
    exportScenarioJson.ts
    exportPngSnapshots.ts
    exportPdfReport.ts
    manifestBuilder.ts
    packageBuilder.ts
```

---

# 56. Required Hover Tooltips

Compact English-only labels requiring zh-TW engineering explanation:

- Export Status
- Artifact
- Package Preset
- Report Readiness
- Traceability Manifest
- Overwrite Handling
- Decimal Precision
- UTF-8 BOM
- Local Export
- Export Session
- Package Warning
- Checksum
- Partial Export

Example:

`Traceability Manifest`

Tooltip:

`追溯資訊清單：記錄本次匯出所使用的 Project、Scenario、Solver、Snapshot、Artifact、版本與警告，便於後續工程驗證與版本追蹤。`

---

# 57. Acceptance Criteria

- AC-12-01 Fixed App Shell.
- AC-12-02 Exact Sidebar 01–12.
- AC-12-03 03 FloTHERM Deferred.
- AC-12-04 12 Export Center active.
- AC-12-05 Artifact catalog works.
- AC-12-06 Per-artifact readiness works.
- AC-12-07 Global export status works.
- AC-12-08 PDF uses Screen 11 config only.
- AC-12-09 PDF blocked when report payload invalid/stale.
- AC-12-10 WARNING report may export with confirmation.
- AC-12-11 FAIL thermal result does not automatically block export.
- AC-12-12 Temperature CSV schema is correct.
- AC-12-13 Network JSON preserves canonical graph/provenance.
- AC-12-14 Network node/edge CSV works.
- AC-12-15 Bottleneck CSV only exports current 08 analysis.
- AC-12-16 Scenario/Boundary JSON works.
- AC-12-17 PNG snapshot export uses existing supported views.
- AC-12-18 Engineering ZIP works.
- AC-12-19 Manifest included in ZIP.
- AC-12-20 Filename convention works.
- AC-12-21 Filename sanitization works.
- AC-12-22 Browser Download works.
- AC-12-23 Optional folder-save falls back gracefully.
- AC-12-24 Blocked/unavailable artifact-selection state works.
- AC-12-25 Export presets work.
- AC-12-26 Decimal precision affects CSV only.
- AC-12-27 UTF-8 BOM option works.
- AC-12-28 Export queue/progress works.
- AC-12-29 Cancel export works safely.
- AC-12-30 Artifact failure is isolated.
- AC-12-31 PARTIAL export state works.
- AC-12-32 Validation panel works.
- AC-12-33 Current-session export history works.
- AC-12-34 Local export does not upload data externally.
- AC-12-35 Shared DB is not mutated by file generation.
- AC-12-36 ExportSession source consistency works.
- AC-12-37 No fake FloTHERM data.
- AC-12-38 No report-layout editing.
- AC-12-39 No solver/sensitivity/distribution recalculation.
- AC-12-40 No thermal input editing.
- AC-12-41 English-primary UI.
- AC-12-42 Bilingual visible where space allows.
- AC-12-43 Compact English-only labels have zh-TW engineering tooltips.
- AC-12-44 Native title alone is not used.
- AC-12-45 Finish → Screen 10.

---

# 58. Developer Test Cases

## Test A — Engineering Package

Input:
- Report WARNING
- 07 SOLVED
- 08 COMPLETE
- 09 READY
- Network valid

Expected:
- warning confirmation
- ZIP exported
- manifest includes warning

## Test B — Stale Report Only

Input:
- Screen 11 snapshot stale
- network valid

Expected:
- PDF BLOCKED
- Network JSON READY
- Scenario JSON READY

## Test C — Thermal FAIL

Input:
- Overall Status FAIL
- snapshot current

Expected:
- PDF allowed
- Temperature CSV allowed
- manifest records FAIL
- export not automatically blocked

## Test D — Stale 07

Input:
- Screen 07 DIRTY

Expected:
- Temperature CSV BLOCKED
- Bottleneck CSV BLOCKED
- Network JSON may export configuration with stale-solution metadata

## Test E — One Artifact Failure

Input:
- PDF rendering fails
- CSV succeeds

Expected:
- CSV EXPORTED
- PDF FAILED
- global/package status PARTIAL
- UI remains functional

## Test F — Filename Sanitization

Input:
`CBNG / EVT2 : 55C*0mps`

Expected:
safe filename slug.

---

# 59. UI ↔ MD Audit Checklist

Formal `12_Export_Center.png` must show:

## Shell
- [ ] Fixed App Shell
- [ ] Exact Sidebar 01–12
- [ ] 03 FloTHERM Deferred
- [ ] 12 Export Center active

## KPI
- [ ] Export Status
- [ ] Ready Artifacts
- [ ] Warnings
- [ ] Blocked
- [ ] Package Size Estimate
- [ ] Last Export

## Left
- [ ] Artifact Catalog
- [ ] PDF Report
- [ ] Temperature CSV
- [ ] Network JSON
- [ ] Network CSV
- [ ] Bottleneck CSV
- [ ] Scenario/Boundary JSON
- [ ] PNG Snapshots
- [ ] Manifest
- [ ] Package Presets

## Center
- [ ] Export Configuration
- [ ] Base Filename
- [ ] Filename Preview
- [ ] CSV Encoding
- [ ] Decimal Precision
- [ ] JSON Pretty/Compact
- [ ] PNG Scale
- [ ] Export Queue
- [ ] Progress
- [ ] Package Builder
- [ ] Package Warning Summary

## Right
- [ ] Readiness / Validation
- [ ] Report
- [ ] Thermal Solution
- [ ] Bottleneck Analysis
- [ ] Temperature Distribution
- [ ] Network Data
- [ ] Scenario / Boundary
- [ ] Snapshots
- [ ] Export History

## Actions
- [ ] Back to 11
- [ ] Validate Selected
- [ ] Export Selected
- [ ] Export Engineering Package
- [ ] Clear Queue
- [ ] Save Export Preset
- [ ] Finish

## Forbidden
- [ ] No report section reorder
- [ ] No report page-layout editing
- [ ] No solver controls
- [ ] No sensitivity controls
- [ ] No histogram recalculation controls
- [ ] No thermal input editing
- [ ] No fake FloTHERM result

## Language
- [ ] bilingual where space allows
- [ ] compact English labels have hover affordance
- [ ] zh-TW engineering tooltip exists

---

# 60. Final Principle

**12 是整個流程的最後一站：它把 07/08/09/10/11 已完成且可追溯的結果真正輸出成 PDF、CSV、JSON、PNG 與 ZIP 工程套件。12 不再分析、不再修改報告、不再變更 thermal model；它只負責「驗證、封裝、匯出、追溯」。**
