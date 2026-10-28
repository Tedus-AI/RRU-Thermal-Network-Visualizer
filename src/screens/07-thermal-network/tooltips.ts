/**
 * Traditional Chinese tooltips for Screen 07 求解與結果.
 *
 * They began as the specification's own text
 * (`07/07_Thermal_Network_Tooltips_zh-TW.json`); 07 §59 rewrote the ones that
 * mixed English terms into the sentence (Scenario, active heat source,
 * Warning) so the screen reads in one language.
 */

export const T07 = {
  kpi: {
    solverStatus:
      '求解器目前的狀態：就緒、已失效、求解中、已求解、有警告或求解失敗。',
    generatedHeat: '目前情境所有發熱元件乘上功率倍率後的總發熱，加上日照熱負載。',
    rejectedHeat:
      '經固定溫度或外部邊界排出的淨熱量；不重複計算內部連線的熱流。',
    energyResidual: '總發熱與排出熱量的差值比例，用來檢查數值與能量守恆。',
    maxAmbient:
      '最差餘裕的元件剛好到達上限時的環溫，等於目前環溫加上最小餘裕。溫升隨環溫變化極小（STARKCORE 實測每升 1 °C 環溫僅增加 0.023 °C 溫升），故以相加表示；若有節點被釘為固定溫度，此假設不成立。',
    solvedNodes: '本次求解中溫度已決定的節點數，包含固定溫度邊界節點。',
    solvedEdges: '本次求解中回算出 Q 與 ΔT 的連線數。',
  },

  field: {
    heatFlow:
      '由求解出的節點溫度與連線熱阻回算的熱流 Q；負值表示實際流向與圖上箭頭相反。',
    deltaT: '連線兩端的溫差；不等於瓶頸分數。',
    activeRthSource:
      '求解實際採用的熱阻來源。解析、FloTHERM、量測、手動四種來源各自保存。',
    staleResults: '拓樸、熱阻、功耗或邊界改變後，舊結果失效，必須重新求解。',
    energyBalance: '建議 < 0.5 % 良好、0.5–2 % 偏大、> 2 % 過大。',
    rule4:
      '不可用某段溫差除以元件總功耗來反推該段熱阻，除非該段實際熱流 Q 已知。',
    margin: '餘裕＝限溫 − 限溫位置（Tj／Tc／Ts）的溫度。元件列表依餘裕排序，最緊的在最上面。',
    solverEngine:
      '本工具使用直接法求解：組出導熱矩陣後以部分主元高斯消去法一次解出，沒有迭代次數或收斂歷程。',
    energyWarnPct: '能量平衡誤差超過此百分比即標示「偏大」。',
    energyErrorPct: '能量平衡誤差超過此百分比即視為結果不可信。',
    powerScale: '情境的功率倍率，只乘在元件功耗上，不影響日照熱負載。',
    resultMode: '切換圖面著色依據。求解前只能看節點類型、熱阻與熱阻來源。',
    actualDirection: '實際熱流方向。Q 為負代表與圖上箭頭相反，這是合法結果而非錯誤。',
  },

  action: {
    preSolveCheck: '只執行求解前檢查，不會計算結果。',
    solve: '以目前情境的熱網路與邊界條件求解。',
    reSolve: '輸入已變更，重新求解以取得目前解。',
    resetResults: '只清除目前情境的求解結果，熱網路、邊界條件與量測資料都會保留。',
    saveSolution: '把目前情境的求解結果存入專案。',
    continue: '求解成功且能量平衡在容許範圍內才能前往 06 與 07。',
    backTo06: '回到 04 熱網路與邊界，修改此情境的散熱表面條件。',
  },
} as const;
