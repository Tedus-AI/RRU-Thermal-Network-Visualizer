/**
 * Traditional Chinese copy for Screen 02.
 * Source: 02/02_Import_Components_Tooltips_zh-TW.json.
 */

export const IMPORT_TOOLTIPS_ZH: Record<string, string> = {
  'Import Source': '選擇元件資料來源，可從既有專案、CSV、Excel 或貼上表格匯入。',
  'Component Preview': '預覽即將匯入目前專案的元件資料；此階段尚未寫入正式資料庫。',
  Category: '元件分類，例如 RF、Digital、Power、Filter 或 Other。',
  Component: '元件名稱、型號或工程代號。',
  Qty: '元件數量，必須為大於 0 的整數。',
  Power: '單顆元件功耗，單位 W。',
  'Total Power': 'Qty × Power 的元件總功耗摘要。此值不是 Thermal Edge 的 Heat Flow Q。',
  Height: '元件安裝高度或既有 Volume Tool 中的 Height(mm) 定義。',
  'Pad L': '主要熱接觸面或 E-PAD 的長度，單位 mm。',
  'Pad W': '主要熱接觸面或 E-PAD 的寬度，單位 mm。',
  Thickness: 'PCB、Copper Coin 或相對應導熱結構厚度，單位 mm。',
  'Board Type': '板級主要導熱方式，例如 Thermal Via、Copper Coin 或 None。',
  Limit: '元件允許最高溫度；Tj/Tc 類型於 Component Manager 進一步確認。',
  Rjc: 'Junction-to-Case thermal resistance，單位 °C/W。',
  TIM: 'Thermal Interface Material / 熱介面材料。',
  Source: '此筆資料的原始專案或檔案來源，用於資料追溯。',
  'Column Mapping': '將外部檔案欄位對應到工具的標準 Component Schema。',
  'Duplicate Policy': '來源與目前專案存在同名元件時的處理方式。',
  'Apply Import': '通過驗證後，將勾選的 staging rows 正式寫入目前專案。',
  Validation: '檢查必要欄位、資料格式與可能影響後續熱計算的缺漏。',
  'Project Impact': '預覽這次匯入對目前專案元件數量與總功耗的影響。',
};

export function tip(key: string): string | undefined {
  return IMPORT_TOOLTIPS_ZH[key];
}

/** Short Chinese names for inline bilingual labels. */
export const ZH_NAMES: Record<string, string> = {
  'Import Source': '匯入來源',
  'Column Mapping': '欄位對應',
  'Staging Preview': '預覽資料',
  'Duplicate Handling': '重複項處理',
  'Import Summary': '匯入摘要',
  Validation: '驗證結果',
  'Project Impact': '專案影響預覽',
  'Recommended Next Step': '建議下一步',
  Component: '元件名稱',
  Category: '類別',
  Qty: '數量',
  Power: '功耗',
  'Total Power': '總功耗',
  Height: '高度',
  'Pad L': 'Pad 長',
  'Pad W': 'Pad 寬',
  Thickness: '厚度',
  'Board Type': '板材類型',
  Limit: '限制溫度',
  Rjc: '熱阻',
  TIM: '導熱介質',
  Source: '來源',
  Status: '匯入狀態',
  'Duplicate Action': '重複處理',
};
