/**
 * Traditional Chinese tooltips for Screen 07.
 *
 * The KPI, heat-flow, ΔT, Rth-source, stale-result, energy-balance and Rule 4
 * entries are the specification's own text, taken verbatim from
 * `07/07_Thermal_Network_Tooltips_zh-TW.json`. The rest follow the same voice
 * for the controls the mockup adds.
 */

export const T07 = {
  kpi: {
    solverStatus:
      '顯示 Thermal Network 求解器目前狀態：READY、DIRTY、SOLVING、SOLVED、WARNING 或 FAILED。',
    generatedHeat: '目前 Scenario 中所有 active heat source 經 Power Scale 後的總發熱。',
    rejectedHeat:
      '經固定溫度或外部 Boundary sink 排出的淨熱量；不重複計算 internal edge heat flow。',
    energyResidual: 'Generated Heat 與 Rejected Heat 的差值比例，用來檢查數值與能量守恆。',
    solvedNodes: '本次求解中溫度已決定的節點數，包含固定溫度邊界節點。',
    solvedEdges: '本次求解中回算出 Q 與 ΔT 的連線數。',
  },

  field: {
    heatFlow:
      '由 solved node temperatures 與 active edge Rth 回算的 Q，允許為負值表示實際流向與 nominal direction 相反。',
    deltaT: 'Edge 兩端 solved temperature difference；不等於 Bottleneck score。',
    activeRthSource:
      'Solver 實際採用的 Rth 來源。Analytical、FloTHERM、Measurement、Manual 仍各自保存。',
    staleResults: 'Topology、Rth、Power 或 Boundary 改變後，舊 solution 失效，必須重新 Solve。',
    energyBalance: '建議 <0.5% 綠色、0.5–2% Warning、>2% Error。',
    rule4:
      '不可用某段 ΔT 除以元件總功耗來反推 segment Rth，除非該段實際 Heat Flow Q 已知。',
    margin: 'Margin = Limit − Temperature。07 只顯示單一節點的餘裕，排名屬於 08。',
    solverEngine:
      '本工具使用直接法求解：組出導熱矩陣後以部分主元高斯消去法一次解出，沒有迭代次數或收斂歷程。',
    energyWarnPct: '能量平衡誤差超過此百分比即標示 Warning。',
    energyErrorPct: '能量平衡誤差超過此百分比即視為結果不可信。',
    powerScale: '情境的功率縮放係數，僅作用於元件功耗，不影響太陽輻射熱負載。',
    resultMode: '切換圖面著色依據。求解前只能檢視 Node Type、Rth 與 Rth Source。',
    actualDirection: '實際熱流方向。Q 為負代表與圖上箭頭相反，這是合法結果而非錯誤。',
  },

  action: {
    preSolveCheck: '只執行求解前檢查，不會計算結果。',
    solve: '以目前 Scenario 的拓樸與邊界條件求解熱網路。',
    reSolve: '輸入已變更，重新求解以取得目前解。',
    resetResults: '只清除目前 Scenario 的解析解，拓樸、邊界條件與量測資料都會保留。',
    saveSolution: '將目前 Scenario 的解存入專案。',
    continue: '解成功且能量平衡在容許範圍內才能前往 08。',
    backTo06: '回到 06 修改此情境的邊界條件。',
  },
} as const;
