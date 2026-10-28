# 07 — Thermal Network / 熱網路圖
## 5G FR1 Thermal Network Visualizer
### Screen Functional Specification for Codex

**Document ID:** `07_Thermal_Network`  
**Parent Architecture:** `00_Product_Vision_and_Architecture.md`  
**Previous:** `06_Boundary_Conditions.md`  
**Deferred:** `03_FloTHERM_Import`  
**Next:** `08_Bottleneck_Analysis.md`  
**Priority:** P0 — Core Solver + Result Visualization  

---

# 0. Screen Responsibility

Screen 05 定義 Graph Topology。  
Screen 06 定義 Scenario-specific Boundary Conditions。  
Screen 07 **第一次執行完整 Thermal Network Solve**。

07 負責：

- Build solver matrix from the General Thermal Graph
- Apply source powers
- Apply active Rth values
- Apply fixed-temperature / boundary nodes
- Solve node temperatures
- Back-calculate edge heat flow Q
- Calculate edge ΔT
- Check energy balance
- Visualize solved network
- Inspect solved Node / Edge results
- Save scenario solution state

07 不負責：

- Bottleneck ranking / sensitivity analysis → Screen 08
- Temperature distribution charts / histograms / spatial plots → Screen 09
- Executive result summary → Screen 10
- FloTHERM import / calibration → Screen 03 later

---

# 1. Solver Principle

General nodal thermal network：

```text
Qij = (Ti - Tj) / Rij
```

Node balance：

```text
Pi = Σ((Ti - Tj) / Rij)
```

Matrix form：

```text
[G][T] = [P]
```

Solver 必須支援：

- series
- parallel
- branch
- merge
- shared nodes
- multiple heat sources
- multiple fixed-temperature boundaries
- coupling cycles
- reverse solved heat-flow direction

Solver 不可假設 Graph 是 Tree。

---

# 2. Solver States

```text
READY
DIRTY
SOLVING
SOLVED
WARNING
FAILED
```

## READY
Topology + Boundary 已通過 pre-check，尚未 solve。

## DIRTY
任何會影響結果的資料修改後，舊解失效。

## SOLVING
正在建立 matrix / solve。

## SOLVED
解成功，energy balance 通過。

## WARNING
解成功，但有 residual / low-confidence / unresolved metadata warning。

## FAILED
matrix singular、缺 boundary、invalid active Rth 等導致無法 solve。

---

# 3. Solver Invalidation

以下任一改變：

- Node source power
- Qty representation
- Edge topology
- Edge enabled/disabled
- Active Rth source
- Rth value
- Ambient / fixed temperature
- h_conv / h_rad / area
- Power Scale
- Scenario switch with unsolved state

必須：

```text
solverStore.status = DIRTY
```

舊 results 必須標示 stale，不可繼續當 current solution 使用。

---

# 4. Pre-Solve Checks

阻止 Solve：

```text
No active heat source
No valid thermal path to any fixed/boundary sink
Required boundary not configured
Active edge Rth <= 0
Active edge Rth unresolved
Missing node reference
Self-loop
NaN / Infinity input
Fixed-temperature boundary invalid
Matrix construction failure
```

Warnings：

```text
Low confidence Rth
Manual Rth without reference
Very high / very low Rth
Unused disconnected passive island
External mapping absent
```

---

# 5. Fixed App Shell

沿用：

- Deep Navy Top Header
- Deep Navy Sidebar
- Breadcrumb
- Main Workspace
- Right Inspector
- Deep Navy Bottom Status Bar

Sidebar：

```text
01 Project Info
02 Import Components
03 FloTHERM Import [Deferred]
04 Component Manager
05 Thermal Path Builder
06 Boundary Conditions
07 Thermal Network ← Active
08 Bottleneck Analysis
09 Temperature Distribution
10 Results Overview
11 Report Preview
12 Export Center
```

---

# 6. Language

- English primary
- English / 繁中 when space allows
- English + accessible zh-TW tooltip when compact

---

# 7. Main Layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb + 07 Thermal Network + Scenario + Solver Status                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ A. Solver KPI Cards                                                         │
├───────────────────────┬────────────────────────────────────┬─────────────────┤
│ B. Solve Controls     │ C. Solved Thermal Graph           │ F. Inspector    │
│ D. Display Controls   │ D. Legend / Result Mode           │                 │
│ E. Validation         │ E. Energy-balance strip           │                 │
├───────────────────────┴────────────────────────────────────┴─────────────────┤
│ G. Bottom Actions / Status                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Recommended：
- Left: 260–300 px
- Center: flexible
- Right: 360–420 px

---

# 8. Top Solver KPI Cards

正式 UI 必須顯示：

```text
Solver Status
Generated Heat
Rejected Heat
Energy Residual
Solved Nodes
Solved Edges
```

Example：

```text
SOLVED
412.3 W
412.1 W
0.05 %
42
47
```

可額外顯示：

```text
Active Scenario
```

但不要新增 Bottleneck KPI。

---

# 9. Solve Controls

Left panel：

```text
Active Scenario
Solve Network
Re-Solve
Reset Results
Pre-Solve Check
```

Active Scenario 來自 Screen 06。

若 status = DIRTY：

Primary CTA：

```text
Solve Network
```

若 SOLVED：

```text
Re-Solve
```

---

# 10. Scenario Summary

顯示只讀：

```text
Ambient
Wind
Solar
Power Basis（功耗：高溫 Pd／常溫 Pd）
Power Scale
Boundary Count
```

例如：

```text
55°C
0.0 m/s
0 W/m²
1.00×
4 boundaries
```

詳細 Boundary edit 必須回 Screen 06。

Button：

```text
Edit Boundary Conditions
```

---

# 11. Active Rth Source Handling

每條 Edge 可能保存：

```text
analytical
flotherm
measurement
manual
```

Solver 只使用：

```text
activeRthSource
```

07 不自動改來源。

若 active source 無 value：

pre-solve error。

---

# 12. Scenario-dependent Boundary Rth

Convection / Radiation / Combined boundary：

使用 Screen 06 當前 Scenario 產生的：

```text
scenario-specific Rth
```

不可誤用其他 Scenario 的 boundary Rth。

---

# 13. Matrix Assembly

對未知溫度 node：

```text
Gii += 1/Rij
Gij -= 1/Rij
```

若 j 為 fixed-temperature node：

```text
RHS_i += T_fixed / Rij
```

Heat source：

```text
RHS_i += Pi
```

Power 符號規則：

```text
positive = heat injected into network
```

---

# 14. Solver Numerical Requirements

V1：

- Dense matrix 可接受小型 network
- 架構需允許 future sparse solver
- Detect singular matrix
- Detect non-finite result
- Preserve double precision
- Solver engine 必須獨立於 React

Recommended：

```text
src/thermal/solver/
  assembleMatrix.ts
  solveLinearSystem.ts
  backCalculate.ts
  energyBalance.ts
  solverValidation.ts
```

---

# 15. Back-Calculation

Solve 完成後，每 Edge：

```text
Q = (T_from - T_to) / R_active
ΔT = T_from - T_to
```

保存：

```text
heatFlowResults.analytical
deltaTResults.analytical
```

若 Q < 0：

代表實際 heat flow direction 與 nominal UI direction 相反。

這是合法結果，不是 Error。

---

# 16. Node Result

每 node 保存 scenario-specific result：

```ts
temperatureResults.analytical = {
  value: number,
  unit: "C",
  source: "analytical",
  scenarioId,
  ...
}
```

Heat source node 同時可顯示：

```text
Power
Temperature
Limit
Margin
```

Margin：

```text
Limit - Temperature
```

07 可顯示單一 node margin。

但 **不做 worst-component ranking**；ranking 屬於 08。

---

# 17. Edge Result

每 Edge 顯示：

```text
Active Rth
Q
ΔT
From Temperature
To Temperature
Actual Heat Flow Direction
Rth Source
```

---

# 18. Energy Balance

求解後必須計算：

```text
Generated Heat
Rejected Heat to fixed/boundary sinks
Residual
Residual %
```

Recommended threshold：

```text
< 0.5%      GREEN
0.5–2.0%    WARNING
> 2.0%      ERROR / FAILED QUALITY
```

公式：

```text
Residual = P_generated - P_rejected
Error % = |Residual| / max(|P_generated|, ε) × 100
```

---

# 19. Rejected Heat

只計算穿越到：

```text
fixed-temperature node
ambient boundary sink
configured external sink
```

的 net heat flow。

避免把 internal edge Q 重複加總。

---

# 20. Graph Result Modes

Graph toolbar 必須提供：

```text
Temperature
Heat Flow
ΔT
Rth
Node Type
Rth Source
```

Default after solve：

```text
Temperature
```

Before solve：

只允許：

```text
Node Type
Rth
Rth Source
```

---

# 21. Temperature Mode

Node：

- color mapped by solved temperature
- show `°C`
- fixed-temperature boundary 使用 boundary badge

Edge：

- neutral unless selected
- optional Q label

必須有 Temperature legend。

---

# 22. Heat Flow Mode

Edge：

- line thickness by `|Q|`
- arrow direction by **actual solved Q**
- negative Q reverses arrow
- label `W`

Node 不用 heatmap。

必須有 Q magnitude legend。

---

# 23. ΔT Mode

Edge color / label：

```text
ΔT = Tfrom - Tto
```

Use signed value。

不要把 ΔT 直接叫 Bottleneck score。

---

# 24. Rth Mode

Edge color / label：

```text
Active Rth
```

來源 badge：

```text
A = Analytical
F = FloTHERM
M = Measurement
U = Manual
```

FloTHERM slot 未來可用；目前 03 Deferred。

---

# 25. Node Type Mode

與 Screen 05 類似：

- Heat Source
- Interface
- Base
- HSK
- Boundary

供 topology inspection。

---

# 26. Rth Source Mode

顯示 Edge：

```text
Analytical
Manual
Measurement
FloTHERM
Unresolved
```

03 尚未實作時 FloTHERM 不應有假的數值。

---

# 27. Graph Toolbar

```text
Select
Pan
Fit
Zoom
Auto Layout
Result Mode
Show Labels
Show Power
Show Limits
Show Boundary
Focus Path
```

禁止加入 `Bottleneck Ranking`。

---

# 28. Solved Graph Visual Rules

## Node
顯示：
```text
Name
Temperature
Power if source
Limit badge if applicable
```

## Edge
顯示：
```text
Rth
Q
ΔT
```
依 Result Mode 決定顯示欄位。

---

# 29. Node Inspector

Tabs：

```text
Overview
Thermal Result
Connections
Limit
Source
External Mapping
```

---

# 30. Node Inspector — Overview

```text
Node Name
Node Type
Component
Zone
Scenario
Solver Status
```

---

# 31. Node Inspector — Thermal Result

顯示：

```text
Temperature
Injected Power
Net Connected Heat Flow
Result Source
Scenario ID
Solved At
```

Heat source：

```text
Thermal Limit
Margin
```

Passive node：

Injected Power = 0。

---

# 32. Node Inspector — Connections

Table：

```text
Connected Edge
Other Node
Rth
Q
ΔT
Direction
```

Net balance：

```text
ΣQ + P
```

應接近 0。

---

# 33. Edge Inspector

Tabs：

```text
Overview
Solved Result
Rth Model
Source
External Mapping
```

---

# 34. Edge Inspector — Solved Result

```text
From
To
T_from
T_to
ΔT
Q
Actual Direction
Active Rth
```

---

# 35. Edge Inspector — Rth Model

顯示：

```text
Edge Type
Method
Active Rth Source
Analytical Rth
Manual Rth
Measurement Rth
FloTHERM Rth [reserved]
```

未存在的來源顯示：

```text
Not Available
```

---

# 36. Solver Validation Panel

Left lower section：

```text
Pre-Solve
Matrix
Boundary
Energy Balance
Result Integrity
```

Example after solve：

```text
✓ 42 solvable nodes
✓ 47 active edges
✓ 4 boundary sinks
✓ Matrix solved
✓ No NaN / Infinity
✓ Energy balance 0.05%
```

---

# 37. Solve Failure Handling

FAILED 顯示明確 reason：

```text
Singular matrix
Unresolved active Rth
Disconnected source
No fixed-temperature/boundary sink
Invalid numerical value
```

提供：

```text
Focus Issue
Go to Screen 05
Go to Screen 06
```

---

# 38. Stale Result Handling

status = DIRTY 時：

舊圖可以灰化保留，但必須 banner：

```text
Results are stale.
Network or scenario inputs changed after the last solve.
Re-solve required.
```

禁止把 stale result 當 current。

---

# 39. Reset Results

只清：

```text
current scenario analytical solution
```

不清：

- topology
- boundary conditions
- Rth definitions
- future FloTHERM imported results
- measurement data

---

# 40. Save Solution

保存：

```text
scenarioId
solver version
solvedAt
node temperatures
edge Q
edge ΔT
energy balance
solver warnings
```

---

# 41. Multi-Scenario Rule

每個 Scenario 保留自己的 analytical solution。

Switch Scenario：

若該 Scenario 已有未過期 solution：

顯示。

若 dirty / unsolved：

要求 Solve。

---

# 41b. 功耗基準（`Scenario.power_basis`，01 §51）

情境的「功耗」決定每顆元件的節點帶哪一個功耗：高溫 Pd（預設，04 的單顆功耗）或常溫 Pd（04 的常溫功耗）。

- 單一入口：`projectComponentMaster(..., { powerBasis })` → `componentPowerFor(component, basis) × 代表顆數`；`buildSolveInput` 由
  `solutionStore.gather` 帶 `powerBasisOf(scenario)`，再乘功耗倍率。`SolveInput.power_basis`、`solution.metadata.power_basis` 記下當時的基準。
- 常溫情境裡沒有常溫功耗的元件 → 用單顆功耗，並在檢查／結果的提醒列出（`rt_power_missing`，warning，`fix_in: '04'`）。
  **不寫「偏保守」**：濾波器、環形器的常溫 Pd 可能比高溫高（StarKcore-12L：Cavity Filter 24.85 → 31.07 W）。
- 簽章：基準是常溫時多一段 `basis=rt`（高溫不加，既有的解不會因此變成過期）；節點功耗本來就在簽章裡。
- 結果頁的功耗欄（07 的節點表、10 的節點表與「總功耗」拆分）用 `projectComponentLimits(network, components, basis)`：
  帶了基準就一併投影功耗 → 功耗欄＝這個情境求解時用的功耗，與旁邊的溫度一致。已經用求解輸入網路（`solveInput.network`）的地方不再投影（功耗已乘過倍率）。
- 測試：`src/thermal/graph/powerBasis.test.ts`、`src/data/scenarioPowerBasis.test.ts`。

---

# 42. Screen 03 Future Compatibility

未來 03 可提供：

```text
Node.temperatureResults.flotherm
Edge.heatFlowResults.flotherm
Edge.rth.flotherm
```

07 可在 future 顯示 source。

但 07 不負責 import / mapping。

---

# 43. Rule 4 Protection

07 可以由已知 Rth + solved temperatures 計算 Q：

```text
Q = ΔT / R
```

因為該 Edge 的 R 已知。

但 07 **不可反向用某段 ΔT + component Total Power 猜 Rth**。

尤其 branched network 不可：

```text
R_segment = ΔT / total component power
```

除非該 segment Q 已被 solver / measurement / CFD 明確知道。

---

# 44. No Bottleneck Analysis

> 2026-10 修訂：09 結果總覽併入 07 之後，07 的元件列表**依餘裕排序**（最緊的在最上面），見 §59。
> 熱阻鏈、敏感度、改善方案仍然只在 08。

07 不提供：

- Top 5 bottlenecks
- Sensitivity score
- Composite score
- Optimization recommendation
- Ranking

這些全部留給 08。

---

# 45. No Temperature Distribution Analytics

07 不提供：

- Histogram
- component temperature bar chart
- thermal map over physical housing
- distribution comparison chart

這些留給 09。

---

# 46. No Executive Summary

> 2026-10 修訂：整機的判定（最緊的元件、幾種超限／餘裕 ≤ 5 °C）在 07 的求解列與標題旁，見 §59；報告文字仍在 10。

07 不提供：

- pass/fail dashboard for entire product
- executive recommendations
- report narrative

這些留給 10 / 11。

---

# 47. Bottom Actions

> 2026-10 修訂（§59）：返回 05・儲存結果・瓶頸分析（開 08，帶最緊的元件）・前往 10 報告。求解前檢查與清除結果收在「求解細節」。

```text
Back to Boundary Conditions
Pre-Solve Check
Solve / Re-Solve
Save Solution
Continue to Bottleneck Analysis
```

Continue 條件：

```text
status = SOLVED or WARNING
energy balance acceptable for navigation
```

若 Energy Balance > 2%：

預設阻止 Continue，除非 future expert override；V1 不提供 override。

---

# 48. Status Bar

顯示：

```text
Project
Scenario
Network Status
Solver Status
Energy Balance
Last Solved
Auto Save
User
```

---

# 49. Empty State

若沒有 Network：

```text
No thermal network found.
Complete Screen 05 first.
```

若沒有 Boundary：

```text
Boundary conditions are incomplete.
Complete Screen 06 first.
```

---

# 50. Loading State

- graph skeleton
- KPI skeleton
- inspector disabled
- 不殘留上一 Scenario solved values

---

# 51. Read-only

允許：

- switch result mode
- pan / zoom
- inspect
- switch solved scenarios

禁止：

- solve if project policy locks compute
- change active Rth source
- reset solution
- save mutation

---

# 52. Solver Result Schema

```ts
type ThermalSolution = {
  scenarioId: string;
  status: 'SOLVED' | 'WARNING' | 'FAILED';
  solverVersion: string;
  solvedAt: string;

  nodeTemperaturesC: Record<string, number>;

  edgeResults: Record<string, {
    heatFlowW: number;
    deltaTC: number;
    actualDirection: 'forward' | 'reverse' | 'zero';
    activeRthCPerW: number;
    activeRthSource: ActiveRthSource;
  }>;

  energyBalance: {
    generatedW: number;
    rejectedW: number;
    residualW: number;
    errorPercent: number;
  };

  warnings: SolverIssue[];
  metadata?: Record<string, unknown>;
};
```

---

# 53. Store Contracts

```text
networkStore   [read]
scenarioStore  [read]
solverStore    [read/write]
componentStore [read limits / identity]
```

Solver result 不應寫回 component master data。

---

# 54. Recommended Modules

```text
src/
  screens/07-thermal-network/
    ThermalNetworkView.tsx
    SolverKpiBar.tsx
    SolveControlPanel.tsx
    ScenarioSummary.tsx
    SolvedGraphCanvas.tsx
    ResultModeToolbar.tsx
    NodeResultInspector.tsx
    EdgeResultInspector.tsx
    SolverValidationPanel.tsx
    EnergyBalancePanel.tsx

  thermal/solver/
    assembleMatrix.ts
    solveLinearSystem.ts
    backCalculate.ts
    energyBalance.ts
    solverValidation.ts
    solverTypes.ts
```

---

# 55. Acceptance Criteria

- AC-07-01 General graph solver supports series / parallel / branch / merge / cycle.
- AC-07-02 Multiple heat sources solve correctly.
- AC-07-03 Multiple fixed/boundary sinks supported.
- AC-07-04 Scenario-specific boundary Rth used.
- AC-07-05 Active Rth source respected.
- AC-07-06 Missing active Rth blocks solve.
- AC-07-07 Matrix singularity detected.
- AC-07-08 Node temperatures solved.
- AC-07-09 Edge Q back-calculated.
- AC-07-10 Edge ΔT calculated.
- AC-07-11 Reverse heat flow displayed correctly.
- AC-07-12 Energy balance calculated.
- AC-07-13 <0.5% green / 0.5–2 warning / >2 error.
- AC-07-14 Solver states work.
- AC-07-15 Dirty results become stale.
- AC-07-16 Reset Results only clears analytical solution.
- AC-07-17 Multi-scenario solutions stay separate.
- AC-07-18 Temperature result mode works.
- AC-07-19 Heat Flow result mode works.
- AC-07-20 ΔT mode works.
- AC-07-21 Rth mode works.
- AC-07-22 Node Type mode works.
- AC-07-23 Rth Source mode works.
- AC-07-24 Node inspector shows temperature / power / margin.
- AC-07-25 Edge inspector shows Rth / Q / ΔT / direction.
- AC-07-26 No Bottleneck ranking exists.
- AC-07-27 No Temperature Distribution analytics exists.
- AC-07-28 No FloTHERM parser exists.
- AC-07-29 Analytical / FloTHERM / Measurement slots remain separate.
- AC-07-30 Fixed App Shell.
- AC-07-31 English-primary + zh-TW support.
- AC-07-32 Empty/loading/error/read-only/dirty states exist.
- AC-07-33 Continue routes to Screen 08 only after valid solve.

---

# 56. Developer Test Cases

## Test A — Simple Series
```text
Source 10W → R1=1 K/W → R2=1 K/W → Fixed 20°C
```
Expected：
```text
Middle = 30°C
Source = 40°C
Q = 10W both edges
```

## Test B — Parallel
Two equal 2 K/W paths from 10W source to same 20°C boundary.

Expected：
```text
5W each branch
```

## Test C — Reverse Coupling Flow
Shared nodes with temperature ordering opposite nominal edge direction.

Expected：
```text
Q negative
Actual Direction = reverse
No solver error
```

## Test D — Multiple Sources
Two sources merge to common base and ambient.

Expected：
energy balance includes both source powers exactly once.

## Test E — Singular
Disconnected passive island with no boundary constraint causing singular block.

Expected：
FAILED with focusable issue.

## Test F — Dirty
Solve → change h_conv in 06 → return 07.

Expected：
stale banner + DIRTY + old results not current.

## Test G — Multi Scenario
55°C and 25°C scenarios.

Expected：
solutions stored separately.

---

# 57. UI ↔ MD Audit Checklist

正式 `07_Thermal_Network.png` 必須看到：

- [ ] Fixed App Shell
- [ ] 07 active
- [ ] 03 Deferred
- [ ] Solver Status KPI
- [ ] Generated Heat
- [ ] Rejected Heat
- [ ] Energy Residual %
- [ ] Solved Nodes
- [ ] Solved Edges
- [ ] Active Scenario summary
- [ ] Solve / Re-Solve control
- [ ] Pre-Solve Check
- [ ] Result Mode selector
- [ ] Temperature mode visible in formal PNG
- [ ] General solved thermal graph
- [ ] Node temperatures
- [ ] Source power shown
- [ ] Boundary fixed temperature shown
- [ ] Edge Rth
- [ ] Edge Q
- [ ] Edge ΔT
- [ ] Temperature legend
- [ ] Right Node or Edge Inspector
- [ ] Rth Source
- [ ] Actual heat-flow direction
- [ ] Energy Balance panel
- [ ] Solver validation panel
- [ ] Back to 06
- [ ] Save Solution
- [ ] Continue to 08
- [ ] No Bottleneck ranking
- [ ] No sensitivity score
- [ ] No histogram / distribution charts
- [ ] No fake FloTHERM data

PNG 出現任何 MD 沒定義的新功能，不得交給 Codex。

---

# 58. Final Principle

**05 建拓撲並設邊界，07 求解並列出每顆元件的餘裕。07 的任務是把 General Thermal Graph 變成可驗證的 Temperature / Heat Flow / ΔT 解，並說出哪一顆最緊；熱阻鏈與改善方案仍然是 08 的事。**

---

# 59. 07＋09 合併：求解與結果（2026-10）

09 結果總覽併進 07，07 改名「求解與結果」（側欄群組「求解與分析」：07、08）。按一次求解就看到每顆元件的溫度、限溫、餘裕，
不用再到 09 開同一張表。09 的號碼留空（同 06）；`/results` 導到 07（帶 query string）。

**版面**

- 標題旁：求解狀態（尚未求解／已求解／已求解・有警告／結果已失效／求解失敗）、判定（N 種超限 → 紅；N 種餘裕 ≤ 5 °C → 琥珀；全部通過 → 綠）、
  情境一行（`環溫 45.0 °C・無風・無日照・高溫 Pd × 1.00`，`scenarioLine`）＋「到 01 修改」。原本的情境摘要卡拿掉。
- 求解列（`SolveBar`，取代 KPI 列與左側的求解設定卡）：一顆「求解／重新求解」＋四格——
  - 最緊的元件：餘裕（signed °C）、`Ts 93.6 / 95 · 元件名`；
  - 環溫還能升：最小餘裕、`到 46.4 °C`（`ambientHeadroom`，有固定溫度節點時註明僅供參考）；
  - 總發熱：元件＋日照，tooltip 列出各分類（`powerByCategory`）；
  - 能量平衡：誤差 %、`排出 X W · 良好／偏大／過大`。
  - 「求解細節」（預設收起）：求解引擎、矩陣、主元容許值、功率倍率、上次求解、求解時間、能量平衡門檻（可改）、求解前檢查、清除結果。
- 左：元件結果（`ComponentResultsPanel`，可拖寬、可收起）。右：熱網路（照舊），**預設「群組總覽」**；底下的能量平衡列拿掉（求解列已有）。
- 底部：返回 05・儲存結果・瓶頸分析・前往 10 報告。前往 08／10 的條件同 §47（有結果、沒失效、能量平衡在錯誤門檻內），按鈕的 tooltip 寫出原因。

**元件結果**

- 只列元件（共用結構、手動節點留在完整結果表），排序 `componentResultOrder`：餘裕小的在上；沒有限溫的排最後、熱的在前；同餘裕比溫度、再比名稱。
- 「溫度」＝**限溫位置的溫度**（`judged_C`：限溫最緊那個節點的溫度），所以溫度、限溫、餘裕三格對得起來。
  原本列的是元件裡最熱的節點（`peak_C`）：Tc 元件會顯示接面溫度，2GB_DDR 寫 96.6 °C、限溫 95 °C Tc、餘裕 +6.0 通過，三個數字對不起來
  （外殼其實 89.0 °C）。最熱節點放在 tooltip；完整結果表的元件列也改成 `judged_C`。
- 點一列 → 右邊熱網路聚焦這顆的路徑（多顆的元件取限溫最緊的那一顆）；再點一次回到原本的檢視。
- 展開（▸）→ 這顆的各節點（名稱、角色、溫度、各自的限溫與餘裕）；連線的溫差／熱流／熱阻在「完整結果表」（原本的結果視窗，可輸出 PDF）。
- 列尾 ⌖ → 開 08 這一顆：`/bottleneck?part=<限溫節點 id>`。08 的元件下拉列出所有有限溫的元件（08 §35），直接選好這一顆，
  就算餘裕 > 5 °C 也一樣；開一次就好，之後選別的不會被拉回來。

**報告快照（D3）**

- 09 的「準備報告快照」拿掉：10 在**這個情境還沒有快照**時自己用目前的結果建立（`snapshotToFreeze`；判斷「沒有」看儲存的資料，不看還沒載入的 store；
  等 10 自己載入完 store 才建立，避免凍結到上一頁留下的狀態）。
- 已經有的快照**不會被默默換掉**：結果改過時 10 顯示琥珀色「報告用的是舊結果」＋「更新為目前結果」，按了才換。目前的結果不能用（失效、失敗）→ 改成「前往 07 重新求解」。

**中文為主**

- 07 的標題、徽章、圖面著色（溫度＋溫差／熱流／熱阻／節點類型／熱阻來源）、顯示選項（標籤／功耗／限溫／邊界）、完整結果表的欄名與狀態（通過／警告／超限）、
  求解訊息（中文在上、英文在下一行小字）、提示訊息都改成中文；溫差單位 °C（原本 K）。`RESULT_MODES[].label` 仍是英文，給檔名與匯出用。
- tooltips 去掉夾雜的英文（`T07`）。

**測試**

- `resultTree.test.ts`：Tc 元件判定在外殼、`componentResultOrder` 的排序與排除。
- `studyButtons.test.ts`：08 元件下拉 `partOptions`（依餘裕編號、需要注意分組）。
- `report.test.ts`：`snapshotToFreeze`（沒有快照才自動建立、要按才換、BLOCKED 不建立）。
- `resultsOverlay.test.tsx`、`resultTable.test.tsx`：完整結果表的按鈕只在全螢幕、中文欄名。
- 瀏覽器（StarKcore-12L，1280／1536／1920）：9 種元件依餘裕排序（Power Module +1.4、XCZU67DR +2.9、2GB_DDR 89.0 / 95 Tc +6.0…）、
  點列聚焦與還原、⌖ 開 08 在 2GB_DDR、`/results` 導到 07、10 自動建立快照（CURRENT）與「更新為目前結果」。
