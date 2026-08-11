# 09 — Temperature Distribution / 溫度分佈
## 5G FR1 Thermal Network Visualizer
### Screen Functional Specification for Codex

**Document ID:** `09_Temperature_Distribution`  
**Parent Architecture:** `00_Product_Vision_and_Architecture.md`  
**Previous:** `08_Bottleneck_Analysis.md`  
**Deferred:** `03_FloTHERM_Import`  
**Next:** `10_Results_Overview.md`  
**Priority:** P0 — Result Interpretation  

---

# 0. Screen Responsibility

Screen 07 已求出：

```text
Node Temperature
Edge Q
Edge ΔT
Energy Balance
```

Screen 08 已完成：

```text
Bottleneck Ranking
Sensitivity Re-solve
Margin Impact
Improvement Candidates
```

Screen 09 專門回答：

> **整個系統的溫度分佈長什麼樣？哪些元件 / 節點偏熱？不同群組與 Scenario 的溫度分佈有什麼差異？**

09 負責：

- Node temperature distribution
- Component temperature comparison
- Temperature histogram
- Thermal-limit margin distribution
- Group / Category / Zone comparison
- Scenario-to-scenario temperature comparison
- Temperature range statistics
- Hot-node filtering
- Temperature-focused network view
- Selected node drill-down

09 不負責：

- Bottleneck score / sensitivity ranking → Screen 08
- 修改 topology → Screen 05
- 修改 boundary → Screen 06
- full network solve → Screen 07
- Executive pass/fail summary → Screen 10
- Report formatting → Screen 11
- FloTHERM import → Screen 03 later

---

# 1. Prerequisite

09 需要至少一個有效 solution：

```text
Screen 07 status = SOLVED or WARNING
```

如果 active Scenario：

```text
DIRTY / FAILED / UNSOLVED
```

則 09 顯示：

```text
A current solved thermal network is required.
Return to Screen 07 and solve this scenario.
```

---

# 2. Data Sources

09 只讀：

```text
solverStore
scenarioStore
networkStore
componentStore
```

主要資料：

```text
Node temperatures
Component limits
Node types
Categories
Zones
Scenario IDs
```

08 analysisStore 不是 09 必要依賴。

---

# 3. Language Rule — Mandatory for Screens 09–12

## 3.1 Visible UI

English is primary.

如果空間足夠：

```text
Temperature Distribution / 溫度分佈
Scenario Comparison / 情境比較
```

如果空間不足：

```text
Temperature Distribution
```

只顯示英文。

## 3.2 Hover Tooltip

所有 compact English-only engineering field 必須提供：

```text
Traditional Chinese engineering explanation on hover
```

不可只有逐字翻譯。

例如：

```text
P95 Temperature
```

Tooltip：

```text
第 95 百分位溫度：95% 的納入節點溫度低於此值，用來觀察高溫尾端分佈。
```

## 3.3 Required Shared Components

建議使用：

```tsx
<FieldLabel />
<BilingualTooltip />
<EngineeringInfo />
```

Browser native `title=""` 不足。

---

# 4. Fixed App Shell

必須沿用：

```text
Deep Navy Top Header
Deep Navy Left Sidebar
Breadcrumb
Main Workspace
Right Inspector
Deep Navy Bottom Status Bar
```

Sidebar exact order：

```text
01 Project Info
02 Import Components
03 FloTHERM Import [Deferred]
04 Component Manager
05 Thermal Path Builder
06 Boundary Conditions
07 Thermal Network
08 Bottleneck Analysis
09 Temperature Distribution ← Active
10 Results Overview
11 Report Preview
12 Export Center
```

不得新增、重新命名或重排 Sidebar Screen。

---

# 5. Main Layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb + 09 Temperature Distribution + Scenario                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ A. Temperature KPI Cards                                                    │
├───────────────────────┬──────────────────────────────────────┬───────────────┤
│ B. Filters / Scope    │ C. Main Distribution Visualization │ F. Inspector  │
│ D. Scenario Controls │ D. Component Comparison             │               │
│                       │ E. Temperature-focused Network      │               │
├───────────────────────┴──────────────────────────────────────┴───────────────┤
│ G. Bottom Actions / Status                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Recommended：

- Left: 250–300 px
- Center: flexible
- Right: 350–410 px

---

# 6. Top KPI Cards

正式 UI 必須顯示：

```text
Max Temperature
Average Temperature
P95 Temperature
Min Thermal Margin
Nodes Above Warning
Active Scenario
```

Example：

```text
103.4°C
74.8°C
96.8°C
13.2°C
3
Baseline 55C / 0 m/s
```

不要放：

```text
Top Bottleneck Score
Sensitivity Improvement
```

---

# 7. Scope

使用者可選：

```text
All Solved Nodes
Heat Sources Only
Components With Limits
Shared Structure
Boundary Nodes
Custom Selection
```

Default：

```text
Components With Limits
```

---

# 8. Group By

可切換：

```text
Component
Category
Node Type
Base Zone
Thermal Limit Type
```

用於 table / chart aggregation。

---

# 9. Filters

```text
Category
Node Type
Zone
Limit Type
Temperature Range
Margin Range
Heat Source / Passive
Source / Result Type
```

V1 analytical solution：

```text
Result Source = Analytical
```

Future 可顯示 FloTHERM / Measurement，但 03 未完成時不得造假。

---

# 10. Main Visualization Modes

正式 09 支援：

```text
Histogram
Component Bars
Margin Bars
Scenario Compare
Network Temperature
```

Formal PNG default：

```text
Histogram
```

---

# 11. Temperature Histogram

X-axis：

```text
Temperature (°C)
```

Y-axis：

```text
Node Count
```

Bin：

```text
Auto
5°C
10°C
Custom
```

Default：

```text
5°C
```

Histogram 必須只包含目前 Scope / Filter 的 nodes。

---

# 12. Histogram Reference Lines

可顯示：

```text
Average
P95
Selected Warning Threshold
Selected Limit Reference [when meaningful]
```

不要把不同 component 的不同 Tj/Tc limit 強迫畫成單一 global limit line。

---

# 13. Warning Threshold

09 可提供 display-only threshold：

```text
Highlight Above Temperature
```

例如：

```text
90°C
```

用途：

```text
visual filtering / highlight
```

不是 product pass/fail criterion。

---

# 14. Component Temperature Bars

用 horizontal bar chart：

```text
Component / Node
Temperature
Limit
Margin
```

排序：

```text
Temperature High → Low
Margin Low → High
Name
```

Default：

```text
Temperature High → Low
```

---

# 15. Component Limit Overlay

若 node 有 limit：

bar 旁顯示：

```text
Limit marker
Margin value
```

例如：

```text
FPGA 96.8°C
Tj Limit 110°C
Margin +13.2°C
```

---

# 16. Margin Bars

顯示：

```text
Thermal Margin = Limit - Temperature
```

Positive：

```text
safe margin
```

Negative：

```text
over limit
```

09 只顯示 distribution，不做最終 product summary。

---

# 17. Scenario Compare

可選：

```text
Baseline Scenario
Comparison Scenario
```

顯示：

```text
Temperature Baseline
Temperature Comparison
ΔTemperature
```

比較維度：

```text
Same node ID / same component mapping
```

如果 node 不存在：

```text
N/A
```

---

# 18. Scenario Compare Rules

只能比較：

```text
same project
compatible network schema
```

若 topology 不一致：

顯示：

```text
Partial Match
```

並只比較 stable mapped node IDs。

---

# 19. Scenario Compare Chart

正式支援：

```text
Grouped Bars
Delta Bars
```

不做：

```text
Bottleneck sensitivity
```

Scenario compare 只是比較不同正式 solved scenarios。

---

# 20. Network Temperature View

使用 07 Cytoscape solved graph：

Node color：

```text
Temperature
```

可 filter：

```text
Heat Sources
Shared Structure
All
```

Edge 不依 Bottleneck Score 上色。

---

# 21. Temperature Legend

顯示：

```text
Min
Mid
Max
°C
```

range mode：

```text
Auto
Fixed
```

Fixed 例如：

```text
55–120°C
```

方便跨 Scenario visual comparison。

---

# 22. Range Lock

Scenario Compare 時建議：

```text
Lock Temperature Scale
```

ON：

兩個 scenario 使用相同 legend range。

避免視覺誤導。

---

# 23. Temperature Statistics

左或右 panel 顯示：

```text
Count
Min
Max
Mean
Median
P90
P95
Standard Deviation
```

只針對 active filtered dataset。

---

# 24. Percentile Definition

P95：

```text
95% of selected nodes have temperature <= P95
```

使用 linear/interpolated percentile method。

需要 deterministic implementation。

---

# 25. Hot Node Table

Columns：

```text
Rank
Node / Component
Category
Node Type
Temperature
Limit Type
Limit
Margin
Zone
Result Source
```

Default Top：

```text
10
```

可選：

```text
10 / 20 / All
```

---

# 26. Rank Meaning

09 Hot Node Rank：

```text
Temperature descending
```

或 margin mode：

```text
Margin ascending
```

這不是 Bottleneck Rank。

UI 必須明確寫：

```text
Temperature Rank
```

避免與 08 混淆。

---

# 27. Selected Node Inspector

Tabs：

```text
Overview
Temperature
Limit & Margin
Scenario Compare
Connections
Source
External Mapping
```

---

# 28. Inspector — Overview

```text
Node Name
Component
Node Type
Category
Base Zone
Scenario
```

---

# 29. Inspector — Temperature

```text
Temperature
Dataset Rank
Percentile Position
Distance from Average
Result Source
Solved At
```

---

# 30. Percentile Position

例如：

```text
97th percentile
```

表示 selected node 比 97% selected dataset 更熱。

---

# 31. Inspector — Limit & Margin

```text
Limit Type
Limit
Current Temperature
Margin
Status
```

Status：

```text
Within Limit
Near Limit
Over Limit
No Limit
```

---

# 32. Near Limit Threshold

V1 display classification：

```text
Margin <= 10°C
```

= Near Limit。

可由 project setting future override。

這不是 10 的 overall pass/fail。

---

# 33. Inspector — Scenario Compare

如果 comparison scenario 已選：

```text
Baseline T
Comparison T
ΔT
Baseline Margin
Comparison Margin
```

---

# 34. Inspector — Connections

顯示來自 07：

```text
Connected Edge
Neighbor Node
Neighbor Temperature
Rth
Q
ΔT
```

只讀。

---

# 35. Source

顯示：

```text
Analytical
FloTHERM [reserved]
Measurement [if exists]
```

03 未實作時：

```text
FloTHERM = Not Available / Deferred
```

不得顯示假數值。

---

# 36. Temperature Distribution Dataset

建議：

```ts
type TemperatureDistributionRow = {
  nodeId: string;
  componentId?: string;
  componentName?: string;

  category?: string;
  nodeType: ThermalNodeType;
  zoneId?: string;

  temperatureC: number;

  limitType?: 'Tj' | 'Tc' | 'Ts' | 'Custom';
  limitC?: number;
  marginC?: number;

  resultSource: 'analytical' | 'flotherm' | 'measurement';
  scenarioId: string;
};
```

---

# 37. Statistics Schema

```ts
type TemperatureStatistics = {
  count: number;
  minC: number;
  maxC: number;
  meanC: number;
  medianC: number;
  p90C: number;
  p95C: number;
  stdDevC: number;
};
```

---

# 38. Scenario Comparison Schema

```ts
type ScenarioTemperatureComparison = {
  nodeId: string;

  baselineScenarioId: string;
  comparisonScenarioId: string;

  baselineTemperatureC?: number;
  comparisonTemperatureC?: number;
  deltaTemperatureC?: number;

  baselineMarginC?: number;
  comparisonMarginC?: number;

  matchStatus: 'matched' | 'missing-baseline' | 'missing-comparison';
};
```

---

# 39. Chart Engine

工程 charts 使用：

```text
Plotly.js
```

Graph：

```text
Cytoscape.js
```

不要用 React component hard-code SVG chart data。

---

# 40. Histogram Implementation

Plotly：

```text
histogram
```

但 binning rules 必須由 app state 控制。

不要依 Plotly default binning 造成每次結果不同。

---

# 41. Component Bar Implementation

Plotly：

```text
horizontal bar
```

Limit marker 可以：

```text
scatter overlay / marker
```

---

# 42. Scenario Compare Implementation

Plotly：

```text
grouped horizontal bars
```

或：

```text
delta horizontal bars
```

---

# 43. Export From 09

V1 可提供：

```text
Export Chart PNG
Export Temperature CSV
```

Export CSV fields：

```text
Scenario
Node
Component
Category
Node Type
Temperature
Limit Type
Limit
Margin
Zone
Result Source
```

正式 Report 仍由 11。

---

# 44. No Solver Mutation

09 不：

```text
Solve
Re-Solve
Change Rth
Change Power
Change Boundary
```

只讀 solved result。

如要更新：

```text
Go to Screen 07
```

---

# 45. Dirty Handling

若 07 solverStore = DIRTY：

09 所有 current analytical chart：

```text
STALE
```

顯示 banner：

```text
Temperature results are stale.
Re-solve the active scenario in Screen 07.
```

---

# 46. Multiple Result Sources

Future：

```text
Analytical
FloTHERM
Measurement
```

09 可以用：

```text
Result Source selector
```

但若只有 analytical：

只顯示 Analytical。

不可顯示假的可選 FloTHERM dataset。

---

# 47. External Mapping

右 Inspector：

```text
FloTHERM Mapping
Measurement Mapping
```

只顯示 mapping status / alias metadata。

03 Deferred。

---

# 48. Validation

Blocking：

```text
No valid solved dataset
All selected nodes filtered out
Scenario comparison incompatible and zero matched nodes
Non-finite temperature
```

Warning：

```text
Some nodes lack limits
Partial scenario mapping
Mixed limit types
Low-confidence result source
Small sample size
```

---

# 49. Empty State

若 no selected rows：

```text
No temperature data matches the current filters.
Reset Filters
```

---

# 50. Loading State

- KPI skeleton
- chart skeleton
- table skeleton
- inspector disabled

不殘留上一 Scenario 數據。

---

# 51. Read-only

09 本質上幾乎全 read-only。

仍可：

```text
filter
sort
switch view
switch solved scenarios
export
inspect
```

---

# 52. UI State

```text
READY
STALE
NO_DATA
WARNING
ERROR
```

---

# 53. Top Actions

```text
Back to Bottleneck Analysis
Refresh from Solution
Export Temperature CSV
Continue to Results Overview
```

`Continue` → 10。

---

# 54. Bottom Status Bar

```text
Project
Active Scenario
Result Source
Solver Status
Distribution Rows
Selected View
Last Solved
User
```

---

# 55. Recommended Modules

```text
src/
  screens/09-temperature-distribution/
    TemperatureDistributionView.tsx
    TemperatureKpiBar.tsx
    DistributionFilterPanel.tsx
    DistributionViewTabs.tsx
    TemperatureHistogram.tsx
    ComponentTemperatureBars.tsx
    MarginBars.tsx
    ScenarioComparisonChart.tsx
    TemperatureNetworkView.tsx
    HotNodeTable.tsx
    TemperatureNodeInspector.tsx
    TemperatureStatisticsPanel.tsx

  thermal/analysis/
    temperatureDataset.ts
    temperatureStatistics.ts
    percentile.ts
    scenarioTemperatureCompare.ts
```

---

# 56. Tooltip Requirements

以下 English-only compact labels 必須有繁中工程解釋：

```text
P95 Temperature
Scope
Group By
Margin Range
Result Source
Histogram Bin
Warning Threshold
Lock Temperature Scale
Percentile Position
Near Limit
Temperature Rank
Scenario Compare
Partial Match
```

Example：

`Lock Temperature Scale`

Tooltip：

```text
鎖定溫度色階：比較不同 Scenario 時使用相同 Min/Max 色階，避免因自動縮放造成視覺誤判。
```

---

# 57. Acceptance Criteria

- AC-09-01 Requires valid Screen 07 solution.
- AC-09-02 Temperature KPI cards correct.
- AC-09-03 Scope works.
- AC-09-04 Group By works.
- AC-09-05 Filters work.
- AC-09-06 Histogram works.
- AC-09-07 Deterministic bin size works.
- AC-09-08 Mean / median / P90 / P95 / std-dev correct.
- AC-09-09 Component Temperature Bars work.
- AC-09-10 Limit marker works.
- AC-09-11 Margin Bars work.
- AC-09-12 Scenario Compare works.
- AC-09-13 Stable node mapping used for scenario compare.
- AC-09-14 Partial Match handled.
- AC-09-15 Network Temperature View works.
- AC-09-16 Temperature legend works.
- AC-09-17 Lock Temperature Scale works.
- AC-09-18 Hot Node Table works.
- AC-09-19 Temperature Rank explicitly differs from Bottleneck Rank.
- AC-09-20 Node Inspector works.
- AC-09-21 Percentile Position works.
- AC-09-22 Near Limit classification works.
- AC-09-23 Source selector only shows available datasets.
- AC-09-24 No fake FloTHERM dataset.
- AC-09-25 Solver result is not mutated.
- AC-09-26 Stale state handled.
- AC-09-27 Export Chart PNG works.
- AC-09-28 Export Temperature CSV works.
- AC-09-29 No Bottleneck sensitivity ranking.
- AC-09-30 No Executive Results Overview.
- AC-09-31 Fixed App Shell.
- AC-09-32 Exact 01–12 Sidebar.
- AC-09-33 English-primary + zh-TW hover rule enforced.
- AC-09-34 Native title alone is not accepted for engineering tooltips.
- AC-09-35 Continue → Screen 10.

---

# 58. Developer Test Cases

## Test A — Histogram
Temperatures：

```text
55, 60, 62, 70, 75, 85, 90, 96, 103
```

5°C bins deterministic。

## Test B — Mixed Limits

```text
FPGA Tj 110
DDR Tc 95
PA Tj 180
```

Expected：
no single fake global limit line.

## Test C — Scenario Compare

Baseline：

```text
PA1 103.4
FPGA 96.8
```

Comparison：

```text
PA1 97.0
FPGA 91.2
```

Expected：
ΔT = -6.4 / -5.6°C.

## Test D — Partial Match
Comparison topology lacks one node.

Expected：
Partial Match warning, matched nodes still render.

## Test E — Stale
Change boundary after solve.

Expected：
09 STALE, no current analytics claim.

---

# 59. UI ↔ MD Audit Checklist

正式 `09_Temperature_Distribution.png` 必須看到：

- [ ] Fixed App Shell
- [ ] Exact Sidebar 01–12
- [ ] 03 FloTHERM Deferred
- [ ] 09 Temperature Distribution active
- [ ] Max Temperature KPI
- [ ] Average Temperature KPI
- [ ] P95 Temperature KPI
- [ ] Min Thermal Margin KPI
- [ ] Nodes Above Warning KPI
- [ ] Active Scenario KPI
- [ ] Scope
- [ ] Group By
- [ ] Filters
- [ ] Result Source
- [ ] View Tabs: Histogram / Component Bars / Margin Bars / Scenario Compare / Network Temperature
- [ ] Histogram visible as formal default
- [ ] Histogram Bin
- [ ] Warning Threshold
- [ ] Temperature Statistics
- [ ] Hot Node Table
- [ ] Temperature Rank
- [ ] Node Temperature
- [ ] Limit
- [ ] Margin
- [ ] Right Node Inspector
- [ ] Overview tab
- [ ] Temperature tab
- [ ] Limit & Margin tab
- [ ] Scenario Compare tab
- [ ] Source / External Mapping
- [ ] Back to 08
- [ ] Export Temperature CSV
- [ ] Continue to 10
- [ ] No Bottleneck Score
- [ ] No Sensitivity controls
- [ ] No Executive Pass/Fail Summary
- [ ] No fake FloTHERM values

For compact English-only engineering labels:
- [ ] Info icon / tooltip affordance visible where practical
- [ ] zh-TW tooltip exists in code/tooltips JSON
- [ ] tooltip explains engineering meaning

---

# 60. Final Principle

**08 回答「改善哪一段最值得」；09 回答「整個系統的溫度分佈長什麼樣」。09 可以比較溫度、margin 與 Scenario，但不能再做 Bottleneck sensitivity，也不能提前替 10 做整體產品結論。**
