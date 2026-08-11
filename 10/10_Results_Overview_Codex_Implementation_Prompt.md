# Codex Implementation Prompt — Screen 10 Results Overview

Read in order:
1. 00_Product_Vision_and_Architecture.md
2. 07_Thermal_Network.md
3. 08_Bottleneck_Analysis.md
4. 09_Temperature_Distribution.md
5. 10_Results_Overview.md
6. 10_Results_Overview.png
7. 10_Results_Overview_mock.json
8. 10_Results_Overview_Tooltips_zh-TW.json

Implement only Screen 10.

Core:
- Aggregate current results from 07 / 08 / 09.
- Do not create a new solver or analysis engine.
- Calculate Overall Thermal Status deterministically.
- Show six KPI cards.
- Show Critical Components by lowest margin.
- Show Top 3 Bottlenecks from Screen 08 only.
- Show compact Temperature Distribution summary from Screen 09 only.
- Show solver / energy quality and data completeness.
- Show read-only network snapshot.
- Build deterministic Engineering Action Summary.
- Build Report Readiness.
- Prepare a report summary snapshot for Screen 11.

Do NOT:
- run sensitivity
- show Rth Reduction / Candidate Scope
- show Histogram Bin / distribution controls
- add report page-layout controls
- add export-format selectors
- fabricate FloTHERM results
- mutate component/network/boundary data

Language rule for Screens 09–12:
- English primary.
- Bilingual visible when space allows.
- If compact, English visible + Traditional Chinese engineering explanation on hover.
- Use FieldLabel/BilingualTooltip/EngineeringInfo.
- Browser native title alone is insufficient.

UI:
- fixed shared App Shell
- exact 01–12 sidebar
- 03 Deferred
- 10 active
- KPI bar
- critical components
- top bottlenecks
- distribution summary
- solver/data quality
- network snapshot
- action summary
- report readiness
- Back to 09 / Refresh / Prepare Report Snapshot / Continue to 11
