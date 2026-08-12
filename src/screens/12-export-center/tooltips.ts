/**
 * zh-TW engineering tooltips — 12 §56 and `12_Export_Center_Tooltips_zh-TW.json`.
 *
 * The thirteen strings the specification supplies are reproduced VERBATIM. Each
 * explains what a control DOES in engineering terms rather than translating its
 * label (12 §1, AC-12-43), and every one is delivered through `EngineeringInfo`
 * because a native `title` alone is not accepted (AC-12-44).
 */

export const T12 = {
  exportStatus:
    '目前 Export Center 的整體匯出狀態，綜合 selected artifacts 的 readiness、warning、blocked 與執行結果。',
  artifact:
    '可匯出的工程產物，例如 PDF Report、Temperature CSV、Thermal Network JSON 或 PNG snapshot。',
  packagePreset: '預先定義的 artifact 選擇組合；只影響匯出內容，不會修改 thermal analysis data。',
  reportReadiness:
    '沿用 Screen 11 的報告準備狀態；WARNING 可確認後匯出，BLOCKED 則不可產生 PDF。',
  traceabilityManifest:
    '追溯資訊清單：記錄本次匯出所使用的 Project、Scenario、Solver、Snapshot、Artifact、版本與警告，便於後續工程驗證與版本追蹤。',
  overwriteHandling:
    '當檔名重複時的處理方式；Browser Download 模式通常使用 Auto Rename 以避免覆寫。',
  decimalPrecision: 'CSV 匯出時的數值小數位數；不會改變工具內部保存的原始精度。',
  utf8Bom: '在 CSV 開頭加入 BOM，提升 Excel 開啟繁體中文欄位時的相容性。',
  localExport: '匯出檔案在本機瀏覽器產生，不會自動上傳到外部服務。',
  exportSession:
    '一次匯出工作所凍結的 Project / Scenario / Solver / Report 版本集合，確保所有 artifacts 使用一致來源。',
  packageWarning: '選定 artifacts 中存在可接受但需要工程覆核的 warning；匯出前必須確認。',
  checksum: '可選的 SHA-256 檔案摘要，用於驗證 artifact 在傳遞後是否被改動。',
  partialExport: '部分 artifact 成功、部分失敗或不可用；成功檔案仍可交付，但 manifest 需記錄異常。',

  // --- supporting explanations for the other compact fields on this screen ---
  destination:
    '匯出目的地；V1 預設為瀏覽器下載，僅在瀏覽器支援 File System Access API 時才提供選擇資料夾。',
  filenamePreview: '依目前命名設定推算的檔名；覆寫檔名只影響輸出檔案，不會修改專案或情境主檔。',
  jsonFormat: 'JSON 縮排格式；Pretty 便於人工檢視，Compact 檔案較小，內容完全相同。',
  pngScale: 'PNG 匯出解析度倍率；2x 適合貼入報告或簡報，1x 檔案較小。',
  zipCompression: '是否壓縮 ZIP 內容；關閉時封裝較快但檔案較大，內容完全相同。',
  exportQueue: '本次匯出的工作清單與各項狀態；單一 artifact 失敗不會中斷其他項目。',
  sourceReadiness:
    '各資料來源目前是否可用於匯出；BLOCKED 表示來源已過期或無效，需回到對應畫面重新產生。',
} as const;

/** 12 §56 — the exact label list that must carry a zh-TW engineering tooltip. */
export const REQUIRED_TOOLTIP_LABELS: Array<{ label: string; zh: string }> = [
  { label: 'Export Status', zh: T12.exportStatus },
  { label: 'Artifact', zh: T12.artifact },
  { label: 'Package Preset', zh: T12.packagePreset },
  { label: 'Report Readiness', zh: T12.reportReadiness },
  { label: 'Traceability Manifest', zh: T12.traceabilityManifest },
  { label: 'Overwrite Handling', zh: T12.overwriteHandling },
  { label: 'Decimal Precision', zh: T12.decimalPrecision },
  { label: 'UTF-8 BOM', zh: T12.utf8Bom },
  { label: 'Local Export', zh: T12.localExport },
  { label: 'Export Session', zh: T12.exportSession },
  { label: 'Package Warning', zh: T12.packageWarning },
  { label: 'Checksum', zh: T12.checksum },
  { label: 'Partial Export', zh: T12.partialExport },
];
