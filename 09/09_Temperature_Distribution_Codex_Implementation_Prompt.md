# Codex Implementation Prompt — Screen 09 Temperature Distribution

Read in order:
1. `00_Product_Vision_and_Architecture.md`
2. `07_Thermal_Network.md`
3. `08_Bottleneck_Analysis.md`
4. `09_Temperature_Distribution.md`
5. `09_Temperature_Distribution.png`
6. `09_Temperature_Distribution_mock.json`
7. `09_Temperature_Distribution_Tooltips_zh-TW.json`

Implement only Screen 09.

Core:
- Read solved node temperatures from Screen 07.
- Provide Histogram / Component Bars / Margin Bars / Scenario Compare / Network Temperature views.
- Formal default view is Histogram.
- Provide deterministic statistics: min/max/mean/median/P90/P95/std-dev.
- Provide Hot Node Table and Node Inspector.
- Temperature Rank must not be confused with Screen 08 Bottleneck Rank.
- Scenario comparison uses stable node IDs and handles partial matches.
- Lock Temperature Scale must exist for visual scenario comparison.

Do NOT:
- run solver
- mutate network/boundary/Rth
- implement bottleneck sensitivity
- show Bottleneck Score
- implement executive product summary
- fabricate FloTHERM results

Mandatory language rule for Screens 09–12:
- English primary.
- English / Traditional Chinese when space allows.
- If compact: English visible + Traditional Chinese engineering explanation on hover.
- Use shared FieldLabel/BilingualTooltip/EngineeringInfo components.
- Native browser title alone is not sufficient.
- Tooltip must explain engineering meaning, not merely translate.

UI:
- fixed shared App Shell
- exact 01–12 sidebar
- 03 Deferred
- 09 active
- six KPI cards
- left scope/filter controls + statistics
- center Histogram as default + view tabs + Hot Node Table
- right selected Node Inspector
- Back to 08 / Export CSV / Continue to 10

After implementation provide:
1. changed files
2. screenshot
3. completed acceptance checklist
4. statistics tests
5. histogram bin tests
6. scenario matching tests
7. language-tooltip audit
8. known limitations
