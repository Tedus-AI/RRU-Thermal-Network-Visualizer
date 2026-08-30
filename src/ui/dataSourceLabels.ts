/**
 * Traditional-Chinese labels for data-source selectors.
 *
 * Stored enum values stay unchanged for JSON compatibility. This module only
 * controls what a person sees, including import provenance values whose casing
 * differs from thermal data sources.
 */
const DATA_SOURCE_LABEL_ZH: Readonly<Record<string, string>> = {
  Manual: '手動輸入',
  manual: '手動輸入',
  Analytical: '解析計算',
  analytical: '解析計算',
  Datasheet: '規格書',
  datasheet: '規格書',
  Assumed: '工程假設',
  assumed: '工程假設',
  Measurement: '實測值',
  measurement: '實測值',
  Vendor: '原廠資料',
  vendor: '原廠資料',
  Imported: '匯入資料',
  imported: '匯入資料',
  Library: '元件庫',
  library: '元件庫',
  FloTHERM: 'FloTHERM',
  flotherm: 'FloTHERM',
  ExistingProject: '既有專案',
  CSV: 'CSV 檔案',
  Excel: 'Excel 檔案',
  Paste: '貼上資料',
};

export function dataSourceLabelZh(value: string): string {
  return DATA_SOURCE_LABEL_ZH[value] ?? value;
}

export function dataSourceItemsZh<T extends string>(
  values: readonly T[],
): ReadonlyArray<{ value: T; label: string }> {
  return values.map((value) => ({ value, label: dataSourceLabelZh(value) }));
}
