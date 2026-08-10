# 00 — 5G FR1 Thermal Network Visualizer
## Product Vision & Architecture
### Master Development Brief for Codex

**Document ID:** `00_Product_Vision_and_Architecture`  
**Project:** 5G FR1 Thermal Network Visualizer  
**Subtitle:** RRU Thermal Path & Bottleneck Analyzer  
**Document Role:** Product Constitution / Architecture Source of Truth  
**Status:** Development Baseline  
**Language:** zh-TW + engineering terminology in English  
**Target:** Codex / AI coding agent / future maintainers / thermal engineering reviewers  

---

# 0. 文件用途

本文件不是單一 UI 頁面的功能說明，而是整個 **5G FR1 Thermal Network Visualizer** 的最高層設計原則。

後續所有開發文件：

```text
01_Project_Info.md
02_Import_Components.md
03_Import_FloTHERM.md
04_Component_Manager.md
05_Thermal_Path_Builder.md
06_Boundary_Conditions.md
07_Thermal_Network.md
08_Bottleneck_Analysis.md
09_Temperature_Distribution.md
10_Results_Overview.md
11_Report_Preview.md
12_Export_Center.md
```

以及所有對應 UI mockup，都必須遵守本文件。

若後續某一個 Screen 的局部需求與本文件的核心架構衝突：

> **優先維持本文件定義的 Thermal Graph / Solver / Data Provenance / Physics Correctness 原則。**

不得為了快速完成單一 UI，而破壞通用 Thermal Network 架構。

---

# 1. 產品背景

現有專案：

`5G-RRU-Quick-Volume-Evaluation-Tool`

已經可以在基站開發早期，透過：

- RF components
- Digital components
- Power components
- Component power
- Rjc
- TIM
- PCB / Thermal Via
- Copper Coin
- Material properties
- Heat sink geometry
- Natural convection model
- Temperature limit
- Thermal margin

快速估算：

- Required heat sink area
- Fin height
- RRU size
- Volume
- Weight
- Component temperature
- Thermal margin
- Preliminary bottleneck

這個工具適合回答：

> **「這樣的總功耗與元件條件，大概要多大的散熱器？」**

但隨著產品進入：

```text
Architecture
→ CAD
→ Detailed Mechanical Design
→ FloTHERM CFD
→ EVT / DVT
→ Thermal Validation
```

熱問題會從「整機需要多少散熱能力」變成：

> 熱從哪一顆 IC 出來？

> 經過哪一段 TIM / PCB / Copper Coin / Small Base / Heat Pipe / Main Base？

> 哪一段造成最大溫降？

> 多顆元件共用 Main Base 時，彼此如何熱耦合？

> 為什麼 FloTHERM 中某顆元件比 Quick Estimate 高很多？

> 如果只能改善一個位置，改 TIM、Base、Heat Pipe 還是 Heat Sink 最有效？

這些問題不能再只用固定的串聯式熱阻公式回答。

因此需要第二套工具：

# **5G FR1 Thermal Network Visualizer**

---

# 2. 產品使命

本工具的核心使命是：

> **把複雜的 5G FR1 基站熱傳路徑，轉換成可計算、可視覺化、可解釋、可比較、可最佳化的 Thermal Resistance Network。**

工具不是單純畫圖，也不是取代 FloTHERM。

它必須把：

```text
Hardware Architecture
+
Thermal Properties
+
Analytical Model
+
FloTHERM Results
+
Measurement
```

轉換成：

```text
Thermal Nodes
+
Thermal Edges
+
Boundary Conditions
+
Network Solver
```

最後輸出：

```text
Temperature
Heat Flow
Rth
ΔT
Thermal Margin
Energy Balance
Bottleneck
Sensitivity
Engineering Recommendation
```

---

# 3. 本工具必須回答的五個問題

產品完成後，任何使用者至少應該能回答以下五個問題。

## Q1 — 哪裡最熱？

例如：

```text
Final PA #1
Tj = 171.5°C
Limit = 180°C
Margin = +8.5°C
```

---

## Q2 — 為什麼這裡這麼熱？

工具應能顯示：

```text
PA Junction
↓ Rjc
PA Case
↓ Solder
Copper Coin
↓ TIM
Small Base
↓ Heat Pipe / Direct Conduction
Main Base
↓ Fin
Ambient
```

以及每段：

```text
Rth
Q
ΔT
Source
Confidence
```

---

## Q3 — 熱主要卡在哪裡？

不能只看最大 Rth。

必須綜合：

```text
Rth
Heat Flow
ΔT
Temperature Margin Impact
Sensitivity
```

---

## Q4 — 改哪裡最有效？

例如：

```text
TIM Rth -20% → PA Tj -1.8°C
Heat Pipe Rth -20% → PA Tj -3.2°C
Main Base Spreading Rth -20% → PA Tj -5.6°C
HSK-to-Air Rth -20% → PA Tj -7.4°C
```

工具應明確指出：

> **優先改善 HSK-to-Air path。**

---

## Q5 — FloTHERM 與 Analytical Model 差在哪裡？

例如：

```text
Path                 Analytical   FloTHERM    Difference
TIM                    0.12         0.15        +25%
Copper Coin            0.05         0.06        +20%
Main Base Spread       0.08         0.14        +75%
HSK → Ambient          0.31         0.34        +10%
```

工具應讓 Thermal Engineer 快速知道：

> Quick model 主要低估的是 Main Base spreading。

---

# 4. 產品不是什麼

Codex 開發時必須理解以下邊界。

## 4.1 不是 FloTHERM Replacement

本工具不負責：

- CFD meshing
- Navier-Stokes
- Turbulence modeling
- Radiation view factor full solution
- Detailed fluid domain solution
- Full 3D conjugate heat transfer

FloTHERM 仍然負責高精度 CFD。

本工具負責：

> **把 CFD 結果轉換成可理解的 Engineering Thermal Network。**

---

## 4.2 不是靜態 Diagram Tool

不能只讓使用者畫：

```text
IC → TIM → Base → HSK
```

然後顯示文字。

必須有真正的：

```text
Thermal Network Solver
```

---

## 4.3 不是只有單一路徑

不能 hard-code：

```text
Junction → Case → TIM → HSK → Ambient
```

FR1 RRU 必須允許：

- Series
- Parallel
- Branch
- Merge
- Shared Base
- Shared Fin
- Heat Pipe
- PCB heat spreading
- Multiple heat rejection paths
- Multiple heat sources

---

# 5. 與既有 Volume Evaluation Tool 的關係

新工具應視為現有工具的延伸，而不是完全獨立重做。

---

# 5.1 可重用的既有資料

現有工具已具有：

```text
RF Components
Digital Components
PWR Components
```

典型 Component data：

```text
Component
Qty
Power(W)
Height(mm)
Pad_L
Pad_W
Thick(mm)
Board_Type
Limit(C)
R_jc
TIM_Type
```

亦已有 Global thermal parameters，例如：

```text
T_amb
Margin
PCB size
Heat Sink Base thickness
Gap
Fin thickness
Thermal Via K
Via Efficiency
TIM K
TIM Thickness
Solder K
Solder Thickness
Voiding
```

這些資料應盡量重用。

---

# 5.2 不應重複維護 Component Master Data

新工具不應建立第二套完全獨立的：

```text
RF Library
Digital Library
Power Library
```

正確方向：

```text
Existing Component Data
        ↓
Thermal Profile Extension
        ↓
Thermal Network
```

---

# 5.3 建議新增 Thermal Profile

既有 Component Record 不要塞入過多 Graph-specific data。

建議額外擴充：

```json
{
  "thermal_profile": {
    "architecture": "BOTTOM_COOL_COIN",
    "package_model": "RJC",
    "base_zone": "RF_LEFT",
    "cooling_destination": "MAIN_BASE",
    "coin_enabled": true,
    "thermal_via_enabled": false,
    "heat_pipe_enabled": false,
    "template_id": "TPL_PA_BOTTOM_COIN"
  }
}
```

---

# 5.4 兩套工具長期形成閉環

理想流程：

```text
5G RRU Quick Volume Tool
        ↓
Early Thermal Estimate
        ↓
Heat Sink / Volume Estimate
        ↓
CAD / Mechanical Design
        ↓
FloTHERM
        ↓
Thermal Network Visualizer
        ↓
Extract Effective Rth / Bottleneck
        ↓
Historical Correlation
        ↓
Improve Quick Model
        ↓
Next Project Estimate Becomes More Accurate
```

這是長期產品價值的重要方向。

---

# 6. 核心資料哲學：Node + Edge

整個產品底層必須建立在：

# **General Thermal Graph**

而不是固定式計算流程。

---

# 6.1 Thermal Node

Thermal Node 代表：

> 一個有物理意義的溫度狀態點或熱邊界。

例如：

```text
PA Junction
PA Case
PA EPAD
Copper Coin Top
Copper Coin Bottom
Small Base
Heat Pipe Evaporator
Heat Pipe Condenser
Main Base RF Zone
Main Base Digital Zone
Fin Root
Fin Surface
Internal Air
Ambient
```

---

# 6.2 Thermal Edge

Thermal Edge 代表：

> Node A 與 Node B 之間的熱傳路徑 / 等效熱阻。

例如：

```text
Rjc
Conduction
TIM
Solder
Thermal Via
Contact Resistance
Spreading Resistance
Heat Pipe
Convection
Radiation
Custom Rth
```

---

# 6.3 基本 Graph

```text
Node A
  │
 Edge
  │
Node B
```

Edge 至少需具有：

```text
From Node
To Node
Rth
Heat Flow
ΔT
Source
Confidence
Enabled
```

---

# 6.4 Graph 必須支援 Parallel Path

例如：

```text
PA Case
   │
   ├── TIM → Main Base
   │
   └── PCB → Chassis
```

不能限制一個 Node 只有一個 downstream。

---

# 6.5 Graph 必須支援 Merge

例如：

```text
PA1 ─┐
PA2 ─┤
PA3 ─┤
PA4 ─┴→ RF Main Base
```

---

# 6.6 Graph 必須支援 Shared Thermal Nodes

例如：

```text
RF Base ─┐
         ├→ Common Heat Sink
DIG Base ┘
```

這會造成 thermal coupling。

---

# 7. Thermal Node Schema

建議 V1：

```json
{
  "id": "PA1_JUNCTION",
  "name": "Final PA #1 Junction",
  "type": "junction",
  "category": "RF",

  "component_ref": "Final_PA",
  "zone": "RF_LEFT",

  "power_W": 52.13,

  "temperature_C": null,
  "temperature_source": null,

  "limit_C": 180,
  "limit_type": "Tj",

  "boundary_type": null,
  "fixed_temperature_C": null,

  "simulation_alias": null,

  "position": {
    "x": 0,
    "y": 0
  },

  "metadata": {}
}
```

---

# 8. Thermal Edge Schema

```json
{
  "id": "EDGE_PA1_RJC",

  "from": "PA1_JUNCTION",
  "to": "PA1_CASE",

  "type": "package_rjc",

  "method": "direct_rth",

  "R_C_per_W": 0.18,

  "heat_flow_W": null,
  "delta_T_C": null,

  "data_source": "Datasheet",

  "confidence": "high",

  "scenario_overrides": {},

  "enabled": true,

  "parameters": {},

  "metadata": {}
}
```

---

# 9. Node Types

V1 建議支援：

```text
Heat Source
Junction
Die
Case
Lid
EPAD

PCB
Thermal Via
Copper Coin

TIM Interface
Solder Interface

Pedestal
Small Base
Main Base
Base Zone
Housing

Heat Pipe Evaporator
Heat Pipe Condenser

Heat Sink Base
Fin Root
Fin Surface

Internal Air
External Air
Ambient

Custom Node
```

---

# 10. Edge Types

V1 至少支援以下類型。

---

## 10.1 Package

```text
Rjc
Rjb
Rja
Custom Package Rth
```

---

## 10.2 Solid Conduction

公式：

```text
R = L / (k A)
```

適用：

- Aluminum
- Copper
- Steel
- PCB equivalent
- Metal block
- Housing

---

## 10.3 TIM

適用：

- Grease
- Pad
- Putty
- Gap filler
- PCM
- Custom TIM

---

## 10.4 Solder

可考慮：

- Solder K
- Thickness
- Effective area
- Voiding

---

## 10.5 Thermal Via

需支援：

- PCB thickness
- effective conductivity
- via efficiency
- effective spreading area

---

## 10.6 Contact Resistance

適用：

```text
Small Base ↔ Main Base
Heat Pipe ↔ Groove
Metal-to-metal
Screw-clamped interface
```

可使用：

```text
Direct Rth
```

或：

```text
Area normalized contact resistance
```

---

## 10.7 Heat Pipe

V1 不需實作完整 two-phase physics。

先支援：

```text
Equivalent Heat Pipe Rth
```

未來可拆：

```text
R_evap
R_axial
R_cond
```

---

## 10.8 Spreading Resistance

這是 FR1 Tool 的重要 Edge Type。

例如：

```text
Small Hot Area
      ↓
Large Aluminum Base
```

不能永遠使用一維：

```text
L / kA
```

需要允許來源：

- Correlation
- FloTHERM
- Measurement
- Vendor
- Manual

---

## 10.9 Convection

```text
R_conv = 1 / (h_conv A)
```

---

## 10.10 Radiation

```text
R_rad = 1 / (h_rad A)
```

如採 equivalent linearized h。

---

# 11. HSK → Ambient 的物理架構

Convection 與 Radiation 在物理上通常是 parallel heat rejection paths：

```text
              ┌─ Convection ─→ Ambient
Fin Surface ──┤
              └─ Radiation ──→ Ambient / Radiative Surrounding
```

只有使用：

```text
h_total = h_conv + h_rad
```

時，才可合併為 equivalent edge。

UI / data model 應允許兩種 representation。

---

# 12. Thermal Solver

本工具必須具有真正的 Nodal Thermal Network Solver。

---

# 12.1 Edge Heat Flow

對任意 Edge：

```text
Qij = (Ti - Tj) / Rij
```

---

# 12.2 Node Energy Balance

對每個非 fixed-temperature node：

```text
Pi = Σ ((Ti - Tj) / Rij)
```

其中：

```text
Pi > 0  → Heat Source
Pi = 0  → Passive Node
```

---

# 12.3 Matrix Form

Solver 建立：

```text
[G][T] = [P]
```

求出所有未知：

```text
T
```

再回算：

```text
Q_edge
ΔT_edge
```

---

# 12.4 Solver 必須支援

- Multiple heat sources
- Fixed-temperature boundary
- Series network
- Parallel network
- Branch
- Merge
- Shared nodes
- Multiple ambient nodes
- Disabled edges
- Scenario-specific values

---

# 12.5 Solver 不應 hard-code Component Type

Solver 不應知道：

```text
PA
FPGA
DDR
```

Solver 只應處理：

```text
Nodes
Edges
Power
Boundary Conditions
```

Component architecture 應由 Network Builder 負責。

這是重要 separation of concerns。

---

# 13. Solver State

UI 必須清楚區分：

```text
READY
DIRTY
SOLVING
SOLVED
WARNING
FAILED
```

以下任一變動均必須將既有 result 標記為 `DIRTY`：

- Component power 改變
- Edge Rth 改變
- Node power 改變
- Boundary 改變
- Scenario 改變
- Edge enable / disable
- Graph topology 改變

不得 silently 繼續顯示舊 solve 結果。

---

# 14. Energy Balance

每次 Solve 後必須檢查：

```text
Total Heat Generated
Total Heat Rejected
Residual
Error %
```

建議預設 UI：

```text
< 0.5%      Green
0.5–2.0%    Warning
> 2.0%      Error
```

threshold 可在 Settings 中設定。

---

# 15. 三種 Thermal Data 模式

本工具必須同時支援以下三種實際工作模式。

---

# 15.1 Mode A — Analytical / Quick Estimate

適合：

- Concept
- Architecture
- Pre-CFD

Edge Rth 來源可能是：

```text
Rjc
L/kA
TIM
Thermal Via
Contact estimate
Heat Pipe vendor data
HSK correlation
```

---

# 15.2 Mode B — FloTHERM Calibrated

完成 CFD 後，可匯入：

```text
Node Temperature
Interface Heat Flow
```

計算：

```text
R_eff = ΔT / Q
```

---

# 15.3 Mode C — Hybrid

實際工程中最常見。

例如：

```text
Rjc                    Datasheet
Solder                 Analytical
Copper Coin            Analytical
TIM                     Analytical
Small Base Spreading    FloTHERM
Heat Pipe               Vendor
Main Base Spreading     FloTHERM
HSK → Ambient           FloTHERM
```

所有 Edge 必須允許不同 Data Source。

---

# 16. Data Provenance

任何 thermal value 都必須能回答：

> **這個數字從哪裡來？**

Source enum 建議：

```text
Analytical
Datasheet
FloTHERM
Measurement
Vendor
Manual
Assumed
```

至少記錄：

```text
Source
Reference
Scenario
Timestamp
Confidence
```

---

# 17. Confidence

建議：

```text
High
Medium
Low
```

例如：

## High

- Datasheet Rjc
- Measurement
- FloTHERM with resolved interface Q

## Medium

- Analytical TIM
- Vendor Heat Pipe Rth
- Correlation

## Low

- Manual assumption
- Approximate spreading resistance
- Temperature-only CFD inference

---

# 18. 最重要的物理保護規則

# **Never derive segment thermal resistance from ΔT unless the heat flow through that segment is known.**

這是整個產品不可違反的核心規則。

---

# 18.1 錯誤案例

```text
PA Power = 50W

           ┌── 40W → Base
PA ────────┤
           └── 10W → PCB
```

已知：

```text
T_PA   = 100°C
T_Base = 80°C
```

若直接算：

```text
R = (100 - 80) / 50
```

是錯誤或至少無法保證正確。

因為真正流過 Base path 的 Q 是：

```text
40W
```

---

# 18.2 正確行為

如果：

```text
Edge Heat Flow Q known
```

則：

```text
R_edge = ΔT_edge / Q_edge
```

如果：

```text
Q unknown
```

則該 Edge 應標記：

```text
Unresolved
Estimated
Effective Path Only
```

不能標記成精確的 FloTHERM segment Rth。

---

# 18.3 Temperature-only Data

如果只有：

```text
Tj
Ambient
Component Power
```

最多只能得到：

```text
Total Effective Path Rja
```

例如：

```text
Rja_eff = (Tj - Tamb) / Power
```

不能唯一拆成：

```text
Rjc
RTIM
Rbase
Rhsk
```

---

# 19. FloTHERM 在本工具中的定位

理想流程：

```text
FloTHERM Model
      ↓
Solve
      ↓
Post Processing
      ↓
Temperature Table
+
Interface Heat Flow Table
      ↓
CSV / Excel
      ↓
Thermal Network Importer
      ↓
Node / Edge Mapping
      ↓
Effective Rth
      ↓
Thermal Network Calibration
```

---

# 20. FloTHERM Mapping

每個 Node 可包含：

```text
simulation_alias
```

例如：

```text
Thermal Node:
PA1_CASE

FloTHERM Object:
RF_Board/PA_01/Package
```

Mapping data：

```json
{
  "scenario_id": "SCN_EVT2_55C",
  "flotherm_object": "RF_Board/PA_01/Package",
  "thermal_node_id": "PA1_CASE",
  "temperature_type": "average",
  "confidence": "high"
}
```

---

# 21. Analytical 與 FloTHERM 值不得互相覆蓋

Edge 應可同時保存：

```text
Analytical Rth
FloTHERM Rth
Measurement Rth
Active Rth
```

例如：

```json
{
  "rth": {
    "analytical": 0.12,
    "flotherm": 0.15,
    "measurement": null,
    "active_source": "FloTHERM"
  }
}
```

這讓工具可做：

```text
Analytical vs CFD vs Measurement
```

比較。

---

# 22. Bottleneck 的定義

本工具不可使用：

> **最大 Rth = 最大 Bottleneck**

作為唯一判定。

---

# 22.1 為什麼

例如：

```text
Edge A:
R = 1.0°C/W
Q = 2W
ΔT = 2°C
```

```text
Edge B:
R = 0.2°C/W
Q = 50W
ΔT = 10°C
```

雖然：

```text
R_A > R_B
```

但：

```text
ΔT_B > ΔT_A
```

Edge B 對熱問題更重要。

---

# 23. Bottleneck 第一層分析

每條 Edge 至少計算：

```text
Rth
Q
ΔT
```

其中：

```text
ΔT = Q × Rth
```

排名可提供：

- Rth Rank
- Q Rank
- ΔT Rank

---

# 24. Bottleneck 第二層：Sensitivity

Sensitivity 是本工具最重要的設計決策功能之一。

流程：

```text
Original Network
      ↓
Select Edge
      ↓
Reduce Rth by 20%
      ↓
Re-solve Complete Network
      ↓
Compare Worst Component Temperature
```

例如：

```text
Main Base Spreading Rth
0.14 → 0.112°C/W

Worst PA:
172.0 → 166.5°C

Benefit:
-5.5°C
```

---

# 25. Shared Network 中 Sensitivity 必須 Re-solve

禁止使用：

```text
Edge ΔT × 20%
```

直接當成元件改善值。

因為 shared network 中：

- Heat flow 可能重新分配
- Parallel path 比例會改
- Shared base temperature 會改
- 其他 component temperature 會跟著改

因此 Sensitivity 必須重新 solve 整張 Graph。

---

# 26. Recommended Bottleneck

建議最後提供：

```text
Resistance Rank
ΔT Rank
Heat Flow Rank
Sensitivity Rank
Margin Impact
Confidence
```

其中最重要的是：

> **改善該 Edge 後，Worst Component Temperature / Margin 改善多少。**

---

# 27. Composite Score

初始可使用：

```text
Composite Score =
35% × normalized ΔT
+
45% × normalized Sensitivity
+
20% × normalized Margin Impact
```

Rth 本身顯示但不需要直接佔主 score。

未來可調整權重。

---

# 28. FR1 專用 Shared Base Model

大型 RRU / AAU 不應永遠把 Main Base 視為單一等溫 Node。

工具需要提供不同精度。

---

# 28.1 Level 1 — Single Base

```text
All Components
      ↓
MAIN BASE
      ↓
HSK
```

適合：

- Early estimate

---

# 28.2 Level 2 — Vertical Zones

```text
BASE TOP
   │
BASE MID
   │
BASE BOTTOM
```

使用 spreading edges 連接。

---

# 28.3 Level 3 — Functional Zones

例如：

```text
RF LEFT
RF RIGHT
DIGITAL
POWER
FILTER
```

---

# 28.4 Level 4 — CFD Calibrated Zones

利用 FloTHERM：

- Surface average temperature
- Monitor points
- Interface heat flow

校正：

```text
R_spread
```

---

# 29. Architecture Template System

使用者不應每次從空白 Graph 建立。

系統應提供 FR1 Thermal Architecture Templates。

---

# 29.1 Template A — PA Bottom Cool + Copper Coin

```text
PA Junction
→ PA Case
→ Solder
→ Copper Coin
→ TIM
→ Main Base
```

---

# 29.2 Template B — FPGA Top Cool

```text
Junction
→ Lid
→ TIM
→ Pedestal
→ Main Base
```

---

# 29.3 Template C — Bare Die

```text
Die
→ TIM
→ Base
```

---

# 29.4 Template D — Thermal Via

```text
Junction
→ EPAD
→ PCB / Thermal Via
→ TIM
→ Main Base
```

---

# 29.5 Template E — Small Base + Heat Pipe

```text
IC
→ TIM
→ Small Base
→ Heat Pipe
→ Main Base
```

同時允許：

```text
Small Base
→ Direct Aluminum Conduction
→ Main Base
```

形成 parallel path。

---

# 30. UI 最高原則：Basic + Expert

同一套資料，需要不同深度的呈現。

---

# 30.1 Basic View

對象：

- RF
- EE
- ME
- PM
- Manager

主要回答：

```text
哪裡最熱？
哪顆最危險？
哪裡溫降最大？
主要瓶頸在哪？
改哪裡最有效？
```

只顯示必要資訊。

---

# 30.2 Expert View

對象：

- Thermal Engineer

顯示：

```text
Rth
Q
ΔT
Tj
Tc
Margin
Area
K
Thickness
Source
Confidence
Solver Residual
Analytical vs FloTHERM
Sensitivity
```

---

# 31. Thermal Network Visualization

主圖必須是 interactive graph。

---

# 31.1 Node

Heat Source Node 可顯示：

```text
Final PA #1

52.1 W
Tj 172°C
Limit 180°C
Margin +8°C
```

Passive Node：

```text
RF Base Zone
94.2°C
```

---

# 31.2 Edge

Expert：

```text
R 0.156°C/W
Q 48.6W
ΔT 7.6°C
Source FloTHERM
```

Basic：

```text
ΔT 7.6°C
```

---

# 31.3 Edge Thickness

建議代表：

```text
Heat Flow Q
```

---

# 31.4 Edge Color

可依：

- Temperature drop
- Bottleneck severity
- Rth
- Source

切換。

---

# 31.5 Node Color

可依：

- Temperature
- Margin
- Category
- Source

切換。

---

# 32. Thermal Ladder

選取一顆 Heat Source，工具應自動提供 Source-to-Ambient path。

例如：

```text
PA Junction    172°C
    ↓ 8°C
PA Case        164°C
    ↓ 12°C
TIM            152°C
    ↓ 6°C
Small Base     146°C
    ↓ 31°C
Main Base      115°C
    ↓ 60°C
Ambient         55°C
```

如果存在多條 path：

- 顯示 Dominant Path
- 允許切換 Alternate Paths

---

# 33. Sankey Heat Flow

輔助畫面可提供：

```text
RF       250W ─┐
Digital   60W ─┼→ Main Base
Power     50W ─┘

Main Base
 ├→ Convection 280W
 ├→ Radiation   60W
 └→ Housing     20W
```

Sankey 是輔助視圖。

底層仍是 Graph Solver。

---

# 34. Scenario Architecture

同一個 Thermal Network topology 應支援多 Scenario。

例如：

```text
55°C / 0 m/s
46°C + Solar
25°C Lab
55°C + 1 m/s
Normal Mode
Pi Mode
Fan ON
Fan OFF
```

Scenario 可 override：

- Power
- Ambient
- Wind
- Solar
- Edge Rth
- Boundary h
- Heat pipe performance

但不應複製整張 Graph。

---

# 35. Project 與 Thermal Network 儲存架構

現有 project data 持續保留：

```text
projects
```

新工具建議新增：

```text
thermal_networks
```

---

# 35.1 建議 Schema

```json
{
  "thermal_networks": {
    "PROJECT_ID": {
      "schema_version": "1.0",
      "project_id": "PROJECT_ID",
      "network_name": "Main Thermal Network",
      "mode": "hybrid",

      "nodes": {},
      "edges": {},
      "scenarios": {},
      "flotherm_mappings": {},

      "solver_settings": {},
      "metadata": {}
    }
  }
}
```

---

# 35.2 與既有 Shared DB 的原則

如果與既有工具共用 DB：

- 不可假設自己擁有整顆 project document。
- 不得用整顆替換方式把其他工具欄位覆蓋。
- Shared nested data 寫入前要保留未知 sibling fields。
- 新工具獨有的大型資料建議放獨立 collection。
- 需維持壞檔 / concurrent write protection。

---

# 36. App Architecture

建議：

```text
UI Layer
   ↓
Project / Network Store
   ↓
Network Builder
   ↓
Thermal Graph Model
   ↓
Solver
   ↓
Analysis Engine
   ↓
Visualization / Report
```

---

# 37. Separation of Concerns

Codex 開發不可將：

```text
UI click handler
```

直接寫死：

```text
PA → TIM → HSK
```

正確：

```text
UI
↓
Action
↓
Graph Store
↓
Network Builder / Solver
↓
Result
↓
UI Render
```

---

# 38. 建議 Frontend Modules

```text
src/

  app/
    AppShell
    Header
    Sidebar
    StatusBar

  project/
    ProjectInfo
    ProjectImport

  components/
    ComponentManager
    ComponentLibrary
    ThermalProfile

  builder/
    ArchitectureTemplate
    NetworkBuilder
    BoundaryCondition

  thermal/
    nodeModel
    edgeModel
    resistanceCalculator
    networkSolver
    networkValidation

  flotherm/
    importer
    mapper
    calibration

  analysis/
    bottleneckAnalyzer
    sensitivityAnalyzer
    energyBalance
    scenarioComparison

  visualization/
    ThermalGraph
    ThermalLadder
    Sankey
    TemperatureMap

  report/
    ReportPreview
    ExportCenter

  data/
    projectStore
    networkStore
    scenarioStore
    persistence
```

---

# 39. Visualization 技術方向

Network 主圖建議：

```text
Cytoscape.js
```

適合：

- Node / Edge
- Drag
- Zoom
- Selection
- Auto layout
- Hierarchical layout
- Graph interaction

Engineering chart 可使用：

```text
Plotly.js
```

適合：

- Tornado
- Bar chart
- Sankey
- Scenario comparison
- Temperature plots

---

# 40. Network Validation

Solve 前至少檢查：

```text
Orphan Node
Disconnected Heat Source
Missing Ambient / Boundary
Zero Rth
Negative Rth
Invalid Power
Duplicate Edge
Self-loop
Missing Node Reference
Invalid Scenario Override
```

必要時區分：

```text
Error
Warning
Information
```

---

# 41. Required UI State

每個 Screen 必須設計：

- Normal
- Empty
- Loading
- Dirty
- Success
- Warning
- Error
- Read-only

不能只設計有資料且成功的 happy state。

---

# 42. Unit Policy

V1 thermal unit：

```text
Temperature: °C
Power: W
Rth: °C/W
Length: mm
Area: mm² / m²
K: W/m·K
h: W/m²·K
Heat flux: W/m²
```

內部 solver 建議統一 SI 後再顯示。

避免在不同 component 中混用 mm / m 導致 Rth 錯誤。

---

# 43. Numerical Precision

UI 預設：

```text
Temperature: 0.1°C
Power: 0.1W
Rth: 0.001°C/W
ΔT: 0.1°C
Margin: 0.1°C
Energy Error: 0.01%
```

Expert Settings 可調。

---

# 44. Auditability

任何使用者修改：

- Rth
- Source
- FloTHERM mapping
- Scenario
- Component power

建議保留：

```text
updated_at
updated_by
previous_value
```

V1 可先保留 metadata hook，未必要立即做完整 history UI。

---

# 45. Report Philosophy

Report 不應只輸出 Screenshot。

工程報告需要能回答：

```text
What is the system?
What condition was solved?
What is the worst component?
What is the major bottleneck?
What evidence supports it?
What modification has the highest impact?
```

---

# 46. 產品主要 Workflow

完整使用流程：

```text
Create / Open Project
       ↓
Import Components
       ↓
Assign Thermal Architecture
       ↓
Auto Build Thermal Network
       ↓
Review / Modify Nodes & Edges
       ↓
Define Boundary Conditions
       ↓
Solve
       ↓
Thermal Network Visualization
       ↓
Bottleneck Analysis
       ↓
Import FloTHERM
       ↓
Calibrate Network
       ↓
Re-solve
       ↓
Sensitivity / Optimization
       ↓
Report
```

---

# 47. V1 Happy Path

第一個可實用版本一定要先完成以下流程：

```text
New Project
↓
Import Existing Components
↓
Select Thermal Architecture Template
↓
Generate Network
↓
Set Ambient
↓
Solve
↓
Display Thermal Network
↓
Select Worst Component
↓
Display Thermal Ladder
↓
Select Worst Edge
↓
Show Bottleneck Explanation
```

在此流程穩定之前：

> 不要優先花大量時間做報告動畫或次要視覺效果。

---

# 48. 開發階段

## Phase 0 — Foundation

- App Shell
- Routing
- Shared data model
- Network schema
- Mock data
- Persistence contract

## Phase 1 — Project & Input

- Project Info
- Component Import
- Component Manager

## Phase 2 — Network Builder

- Architecture Templates
- Node / Edge Editor
- Boundary Conditions

## Phase 3 — Solver

- Matrix Solver
- Validation
- Energy Balance
- Scenario solve

## Phase 4 — Visualization

- Thermal Network
- Node Inspector
- Edge Inspector
- Thermal Ladder

## Phase 5 — Analysis

- Bottleneck
- Sensitivity
- Scenario comparison
- Temperature distribution

## Phase 6 — FloTHERM

- Import
- Mapping
- Calibration
- Comparison

## Phase 7 — Output

- Results Overview
- Report
- Export

---

# 49. 00～12 UI 文件關係

Master UI：

```text
00_Master_UI.png
```

只負責定義：

- App visual language
- Top Header
- Sidebar
- Main canvas
- Right analysis panel
- Status bar

後續每一頁：

```text
01...12
```

都需維持同一 App Shell。

---

# 50. 每一個 Screen 的開發文件格式

後續每頁 Markdown 必須至少包含：

```text
Purpose
User Goal
Entry Point
Layout
UI Items
Inputs
Actions
Outputs
Data Source
Interaction
Calculation Logic
Validation
Empty State
Loading State
Error State
Dirty State
Acceptance Criteria
Relation to Other Screens
Codex Notes
```

---

# 51. Screen 與 UI 圖必須一對一

推薦資料夾：

```text
docs/

  00/
    00_Product_Vision_and_Architecture.md
    00_Master_UI.png

  01/
    01_Project_Info.md
    01_Project_Info.png

  02/
    02_Import_Components.md
    02_Import_Components.png

  ...

  12/
    12_Export_Center.md
    12_Export_Center.png
```

---

# 52. Codex 每次開發前應閱讀的順序

例如開發 Screen 05：

```text
1. Read 00_Product_Vision_and_Architecture.md
2. Read 05_Thermal_Path_Builder.md
3. View 05_Thermal_Path_Builder.png
4. Inspect current repository code
5. Implement only Screen 05 scope
6. Run acceptance checks
```

---

# 53. Codex 禁止事項

## 禁止 1

不得把固定熱路 hard-code 在 UI。

錯誤：

```text
if component == PA:
    PA → TIM → HSK
```

應使用：

```text
Architecture Template
```

產生 Graph。

---

## 禁止 2

不得只為一頁 UI 建立另一套 duplicate state。

所有頁面必須讀：

```text
Shared Project Store
Shared Network Store
Shared Scenario Store
```

---

## 禁止 3

不得修改參數後仍顯示舊 solver result 為有效。

---

## 禁止 4

不得用 Component Total Power 自動替代 unknown Edge Q。

---

## 禁止 5

不得以最大 Rth 直接宣稱為唯一 Bottleneck。

---

## 禁止 6

不得讓 FloTHERM import 覆蓋 Analytical 原始值且無法追溯。

---

## 禁止 7

不得把 Graph 限制成 Tree。

---

# 54. Codex Engineering Requirements

每一個 PR / implementation slice 應盡量：

- Small scope
- One screen / one engine feature
- Reuse shared components
- Preserve database compatibility
- Add validation
- Add mock/test data
- Avoid silent fallback
- Avoid magic constants without source

---

# 55. Physics Correctness 優先級

如果發生衝突：

```text
Visual Simplicity
vs
Physical Correctness
```

優先：

# **Physical Correctness**

但可以透過 Basic View 隱藏複雜資訊。

不能為了讓畫面簡單，而把真實 parallel path 強制改成錯誤 series path。

---

# 56. Usability 優先級

對非 Thermal Engineer：

不要要求他理解：

```text
Conductance matrix
```

才能操作。

理想 UX：

```text
Select Hardware Architecture
↓
Tool Generates Thermal Network
↓
User Reviews
```

不是：

```text
User Manually Draws Every Node
```

Expert Mode 才提供完全自訂 Graph。

---

# 57. Explainability 優先級

任何「Bottleneck」都需要解釋：

```text
Why?
```

例如：

```text
Main Base Spreading is ranked #1 because:

ΔT = 18.4°C
Q = 132W
Rth = 0.139°C/W

20% Rth reduction lowers worst PA Tj by 5.5°C.
```

不能只顯示：

```text
Bottleneck Score = 92
```

---

# 58. 建議產品 KPI

未來驗證工具品質可使用：

## Modeling

- Network creation time
- Number of supported architecture templates
- Number of unresolved paths

## Solver

- Energy balance error
- Solver stability
- Solve time

## Correlation

- Analytical vs FloTHERM error
- FloTHERM vs Measurement error

## UX

- Time to identify worst component
- Time to identify recommended modification

---

# 59. V1 Non-goals

V1 不需要：

- Full FloTHERM API automation
- Full transient network
- Full radiation view-factor solver
- Full PCB compact thermal model generator
- AI auto-design optimization
- Automated CAD geometry extraction
- Complete heat pipe two-phase physics

先建立穩定的：

```text
Steady-state General Thermal Network
```

---

# 60. Future Roadmap

## V1

- General graph
- Solver
- Architecture templates
- Visualization
- Bottleneck

## V1.5

- FloTHERM CSV / Excel import
- Effective Rth calibration

## V2

- Scenario comparison
- Advanced sensitivity
- Zone model
- Sankey
- Report

## V3

- FloTHERM post-processing automation
- Historical correlation DB
- Automated mapping
- Predictive thermal model

---

# 61. Product Success Definition

工具成功的標準不是：

> 可以畫出一張漂亮的 Thermal Network。

而是：

> **一名沒有 Thermal Engineering 背景的 RF / ME / PM，在打開結果後能快速理解熱從哪裡產生、經過哪裡、瓶頸在哪裡，以及改哪裡最有效。**

同時 Thermal Engineer 能夠：

> **追溯每一個 Rth、Q、ΔT 的來源與計算，確認 network 在物理與能量守恆上合理。**

兩者必須同時成立。

---

# 62. Master Engineering Principles

以下原則視為本專案的最高層規範。

## Rule 1

> **Every Temperature belongs to a Node.**

---

## Rule 2

> **Every Thermal Resistance belongs to an Edge.**

---

## Rule 3

> **Every Edge must have a traceable data source.**

---

## Rule 4

> **Never derive segment Rth from ΔT unless segment heat flow Q is known.**

---

## Rule 5

> **Thermal Graph must support series, parallel, branch, merge and shared nodes.**

---

## Rule 6

> **Changing the physical model invalidates previous solver results.**

---

## Rule 7

> **Bottleneck is determined by thermal impact, not resistance magnitude alone.**

---

## Rule 8

> **Sensitivity analysis must re-solve the full network.**

---

## Rule 9

> **Analytical, CFD and Measurement data must remain traceable and comparable.**

---

## Rule 10

> **UI simplicity must never silently violate thermal physics.**

---

# 63. 給 Codex 的 Master Instruction

以下文字可直接作為每次新 Codex session 的第一段專案指令：

```text
You are developing the 5G FR1 Thermal Network Visualizer.

Before modifying code, read:
00_Product_Vision_and_Architecture.md

This document is the architecture source of truth.

The application is a real thermal-engineering tool, not a static diagram editor.

Core requirements:

1. Use a general Node + Edge thermal graph model.
2. Support series, parallel, branch, merge and shared thermal paths.
3. Keep component data, graph data, scenarios and solver results separated.
4. Thermal solver must operate on generic nodes and edges, not hard-coded PA/FPGA paths.
5. Every Rth value must preserve source and confidence.
6. Never calculate a segment Rth from ΔT unless heat flow through that segment is known.
7. FloTHERM values must calibrate/compare with analytical data, not silently overwrite provenance.
8. Any topology, power, Rth or boundary change invalidates previous solve results.
9. Bottleneck analysis must consider ΔT and full-network sensitivity, not maximum Rth only.
10. Sensitivity changes must re-solve the entire graph.
11. Preserve compatibility with the existing 5G RRU component/project database.
12. Do not implement all screens at once. Implement the requested Screen according to its dedicated Markdown specification and UI mockup.

For each screen:
- reuse shared stores and components;
- implement normal, loading, empty, dirty, warning and error states;
- satisfy the screen acceptance criteria;
- avoid introducing screen-specific duplicate models.

Physics correctness has priority over UI convenience.
```

---

# 64. 下一步

本文件完成後，正式進入：

# `01_Project_Info`

交付內容：

```text
01_Project_Info.md
01_Project_Info.png
```

01 的設計必須繼續沿用：

- 00 Master App Shell
- Shared Project Store
- Scenario concept
- Data provenance
- Dirty / validation state

後續依序完成 02～12。

---

# 65. 最終一句話

**5G FR1 Thermal Network Visualizer 的目的，不只是告訴使用者「哪裡熱」，而是用一個物理可追溯、可求解、可校正的 Thermal Graph，回答「熱為什麼卡在這裡，以及下一個最值得做的設計修改是什麼」。**
