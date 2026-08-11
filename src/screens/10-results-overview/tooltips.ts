/**
 * zh-TW engineering tooltips — 10 §32 and `10_Results_Overview_Tooltips_zh-TW.json`.
 *
 * The twelve strings the specification supplies are reproduced VERBATIM. They
 * explain what a field means in engineering terms rather than translating its
 * label, which is what 10 §1 and AC-10-35 ask for; a plain translation would
 * tell a reader who already sees the English nothing they did not know.
 *
 * A native `title` attribute alone is not accepted for these (AC-10-36), so
 * every one of them is delivered through `EngineeringInfo` or
 * `BilingualTooltip`.
 */

export const T10 = {
  overallStatus:
    '整體熱狀態：依目前求解是否有效、元件 thermal margin、資料完整度與 solver quality 綜合判定 PASS / WARNING / FAIL / STALE / INCOMPLETE。',
  worstThermalMargin:
    '所有 monitored nodes 中最小的 Limit - Temperature；數值越小代表越接近 thermal limit。',
  topBottleneck:
    '來自 Screen 08 的最高 Bottleneck Score candidate；本頁不重新進行 sensitivity 分析。',
  energyBalance:
    'Generated Heat 與 Rejected Heat 的能量守恆誤差比例；沿用 Screen 07 的品質判斷。',
  criticalComponents:
    '依 Thermal Margin 由低到高排列的 monitored components，用來快速找最接近限制的元件。',
  nearLimit: 'V1 使用與 Screen 09 相同規則：Margin <= 10°C 時標示接近 thermal limit。',
  dataCompleteness:
    '顯示 limits、Rth sources、confidence 與 external validation 的完整程度，幫助判斷結果可信度。',
  resultMode:
    '目前 Results Overview 所代表的資料模式，例如 Analytical；尚未存在的 FloTHERM/Hybrid 模式不可假裝為 current。',
  reportReadiness:
    '報告準備狀態：檢查目前求解結果是否有效，以及 08/09 等支援分析是否完整，決定是否能進入 11 Report Preview。',
  lowConfidence:
    '表示關鍵結果依賴低可信度或缺少 reference 的輸入，結果可用但需要工程覆核。',
  analyticalOnly:
    '目前結果完全來自 analytical thermal network model，尚未由 FloTHERM 或 measurement 校正。',
  prepareReportSnapshot:
    '把目前 07/08/09 的 current summary 凍結成 11 Report Preview 可使用的 snapshot；不產生 PDF。',

  // --- supporting explanations for the other compact fields on this screen ---
  maxTemperature: '本情境所有已求解節點中的最高溫度，以及該溫度所在的元件。',
  totalPower: '本次求解注入系統的總熱量（元件功耗 × Power Scale，加上太陽輻射等外部熱負載）。',
  sensitivityImprovement:
    'Screen 08 在把該段 Rth 降低指定比例後，實際重新求解量到的目標溫度改善量；不是估算值。',
  affectedComponents:
    'Screen 08 量到改善量達門檻的元件數；數字越大代表該段是越多元件共用的路徑。',
  confidence: '該候選所依賴之 Rth 輸入的可信度；低可信度代表結論可用但需先確認熱阻來源。',
  temperatureRangeBar:
    '以 Min – Average – P95 – Max 呈現本情境的溫度分佈範圍；詳細直方圖與篩選請回到 09。',
  nodesAboveWarning: '溫度高於警示門檻的節點數；門檻沿用 Screen 09 的預設值。',
  energyResidual: 'Generated Heat 減去 Rejected Heat 的絕對差值，理想值為 0 W。',
  rthSourceSummary:
    '各段熱阻實際採用的資料來源分佈；Screen 03 尚未上線時 FloTHERM 一律為 0 / Deferred。',
  externalCfdValidation:
    '是否已由外部 CFD（FloTHERM）結果驗證；Screen 03 延後上線時顯示 Deferred，這不等於失敗。',
  networkSnapshot:
    '唯讀的熱網路縮圖，並標示目前的關鍵路徑；本頁不能編輯拓樸，編輯請回到 05 / 07。',
  criticalPath:
    '預設標示 Screen 08 的最高分瓶頸所在路徑；若 08 不可用，改以最熱元件到邊界的散熱路徑。',
  engineeringActionSummary:
    '依 07/08/09 既有結果以固定規則產生的工程結論；不使用語言模型，也不會憑空生出 08 沒算過的改善量。',
  recommendedNextAction:
    '依嚴重度排序後的單一主要建議：先修正讓數字失去意義的問題（過期或失敗的求解），再處理數字本身指出的問題。',
  overallReadiness:
    '逐項檢查報告可引用的支援分析狀態：READY / WARNING / MISSING / STALE。',
  scenarioSummary:
    '目前 Active Scenario 的邊界設定摘要，唯讀；要修改請回到 06 Boundary Conditions。',
  monitoredNodes: '帶有 thermal limit、因此可以判定通過與否的節點；沒有 limit 的節點不列入判定。',
} as const;

/** 10 §32 — the exact label list that must carry a zh-TW engineering tooltip. */
export const REQUIRED_TOOLTIP_LABELS: Array<{ label: string; zh: string }> = [
  { label: 'Overall Status', zh: T10.overallStatus },
  { label: 'Worst Thermal Margin', zh: T10.worstThermalMargin },
  { label: 'Top Bottleneck', zh: T10.topBottleneck },
  { label: 'Energy Balance', zh: T10.energyBalance },
  { label: 'Critical Components', zh: T10.criticalComponents },
  { label: 'Near Limit', zh: T10.nearLimit },
  { label: 'Data Completeness', zh: T10.dataCompleteness },
  { label: 'Result Mode', zh: T10.resultMode },
  { label: 'Report Readiness', zh: T10.reportReadiness },
  { label: 'Low Confidence', zh: T10.lowConfidence },
  { label: 'Analytical-only', zh: T10.analyticalOnly },
  { label: 'Prepare Report Snapshot', zh: T10.prepareReportSnapshot },
];
