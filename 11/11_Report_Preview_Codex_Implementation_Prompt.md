# Codex Implementation Prompt — Screen 11 Report Preview

Read in order:
1. `00_Product_Vision_and_Architecture.md`
2. `10_Results_Overview.md`
3. `11_Report_Preview.md`
4. `11_Report_Preview.png`
5. `11_Report_Preview_mock.json`
6. `11_Report_Preview_Tooltips_zh-TW.json`

Implement only Screen 11.

Core:
- consume ResultsOverviewSnapshot from Screen 10
- compose report configuration and paginated preview
- section include/exclude and reorder
- A4/Letter, portrait/landscape
- English/Bilingual report content
- header/footer options
- section inspector
- report-only notes
- snapshot freshness validation
- ReportExportPayload metadata for Screen 12

Do NOT:
- solve network
- re-run bottleneck sensitivity
- recalculate temperature distribution
- recompute overall status
- edit thermal inputs
- generate PDF/CSV/JSON/PNG/ZIP
- choose export destination
- fabricate FloTHERM data

Important:
- thermal FAIL does not automatically block reporting
- stale/missing snapshot blocks export preparation
- existing Screen 09 chart snapshot may be embedded without recalculation
- Save As Template must not store project-specific result values

Language rule for Screens 09–12:
- English primary
- bilingual where space allows
- compact English-only fields require zh-TW engineering hover tooltip
- use FieldLabel/BilingualTooltip/EngineeringInfo
- native title alone is insufficient

UI:
- fixed App Shell
- exact Sidebar 01–12
- 03 Deferred
- 11 active
- KPI: Snapshot Status / Overall Status / Report Readiness / Page Count / Language / Page Size
- left Outline/Pages
- center paginated report preview
- right Section Inspector + Snapshot/Readiness/Validation
- bottom Back to 10 / Refresh Snapshot / Save Layout / Prepare for Export / Continue to 12
