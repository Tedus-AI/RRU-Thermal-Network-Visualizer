/**
 * Traditional Chinese engineering explanations for Screen 09.
 *
 * The fourteen entries from `09_Temperature_Distribution_Tooltips_zh-TW.json`
 * are used verbatim — they are the specification's own wording. The rest follow
 * 09 §3.2's rule: explain what the number MEANS to an engineer, not merely
 * translate its English name.
 *
 * 09 §56 lists the compact English-only labels that MUST carry one of these.
 * `REQUIRED_TOOLTIP_LABELS` below is that list, kept next to the text so the
 * audit is checkable rather than a promise.
 */

export const T09 = {
  p95: '第 95 百分位溫度：95% 的納入節點溫度低於此值，用來觀察高溫尾端分佈。',
  scope: '決定哪些 solved nodes 納入本頁的統計、圖表與排名。',
  groupBy: '決定比較與彙整的分類方式，例如 Component、Category、Node Type 或 Base Zone。',
  histogramBin: '直方圖的溫度區間寬度；固定 bin 可確保不同次檢視結果一致。',
  warningThreshold: '僅用於視覺標示高溫節點，不等同元件正式 thermal limit。',
  p90: '第 90 百分位溫度。',
  standardDeviation: '目前篩選資料的溫度標準差，用來觀察溫度離散程度。',
  temperatureRank: '依目前資料集溫度由高到低排序；不是 Screen 08 的 Bottleneck Rank。',
  percentilePosition: '所選節點在目前資料集中的溫度百分位位置。',
  lockTemperatureScale:
    '跨 Scenario 比較時鎖定相同 Min/Max 色階，避免自動縮放造成視覺誤判。',
  partialMatch:
    '兩個 Scenario 的 network topology 不完全相同，只比較可用 stable node ID 對應的節點。',
  resultSource: '選擇可用的溫度結果來源。03 尚未完成時不可顯示假的 FloTHERM dataset。',
  nearLimit: 'V1 顯示規則：thermal margin 小於等於 10°C 時標示為接近限制。',
  scenarioCompare:
    '以相同 node ID 比較兩個已求解 Scenario 的溫度與 margin；這不是 08 的敏感度分析。',

  marginRange: '依 thermal margin 範圍篩選；沒有 limit 的節點沒有 margin，不會被視為 0。',
  maxTemperature: '目前篩選資料集中最高的 solved node 溫度。',
  averageTemperature: '目前篩選資料集的算術平均溫度，會隨 Scope 與 Filter 改變。',
  minThermalMargin: '目前篩選資料集中最小的 Limit − Temperature；負值代表已超出限制。',
  nodesAboveWarning: '溫度高於 Warning Threshold 的節點數；此為視覺標示，非產品判定。',
  median: '第 50 百分位溫度；相較平均值較不受極端值影響。',
  distanceFromAverage: '所選節點溫度與目前資料集平均值的差；正值代表高於平均。',
  limitType: '元件限制值的種類：Tj 接面、Tc 外殼、Tb 底板、Ts 原廠指定表面或自訂。',
  margin: 'Thermal Margin = Limit − Temperature。正值為餘裕，負值代表超出限制。',
  status: '依 margin 分類的顯示狀態：Within Limit、Near Limit、Over Limit 或 No Limit。',
  networkTemperature: '沿用 07 的已求解拓樸，節點依溫度著色；連線不依 Bottleneck Score 著色。',
  componentBars: '以水平長條顯示各節點溫度，並在其旁標示該節點自己的 limit 與 margin。',
  marginBars: '顯示各節點的 thermal margin 分佈；正值為餘裕，負值代表超出限制。',
  histogram: '依溫度區間統計節點數量，只包含目前 Scope 與 Filter 納入的節點。',
  refreshFromSolution: '重新從 07 的解讀取資料。本畫面不會執行求解，也不會修改任何輸入。',
  exportCsv: '將目前篩選後的溫度資料輸出為 CSV。正式報告仍由 11 產生。',
  exportChartPng: '將目前圖表輸出為 PNG 圖檔。',
  stale: '07 的解在求解後被修改，本頁的分析結果已失效，請回 07 重新求解。',
} as const;

/**
 * 09 §56 — the compact labels that must carry an engineering explanation.
 * Each maps to the key in `T09` that supplies it, so the audit can be run
 * against the code instead of by eye.
 */
export const REQUIRED_TOOLTIP_LABELS: Record<string, keyof typeof T09> = {
  'P95 Temperature': 'p95',
  Scope: 'scope',
  'Group By': 'groupBy',
  'Margin Range': 'marginRange',
  'Result Source': 'resultSource',
  'Histogram Bin': 'histogramBin',
  'Warning Threshold': 'warningThreshold',
  'Lock Temperature Scale': 'lockTemperatureScale',
  'Percentile Position': 'percentilePosition',
  'Near Limit': 'nearLimit',
  'Temperature Rank': 'temperatureRank',
  'Scenario Compare': 'scenarioCompare',
  'Partial Match': 'partialMatch',
};
