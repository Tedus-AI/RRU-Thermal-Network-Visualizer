# 10 — Results Overview / 結果總覽
## 5G FR1 Thermal Network Visualizer
### Screen Functional Specification for Codex

**Document ID:** `10_Results_Overview`  
**Parent Architecture:** `00_Product_Vision_and_Architecture.md`  
**Previous:** `09_Temperature_Distribution.md`  
**Deferred:** `03_FloTHERM_Import`  
**Next:** `11_Report_Preview.md`  
**Priority:** P0 — Engineering Summary / Decision Screen  

---

# 0. Screen Responsibility

Screen 10 的任務是把目前 Active Scenario 的工程結果濃縮成一個可快速判讀的 Thermal Results Overview。

來源：
- 07 Thermal Network：Node Temperature、Edge Q、Edge ΔT、Energy Balance
- 08 Bottleneck Analysis：Bottleneck ranking、Sensitivity、Margin Impact
- 09 Temperature Distribution：Temperature statistics、Hot nodes、Scenario distribution

10 負責：
- Overall Thermal Status
- Scenario / Solver quality summary
- Key thermal KPIs
- Limit compliance summary
- Critical component summary
- Bottleneck summary
- Temperature distribution summary
- Data quality / completeness
- Deterministic engineering action summary
- Report Readiness
- Freeze summary snapshot for 11

10 不負責：
- Re-solve → 07
- Sensitivity → 08
- Histogram / distribution controls → 09
- Report layout → 11
- Export format → 12
- FloTHERM import → 03 later

---

# 1. Mandatory Language Rule — Screens 09–12

English is primary.

When space allows:
`Overall Thermal Status / 整體熱狀態`

When compact:
visible English + Traditional Chinese engineering explanation on hover.

Required:
- use shared `FieldLabel / BilingualTooltip / EngineeringInfo`
- native browser title alone is insufficient
- tooltip must explain engineering meaning, not just translate

---

# 2. Fixed App Shell

Exact Sidebar:
01 Project Info
02 Import Components
03 FloTHERM Import [Deferred]
04 Component Manager
05 Thermal Path Builder
06 Boundary Conditions
07 Thermal Network
08 Bottleneck Analysis
09 Temperature Distribution
10 Results Overview ← Active
11 Report Preview
12 Export Center

Do not add, rename, reorder Sidebar screens.

---

# 3. Prerequisite

Requires Screen 07 current solution = SOLVED or WARNING.

If 07 = DIRTY / FAILED / UNSOLVED:
show blocking banner:
`Current thermal solution is not valid. Return to Screen 07 and solve the active scenario.`

08/09 may be partial:
- Bottleneck Analysis: Not Available
- Temperature Distribution Summary: Not Available
Never fabricate.

---

# 4. Overall Thermal Status

Enum:
PASS
WARNING
FAIL
STALE
INCOMPLETE

Rules:
- PASS: all monitored margins > near-limit threshold, solver valid, energy balance acceptable.
- WARNING: at least one Near Limit, solver warning, low-confidence critical result, partial 08/09, or energy warning.
- FAIL: at least one monitored node over limit or unacceptable solver result quality.
- STALE: 07 solution DIRTY.
- INCOMPLETE: missing required limits/results prevents full judgment.

Near-limit threshold reuses Screen 09:
Margin <= 10°C.

Priority:
STALE > FAIL > INCOMPLETE > WARNING > PASS

---

# 5. Main Layout

Top: Breadcrumb + 10 Results Overview + Scenario + Overall Status

KPI bar:
Overall Status
Max Temperature
Worst Thermal Margin
Top Bottleneck
Energy Balance
Total Power

Main:
- Critical Components
- Top Bottlenecks
- Temperature Distribution Summary
- Solver / Energy Quality
- Data Completeness
- Read-only Network Snapshot

Right:
- Engineering Action Summary
- Recommended Next Action
- Overall Readiness
- Report Readiness

Bottom:
Back to 09
Refresh Overview
Prepare Report Snapshot
Continue to 11

---

# 6. Six KPI Cards

Example:
Overall Status = WARNING
Max Temperature = 103.4°C
Worst Thermal Margin = +13.2°C
Top Bottleneck = RF Left Base → HSK Base
Energy Balance = 0.05%
Total Power = 412.3 W

Top Bottleneck comes from Screen 08.
If unavailable: `Not Available`.

---

# 7. Scenario Summary

Read-only:
Active Scenario
Ambient
Wind
Solar
Power Scale
Solver Status
Last Solved

Actions:
View Boundary Conditions
View Thermal Network

No direct editing in Screen 10.

---

# 8. Critical Components

Default Top 5.

Sort:
Thermal Margin Low → High

Columns:
Component
Node
Temperature
Limit Type
Limit
Margin
Status

Per-component classification:
Margin < 0 → FAIL
0 <= Margin <= 10 → NEAR LIMIT
Margin > 10 → PASS
No valid limit → NO LIMIT

If multiple monitored nodes exist in one component, show minimum-margin node by default.

---

# 9. Top Bottlenecks

Read Screen 08 only.

Show Top 3:
Rank
Edge
Score
Classification
Sensitivity Improvement
Affected Components
Confidence

Do not re-run sensitivity.

If 08 NOT RUN / DIRTY / FAILED:
`Bottleneck analysis is not current.`

Action:
Open Bottleneck Analysis

---

# 10. Temperature Distribution Summary

Read Screen 09 only.

Show:
Average Temperature
P95 Temperature
Nodes Above Warning
Temperature Range
Distribution Row Count

Use compact Temperature Range Bar:
Min ─ Average ─ P95 ─ Max

Do not redraw the 09 histogram.

---

# 11. Solver / Energy Quality

Show:
Solver Status
Solved Nodes
Solved Edges
Generated Heat
Rejected Heat
Energy Residual
Energy Error %

Quality:
<0.5% GOOD
0.5–2.0% WARNING
>2.0% ERROR

---

# 12. Data Completeness

Show:
Components With Limits
Components Without Limits
Edges by Rth Source
Low-confidence Critical Edges
External CFD Validation

Rth source counts:
Analytical
Manual
Measurement
FloTHERM

When 03 unavailable:
FloTHERM = 0 / Deferred

Do not fabricate.

---

# 13. Network Snapshot

Read-only compact solved thermal network.

Show:
Heat Sources
Shared Base
HSK
Boundary
Critical path highlight

Default highlight:
Top Bottleneck path.
If 08 unavailable:
hottest component path.

Actions:
Open Thermal Network
Open Bottleneck Analysis

No editing.

---

# 14. Engineering Action Summary

Deterministic rule-based text only.

Inputs:
Overall Status
Worst Margin
Top Bottleneck
Bottleneck Type
Data Confidence
Solver Quality

Example:
1. FPGA is the lowest-margin monitored component (+13.2°C).
2. RF Left Base → HSK Base is the highest-value improvement candidate.
3. Shared spreading path improvement is projected by Screen 08 to affect 6 components.
4. Solver energy balance is good at 0.05%.

No LLM dependency required in V1.
Never fabricate improvement if 08 did not calculate it.

---

# 15. Recommended Next Action

Enum:
No Immediate Action
Review Near-Limit Component
Review Failed Component
Review Bottleneck
Re-Solve Network
Complete Missing Limits
Run Bottleneck Analysis
Review Data Confidence

Show one Primary Recommendation.

---

# 16. Overall Readiness

Checklist:
Current solver result
Energy balance
Thermal limits coverage
Bottleneck analysis
Temperature distribution
Data confidence

Each:
READY
WARNING
MISSING
STALE

---

# 17. Report Readiness

Enum:
READY
WARNING
BLOCKED

READY:
current 07 result valid and not stale.

WARNING:
current result usable but partial 08/09, missing limits, or confidence issues.

BLOCKED:
07 stale / failed / no valid solution.


---

# 18. Prepare Report Snapshot

Action:
`Prepare Report Snapshot`

Creates current summary metadata for Screen 11.

It does NOT:
- generate PDF
- choose page layout
- choose export format

Snapshot schema:

```ts
type ResultsOverviewSnapshot = {
  projectId: string;
  scenarioId: string;
  createdAt: string;
  overallStatus: OverallThermalStatus;

  kpis: {
    maxTemperatureC: number;
    worstMarginC?: number;
    energyErrorPercent: number;
    totalPowerW: number;
  };

  criticalComponents: CriticalComponentSummary[];
  bottlenecks?: BottleneckSummary[];
  distribution?: TemperatureSummary;
  solverQuality: SolverQualitySummary;
  actionSummary: string[];
  readiness: ReportReadiness;
};
```

---

# 19. Snapshot Invalidation

Any change to:
- solver solution
- scenario
- Screen 08 analysis
- Screen 09 distribution dataset
- component thermal limits

marks the prior snapshot STALE.

Screen 11 must know whether the snapshot is current.

---

# 20. Result Mode Badge

Possible modes:
Analytical
Hybrid
FloTHERM-Calibrated
Measurement-Validated

V1 current:
Analytical

Do not show Hybrid / FloTHERM as current unless those data truly exist.

FloTHERM absence does not automatically mean FAIL.

Data Confidence can show:
`Analytical-only`.

---

# 21. Partial / Stale Handling

If 07 DIRTY:
- Overall Status = STALE
- Report Readiness = BLOCKED
- old values may be visibly retained only with STALE badge/watermark
- primary action = Go to Thermal Network

If 08 unavailable:
- Top Bottleneck = Not Available
- Recommended action may be Run Bottleneck Analysis

If 09 unavailable:
- Distribution Summary = Not Available
- Recommended action may be Open Temperature Distribution

Never fabricate missing results.

---

# 22. No Scenario Comparison Controls

10 may show:
`Comparison Available`

Action:
Open Temperature Distribution

Do not implement:
- scenario comparison chart
- grouped temperature bars
- delta temperature filters

Those belong to Screen 09.

---

# 23. No Sensitivity Controls

Do not implement:
Rth Reduction %
Run Sensitivity
Candidate Scope
Target Metric

Those belong to Screen 08.

---

# 24. No Distribution Controls

Do not implement:
Histogram Bin
Group By
Temperature Range filter
Scenario Compare chart controls

Those belong to Screen 09.

---

# 25. No Report Layout Controls

Do not implement:
Page Size
Cover Page
Section Order
Header/Footer
Logo Placement

Those belong to Screen 11.

---

# 26. No Export Format Controls

Do not implement:
PDF / CSV / JSON / PNG bundle selectors
Export destination
Package options

Those belong to Screen 12.

---

# 27. Top Actions

Back to Temperature Distribution
Refresh Overview
Prepare Report Snapshot
Continue to Report Preview

Optional detail navigation:
Open Thermal Network
Open Bottleneck Analysis

Continue to 11 condition:
Report Readiness != BLOCKED

If WARNING:
show confirmation.

---

# 28. Bottom Status Bar

Show:
Project
Scenario
Overall Status
Solver Status
Result Mode
Report Readiness
Last Updated
User

---

# 29. Empty / Loading / Read-only

Empty:
`No valid thermal results available. Solve the active scenario in Screen 07 first.`

Loading:
- KPI skeleton
- summary skeleton
- network snapshot skeleton
- action summary skeleton
- never retain previous-scenario values

Read-only:
may navigate / inspect / refresh;
must not mutate thermal inputs.

---

# 30. Store Contracts

```text
solverStore       [read]
analysisStore     [read 08]
distributionStore [read 09]
scenarioStore     [read]
componentStore    [read limits]
networkStore      [read]
overviewStore     [read/write snapshot]
```

Do not write overview KPIs back into component master data.

---

# 31. Recommended Modules

```text
src/
  screens/10-results-overview/
    ResultsOverviewView.tsx
    OverallStatusCard.tsx
    ResultsKpiBar.tsx
    CriticalComponentsTable.tsx
    BottleneckSummary.tsx
    DistributionSummary.tsx
    SolverQualityPanel.tsx
    DataCompletenessPanel.tsx
    NetworkSnapshot.tsx
    EngineeringActionSummary.tsx
    ReportReadinessPanel.tsx

  thermal/overview/
    overallStatus.ts
    criticalComponents.ts
    overviewAggregator.ts
    actionSummaryRules.ts
    reportReadiness.ts
    snapshotBuilder.ts
```

---

# 32. Required Hover Tooltips

Compact English-only labels requiring zh-TW engineering explanation:

Overall Status
Worst Thermal Margin
Top Bottleneck
Energy Balance
Critical Components
Near Limit
Data Completeness
Result Mode
Report Readiness
Low Confidence
Analytical-only
Prepare Report Snapshot

Example:

`Report Readiness`

Tooltip:
`報告準備狀態：檢查目前求解結果是否有效，以及 08/09 等支援分析是否完整，決定是否能進入 11 Report Preview。`

---

# 33. Acceptance Criteria

AC-10-01 Current Screen 07 solution required.
AC-10-02 Overall Status enum works.
AC-10-03 Status priority works.
AC-10-04 Near-limit threshold reuses Screen 09 rule.
AC-10-05 Six KPI cards correct.
AC-10-06 Critical Components sorted by lowest margin.
AC-10-07 Component status classification works.
AC-10-08 Top 3 Bottlenecks read Screen 08 only.
AC-10-09 Dirty/failed 08 is not shown as current.
AC-10-10 Distribution summary reads Screen 09 only.
AC-10-11 Temperature Range Bar works.
AC-10-12 Solver / energy quality works.
AC-10-13 Energy thresholds match Screen 07.
AC-10-14 Data completeness summary works.
AC-10-15 Rth source counts work.
AC-10-16 FloTHERM remains 0/Deferred when unavailable.
AC-10-17 Network Snapshot is read-only.
AC-10-18 Engineering Action Summary is deterministic.
AC-10-19 Unsupported recommendation is never fabricated.
AC-10-20 Recommended Next Action works.
AC-10-21 Overall Readiness checklist works.
AC-10-22 Report Readiness works.
AC-10-23 Prepare Report Snapshot works.
AC-10-24 Snapshot invalidation works.
AC-10-25 No sensitivity controls.
AC-10-26 No histogram/distribution controls.
AC-10-27 No report layout controls.
AC-10-28 No export-format controls.
AC-10-29 Stale results handled.
AC-10-30 Partial 08/09 handled without fabrication.
AC-10-31 Analytical-only may be valid without FloTHERM.
AC-10-32 Fixed App Shell.
AC-10-33 Exact Sidebar 01–12.
AC-10-34 English-primary rule.
AC-10-35 Compact English-only fields have zh-TW engineering tooltips.
AC-10-36 Native title alone is not acceptable.
AC-10-37 Continue routes to Screen 11 when Report Readiness allows.

---

# 34. Developer Test Cases

## Test A — PASS
All monitored margins >10°C, solver good.
Expected: PASS.

## Test B — WARNING
Worst margin = +7°C.
Expected: WARNING / Near Limit.

## Test C — FAIL
T=116°C, Limit=110°C, Margin=-6°C.
Expected: FAIL.

## Test D — STALE
07 result becomes DIRTY.
Expected:
STALE
Report Readiness BLOCKED.

## Test E — No 08
07 + 09 valid, 08 not run.
Expected:
Top Bottleneck = Not Available
No fabricated ranking
Report Readiness may be WARNING.

## Test F — Analytical-only
No FloTHERM data.
Expected:
Result Mode = Analytical
External CFD Validation = Deferred
Not automatic FAIL.

---

# 35. UI ↔ MD Audit Checklist

Formal `10_Results_Overview.png` must show:

- Fixed App Shell
- Exact Sidebar 01–12
- 03 FloTHERM Deferred
- 10 Results Overview active
- Active Scenario
- Overall Status KPI
- Max Temperature KPI
- Worst Thermal Margin KPI
- Top Bottleneck KPI
- Energy Balance KPI
- Total Power KPI
- Critical Components table
- Temperature
- Limit Type / Limit
- Margin
- PASS / NEAR LIMIT / FAIL status
- Top 3 Bottlenecks summary
- Score
- Sensitivity Improvement
- Confidence
- Temperature Distribution Summary
- Average
- P95
- Nodes Above Warning
- Temperature Range Bar
- Solver / Energy Quality
- Data Completeness
- Rth Source Summary
- Network Snapshot
- Engineering Action Summary
- Recommended Next Action
- Overall Readiness
- Report Readiness
- Prepare Report Snapshot
- Back to 09
- Refresh Overview
- Continue to 11
- No Rth Reduction control
- No Run Sensitivity control
- No Histogram Bin control
- No Report page-layout control
- No Export format selector
- No fake FloTHERM result

Language audit:
- bilingual visible where space allows
- compact English labels use hover affordance
- zh-TW tooltip JSON includes engineering explanation

---

# 36. Final Principle

**10 是目前 Scenario 的工程結論總覽，不是新的分析引擎。它只整合 07、08、09 已經計算過的結果，明確呈現 thermal status、margin、bottleneck、distribution、quality 與下一步；詳細分析回原頁，報告版面留給 11，匯出格式留給 12。**
