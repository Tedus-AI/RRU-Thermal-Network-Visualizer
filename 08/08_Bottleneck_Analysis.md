# 08 — Bottleneck Analysis / 瓶頸分析
## 5G FR1 Thermal Network Visualizer

**Parent:** `00_Product_Vision_and_Architecture.md`  
**Previous:** `07_Thermal_Network.md`  
**Deferred:** `03_FloTHERM_Import`  
**Next:** `09_Temperature_Distribution.md`  
**Priority:** P0

## 0. Responsibility
07 已提供 Node Temperature、Edge Q、Edge ΔT、Energy Balance。08 回答：**哪一段 thermal path 最值得優化，以及改善後整張 General Thermal Graph 實際能降多少溫度。**

08 負責：candidate ranking、Edge ΔT contribution、Rth/Q context、full-network sensitivity re-solve、worst margin impact、Composite Bottleneck Score、path drill-down、improvement proposal、deterministic recommendation。

08 不負責：05 topology、06 boundary、07 baseline solve、09 temperature distribution、10 executive overview、03 FloTHERM import。

## 1. Core Physics Rule
**Bottleneck ≠ Maximum Rth.** 高 Rth 可能只有小 Q；低 Rth 可能承載大量 shared heat flow；parallel/shared network 改 Rth 後 Q 會重新分配。

V1 排名至少包含：
- Edge ΔT
- Full-network Sensitivity
- Thermal Margin Impact

Rule 4 持續有效：**Never derive segment Rth from ΔT unless segment heat flow Q is known.**

## 2. Sensitivity
預設將 candidate Edge Rth 降低 20%，然後重新求解完整 network：

```text
Clone baseline inputs
→ R_new = R_old × (1 - reduction)
→ full network solve
→ back-calculate all Q
→ energy balance
→ compare target metric
```

禁止固定使用 baseline Q 做局部估算。

## 3. Metrics
每個 candidate 至少計算：
- Worst Component Temperature Improvement
- Worst Thermal Margin Improvement
- Affected Component Count
- Target Metric Improvement
- Sensitivity energy-balance quality

Thermal margin：`Margin = Limit - Temperature`。

## 4. Composite Score
V1：

```text
Score = 0.35 × ΔT_norm
      + 0.45 × Sensitivity_norm
      + 0.20 × MarginImpact_norm
```

Score 0–100。Rth 只顯示 context，不直接作 primary ranking weight。

分類：
- >=80 Critical
- 60–79 High
- 35–59 Medium
- <35 Low

## 5. Candidate Eligibility
可納入：Package Rjc、TIM、Solder、Solid Conduction、Thermal Via、Contact、Heat Pipe、Spreading、Convection、Radiation、Combined Boundary、Custom Rth。

排除：disabled edge、ideal link、沒有 valid solved Q、stale/invalid baseline。

Candidate Scope：All Edges / Component Path / Shared Structure / Boundary Path / Selected Component / Selected Node Path / Custom Selection。

## 6. Fixed App Shell
必須沿用 00/01/05/06/07 固定 shell。

Sidebar 必須完全是：
```text
01 Project Info
02 Import Components
03 FloTHERM Import [Deferred]
04 Component Manager
05 Thermal Path Builder
06 Boundary Conditions
07 Thermal Network
08 Bottleneck Analysis ← Active
09 Temperature Distribution
10 Results Overview
11 Report Preview
12 Export Center
```

禁止改名、插入其他 Screen、重新設計 Sidebar。

## 7. Prerequisite
需要 Screen 07 current solution = SOLVED 或 WARNING 且 energy balance 可接受。若 DIRTY/FAILED/UNSOLVED，不執行 sensitivity。

## 8. Main Layout
```text
Breadcrumb + 08 Bottleneck Analysis + Scenario + Analysis Status
KPI Cards
Left: Analysis Controls / Filters / Sensitivity Setup
Center: Ranked Candidate Table + Bottleneck Graph Overlay + Improvement Preview
Right: Bottleneck Inspector
Bottom: Validation + Actions + Status
```

## 9. KPI Cards
正式 UI 必須顯示：
- Top Bottleneck
- Top Score
- Worst Margin
- Best 20% Rth Improvement
- Analyzed Edges
- Analysis Status

Example：RF Left Base → HSK Base / 92 / 13.2°C / 6.8°C / 47 / COMPLETE。

## 10. Analysis Controls
- Active Scenario
- Candidate Scope
- Rth Reduction % (default 20%, range 5–50%, step 5%)
- Target Metric
- Run Analysis / Re-run Analysis / Reset Analysis

Target Metric：Worst Component Temperature / Worst Thermal Margin / Selected Component Temperature / Selected Node Temperature。

## 11. Filters
Edge Type / Component / Zone / Rth Source / Confidence / Shared vs Local / Boundary vs Internal。

## 12. Ranking Table
Columns 必須是：
```text
Rank
Score
Edge
Path / Component
Type
Rth
Q
ΔT
Sensitivity ΔT
Margin Impact
Affected Components
Confidence
Source
```

依 Score 降冪。

Rth tooltip：`Rth is displayed for engineering context but is not the primary ranking metric.`

Affected component threshold V1 = temperature improvement >= 0.5°C。

## 13. Full-Network Re-solve Requirement
每一個 candidate 都必須 clone baseline、只修改該 edge Rth、重新 solve 整張 General Graph。**不可 reuse baseline Q。** Shared Base / HSK / parallel branch 的 heat-flow redistribution 必須被捕捉。

## 14. Analysis State
```text
NOT_READY
READY
RUNNING
COMPLETE
WARNING
FAILED
DIRTY
```

07 solution、Reduction、Scope、Target Metric 改變都會讓 08 DIRTY。

## 15. Graph Overlay
Center graph 使用 07 solved topology，只加 Bottleneck Score Overlay，不修改 topology。
- Top edge strongest highlight
- High score thicker/warmer
- Low score neutral
- selected row focus candidate path

可顯示 Local Component Path / Shared Base Path / Boundary Path。

## 16. Right Inspector
Tabs：
```text
Overview
Baseline
Sensitivity
Affected Components
Source
External Mapping
```

Overview：Edge、From/To、Type、Component/Zone、Rank、Score、Classification。

Baseline：Rth、Q、ΔT、T_from、T_to、Rth Source、Confidence。

Sensitivity：Reduction、Original/Modified Rth、Baseline/Modified Target T、Temperature Improvement、Baseline/Modified Worst Margin、Margin Improvement、Energy Balance。

Affected Components table：Component / Baseline T / Modified T / Improvement / Limit / Baseline Margin / Modified Margin。

## 17. Improvement Preview
Compact Baseline vs Rth -20% 比較：Target Temperature、Worst Margin、Affected Components、Energy Balance。**不要做 09 的 histogram/distribution chart。**

## 18. Recommendation
V1 使用 deterministic rules，不依賴 LLM。
- TIM：review thickness / k / compression / area
- Spreading：review base thickness / spreading area / heat-pipe placement / metal path
- Convection：review effective area / fin spacing / exposure / boundary assumptions

## 19. Confidence
High / Medium / Low，由 Rth source confidence、solver quality、scenario validity 彙總。Low confidence 可 rank，但需 warning。

## 20. FloTHERM Compatibility
03 未來可提供 `Edge.rth.flotherm`、`Edge.heatFlowResults.flotherm`、`Node.temperatureResults.flotherm`。08 只讀 active solved source，不 import、不 mapping、不產生假結果。

## 21. Validation
Blocking：07 invalid/stale、active Rth invalid、global sensitivity solve failure、energy balance >2%、no valid target。

Warning：low confidence、manual source no reference、tiny Q、near-zero sensitivity、partial limit coverage。

單一 candidate solve failed：row=FAILED、Score=N/A、batch 繼續，Analysis=WARNING。

## 22. Baseline Preservation
Sensitivity 必須 ephemeral solve，不得覆寫 official edge Rth 或 07 baseline solution。

## 23. Improvement Proposal
V1 不直接 Apply Rth。提供 `Create Improvement Proposal`，只保存假設與 projected benefit。真正工程修改回 04/05/06。

```ts
type BottleneckProposal = {
  id: string;
  scenarioId: string;
  edgeId: string;
  reductionPercent: number;
  baseline: { rthCPerW: number; targetTemperatureC: number; worstMarginC: number };
  projected: { rthCPerW: number; targetTemperatureC: number; worstMarginC: number };
  score: number;
  note?: string;
};
```

## 24. Analysis Result Schema
```ts
type BottleneckResult = {
  edgeId: string;
  rank: number;
  baseline: { rthCPerW: number; heatFlowW: number; deltaTC: number };
  sensitivity: {
    reductionPercent: number;
    targetImprovementC: number;
    marginImprovementC: number;
    affectedComponentCount: number;
    solveStatus: 'SOLVED' | 'WARNING' | 'FAILED';
    energyErrorPercent?: number;
  };
  normalized: { deltaT: number; sensitivity: number; marginImpact: number };
  score: number;
  classification: 'Critical' | 'High' | 'Medium' | 'Low';
  confidence: 'high' | 'medium' | 'low';
};
```

## 25. Stores
`solverStore [read]`, `networkStore [read]`, `scenarioStore [read]`, `componentStore [read]`, `analysisStore [read/write]`。Sensitivity 不覆蓋 baseline solverStore。

## 26. Modules
```text
screens/08-bottleneck-analysis/
  BottleneckAnalysisView.tsx
  BottleneckKpiBar.tsx
  AnalysisControlPanel.tsx
  BottleneckRankingTable.tsx
  BottleneckGraphOverlay.tsx
  BottleneckInspector.tsx
  SensitivityPanel.tsx
  AffectedComponentsTable.tsx
  ImprovementPreview.tsx
  AnalysisValidationPanel.tsx
thermal/analysis/
  candidateSelector.ts
  sensitivityRunner.ts
  bottleneckScore.ts
  normalization.ts
  affectedComponents.ts
  recommendationRules.ts
  analysisCache.ts
```

## 27. Performance
~50 edges V1 可逐 candidate full solve。Accuracy > optimization。建議 Web Worker，顯示 `Analyzing 18 / 47`、elapsed time、Cancel Analysis。Cancel 不破壞 baseline。

## 28. Bottom Actions
```text
Back to Thermal Network
Run / Re-run Analysis
Save Analysis
Create Improvement Proposal
Continue to Temperature Distribution
```
Continue → 09。

## 29. Status Bar
Project / Scenario / Solver Status / Analysis Status / Reduction % / Target Metric / Last Analyzed / User。

## 30. Explicitly Forbidden in 08
- Temperature histogram
- Node temperature bar chart
- Physical temperature distribution map
- Scenario distribution chart
- Executive pass/fail summary
- Management report narrative
- FloTHERM parser

## 31. Acceptance Criteria
- Valid 07 prerequisite
- Not maximum-Rth-only
- Candidate filter/scope
- Edge ΔT metric
- Full-network sensitivity re-solve
- Baseline Q not reused
- Shared/parallel redistribution
- Temperature improvement
- Margin improvement
- Affected component count
- 35/45/20 weights
- 0–100 score
- classification/confidence
- candidate failure isolation
- baseline never overwritten
- proposal no direct mutation
- ranking table exact columns
- graph overlay/path focus
- Baseline/Sensitivity/Affected inspector
- deterministic recommendation
- states/dirty/cancel
- no 09/10 features
- no FloTHERM parser
- fixed shell + exact sidebar
- Continue → 09

## 32. UI ↔ MD Audit
正式 PNG 必須看到：固定 App Shell、01–12 Sidebar、03 Deferred、08 active、Active Scenario、6 KPI、Candidate Scope、Rth Reduction、Target Metric、Run/Re-run、Ranking table完整欄位、Bottleneck graph overlay、selected path、Right Inspector tabs、Improvement Preview、Validation、Back to 07、Save Analysis、Create Improvement Proposal、Continue to 09；且不得有 histogram/distribution/executive summary/fake FloTHERM。

## 33. Final Principle
**08 的 Bottleneck 不是「哪個 Rth 最大」，而是「改善哪一段後，完整 General Thermal Graph 重新分配熱流並 re-solve 時，能帶來最大的實際熱風險改善」。**
