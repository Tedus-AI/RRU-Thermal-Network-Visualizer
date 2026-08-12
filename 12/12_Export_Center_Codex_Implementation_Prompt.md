# Codex Implementation Prompt — Screen 12 Export Center

Read in order:
1. `00_Product_Vision_and_Architecture.md`
2. `11_Report_Preview.md`
3. `12_Export_Center.md`
4. `12_Export_Center.png`
5. `12_Export_Center_mock.json`
6. `12_Export_Center_Tooltips_zh-TW.json`

Implement only Screen 12.

Core:
- actual local artifact generation/export
- PDF report from Screen 11 payload/config
- Temperature CSV
- Network JSON
- Network node/edge CSV
- Bottleneck CSV
- Scenario/Boundary JSON
- supported PNG snapshots
- traceability manifest
- Engineering Package ZIP
- export validation
- export queue/progress
- export history
- filename rules
- consistent ExportSession snapshot

Do NOT:
- edit report layout
- recalculate solver
- rerun sensitivity
- recalculate temperature distribution
- edit topology/boundary/power/Rth/limits
- fabricate FloTHERM data
- upload project data externally in V1

Important:
- FAIL thermal status is valid output and does not automatically block export
- stale/missing source data can block dependent artifacts
- artifact failures must be isolated
- report WARNING may export after confirmation
- network JSON may export even when solved result is stale if clearly marked
- shared DB must not be mutated by file generation

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
- 12 active
- KPI Export Status / Ready / Warnings / Blocked / Size Estimate / Last Export
- left Artifact Catalog + Package Presets
- center Export Configuration + Queue + Package Builder
- right Readiness / Validation + History
- actions Back to 11 / Validate Selected / Export Selected / Export Engineering Package / Clear Queue / Save Preset / Finish
