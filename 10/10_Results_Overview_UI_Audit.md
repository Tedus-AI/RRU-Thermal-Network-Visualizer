# 10 Results Overview — Formal UI Delivery Audit

`10_Results_Overview.md` is the Source of Truth.

The formal PNG must contain:

## Shell
- Fixed deep-navy App Shell
- Exact Sidebar 01–12
- 03 FloTHERM Import = Deferred
- 10 Results Overview = Active

## Header / KPI
- Active Scenario
- Overall Status
- Max Temperature
- Worst Thermal Margin
- Top Bottleneck
- Energy Balance
- Total Power

## Scenario Summary
- Active Scenario
- Ambient
- Wind
- Solar
- Power Scale
- Solver Status
- Last Solved
- View Boundary Conditions
- View Thermal Network

## Main Summary
- Critical Components table:
  Component / Node / Temperature / Limit Type / Limit / Margin / Status
- Top 3 Bottlenecks:
  Rank / Edge / Score / Classification / Sensitivity Improvement /
  Affected Components / Confidence
- Temperature Distribution Summary:
  Average / P95 / Nodes Above Warning / Temperature Range /
  Distribution Row Count
- Compact Temperature Range Bar only; no histogram controls
- Solver / Energy Quality
- Data Completeness
- Rth Source Summary
- Read-only Network Snapshot
- Engineering Action Summary
- Recommended Next Action
- Overall Readiness
- Report Readiness

## Report Readiness for supplied mock
Must be `WARNING`, because:
- 3 components are missing thermal limits
- Data Confidence is WARNING
- 2 critical edges use low-confidence inputs

## Actions
- Back to 09
- Refresh Overview
- Prepare Report Snapshot
- Continue to 11
- Open Thermal Network
- Open Bottleneck Analysis
- View Boundary Conditions

## Forbidden
- No Rth Reduction control
- No Run Sensitivity control
- No Candidate Scope / Target Metric
- No Histogram Bin / distribution filters
- No report page-layout controls
- No export-format selectors
- No fake FloTHERM result
- No direct thermal-input editing

## Language
- English primary
- Bilingual visible where space allows
- Compact English-only engineering fields have zh-TW engineering hover tooltip
- Native browser title alone is insufficient
