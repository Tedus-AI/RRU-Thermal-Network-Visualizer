/**
 * zh-TW engineering tooltips — 11 §48 and `11_Report_Preview_Tooltips_zh-TW.json`.
 *
 * The twelve strings the specification supplies are reproduced VERBATIM. They
 * explain what a control DOES in engineering terms rather than translating its
 * label (11 §1, AC-11-39), and every one is delivered through `EngineeringInfo`
 * because a native `title` alone is not accepted (AC-11-40).
 */

export const T11 = {
  snapshotStatus:
    '報告快照狀態：確認本報告引用的 Screen 10 結果是否仍與目前 Scenario、Solver、08/09 分析及 thermal limits 一致。',
  reportReadiness:
    '報告準備狀態：判斷目前報告內容是否可預覽、是否可準備匯出，以及是否仍存在資料或章節警告。',
  sectionOrder: '報告章節顯示順序；只影響報告版面，不會修改 thermal analysis data。',
  pageBreakBefore: '在此章節前強制換頁，用於控制正式報告的段落版面。',
  keepTableTogether:
    '盡可能避免表格被分割到兩頁，但不保證所有長表都能完全保持在單頁。',
  snapshotSource: '此報告章節所引用的 Screen 10 snapshot 與來源分析版本。',
  sourceScreen: '此章節數據最初來自哪個分析頁，例如 Screen 07、08、09 或 10。',
  languageMode: '設定報告內容使用英文或中英雙語；不影響應用程式 UI 的語言規則。',
  prepareForExport:
    '建立給 Screen 12 使用的 report export payload；本頁不會真正生成 PDF 或其他檔案。',
  exportPayload:
    '包含報告配置、snapshot ID、section order、page setting 等匯出必要 metadata，不包含實際檔案 bytes。',
  analyticalOnly:
    '目前結果完全來自 analytical thermal network model，尚未由 FloTHERM 或 measurement 校正。',
  externalCfdValidation:
    '外部 CFD 驗證狀態；03 尚未完成時可顯示 Deferred，但不應自動判定報告失效。',

  // --- supporting explanations for the other compact fields on this screen ---
  overallStatus:
    '來自 Screen 10 快照的整體熱狀態；本頁只引用，不重新判定（FAIL 也不會阻擋報告產出）。',
  pageCount: '依目前章節與版面設定推估的頁數；實際頁數以 12 Export Center 的輸出為準。',
  pageSize: '報告紙張尺寸與方向；只影響報告版面，不影響任何熱分析數值。',
  reportTemplate:
    '報告版型：決定預設章節組合與順序。V1 只提供 Thermal Engineering Summary。',
  requiredSection: '必要章節不可排除，因為報告缺少它就無法完整說明結果來源與品質。',
  compactSpacing: '以較緊湊的行距排版此章節，內容不變、只影響佔用頁面高度。',
  reportOnlyText:
    '報告專用文字：只存在報告設定中，不會修改任何熱分析結果或元件資料。',
  saveAsTemplate:
    '只保存版面設定（章節納入、順序、頁面與頁首頁尾），不會保存任何專案的溫度、元件或分析數值。',
  zoom: '預覽縮放層級；Fit Width 讓頁寬貼齊工作區，Fit Page 則完整顯示整頁。',
  criticalRowCount: '報告中列出的關鍵元件數量；排序與數值皆沿用 Screen 10，不重新計算。',
  bottleneckTopN: 'Bottleneck 章節列出的候選數；資料來自 Screen 08，不重新排名。',
  includeHistogram:
    '嵌入 Screen 09 既有的直方圖快照；本頁不會重新分箱，也不會重新計算百分位。',
} as const;

/** 11 §48 — the exact label list that must carry a zh-TW engineering tooltip. */
export const REQUIRED_TOOLTIP_LABELS: Array<{ label: string; zh: string }> = [
  { label: 'Snapshot Status', zh: T11.snapshotStatus },
  { label: 'Report Readiness', zh: T11.reportReadiness },
  { label: 'Section Order', zh: T11.sectionOrder },
  { label: 'Page Break Before', zh: T11.pageBreakBefore },
  { label: 'Keep Table Together', zh: T11.keepTableTogether },
  { label: 'Snapshot Source', zh: T11.snapshotSource },
  { label: 'Source Screen', zh: T11.sourceScreen },
  { label: 'Language Mode', zh: T11.languageMode },
  { label: 'Prepare for Export', zh: T11.prepareForExport },
  { label: 'Export Payload', zh: T11.exportPayload },
  { label: 'Analytical-only', zh: T11.analyticalOnly },
  { label: 'External CFD Validation', zh: T11.externalCfdValidation },
];
