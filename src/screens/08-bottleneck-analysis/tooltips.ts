/**
 * Traditional Chinese tooltips for Screen 08.
 *
 * The seven entries from `08_Bottleneck_Analysis_Tooltips_zh-TW.json` are used
 * verbatim; the rest follow the same voice for the controls the mockup adds.
 */

export const T08 = {
  score:
    '由 Edge ΔT、full-network sensitivity、thermal margin impact 組合，不是單純依 Rth 排序。',
  sensitivity: '降低 candidate edge Rth 後重新求解完整 General Thermal Graph。',
  reduction: 'V1 預設 20%，只做假設分析，不直接修改正式 network。',
  affected: 're-solve 後溫度改善達 threshold 的元件數。',
  marginImpact: '改善 candidate edge 後 Worst Thermal Margin 的改善量。',
  rth: '工程 context；不是排名唯一或主要依據。',
  proposal: '保存改善假設與 projected benefit，不直接修改 network。',

  kpi: {
    topBottleneck: '目前排名第一的候選連線，依 Composite Score 決定，而非最大熱阻。',
    topScore: '最高的 Composite Score（0–100）。',
    worstMargin: 'Baseline 解中最小的 Limit − Temperature。',
    bestImprovement: '所有候選中，目標指標能獲得的最大改善量。',
    analyzedEdges: '本次分析實際完成完整重新求解的候選連線數。',
    analysisStatus:
      '分析狀態：NOT_READY、READY、RUNNING、COMPLETE、WARNING、FAILED 或 DIRTY。',
  },

  field: {
    scope: '限定要分析哪些連線。範圍越小，分析越快。',
    targetMetric: '用來衡量改善幅度的指標，Composite Score 中的 sensitivity 項以此計算。',
    deltaT: 'Baseline 解中此連線兩端的溫差。',
    heatFlow: 'Baseline 解中通過此連線的熱流，負值代表與圖示方向相反。',
    classification: '≥80 Critical、60–79 High、35–59 Medium、<35 Low。',
    confidence: '綜合熱阻來源信心度、求解品質與情境有效性。低信心度仍可排名，但需注意。',
    source: 'Solver 實際採用的 Rth 來源。Analytical、FloTHERM、Measurement、Manual 各自保存。',
    fullResolve: '每個候選都會複製 baseline 後重新求解整張網路，不重用 baseline 的 Q。',
    energyBalance: '敏感度求解的能量平衡誤差，用來判斷該次結果是否可信。',
  },

  action: {
    run: '對每個候選連線降低熱阻並重新求解整張網路。',
    rerun: '設定已變更，重新執行分析以取得目前結果。',
    reset: '只清除目前情境的分析結果，07 的解、拓樸與邊界條件都會保留。',
    cancel: '中止分析。已完成的 baseline 與先前的分析不受影響。',
    save: '儲存目前情境的分析結果。',
    back: '回到 07 熱網路求解。',
    continue: '前往 09 溫度分佈。',
    exportTable: '將排名表輸出為 CSV。',
  },
} as const;
