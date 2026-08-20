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
  'Source L':
    '熱離開元件的那個面的長度，單位 mm。名稱依散熱路徑而定：銅塊接合面、IC 的 E-PAD、或 Case 上表面。',
  'Source W': '熱離開元件的那個面的寬度，單位 mm。',
  'Spread L': '擴散後底面的長度，單位 mm。留空則依散熱路徑自動推導。',
  'Spread W': '擴散後底面的寬度，單位 mm。留空則依散熱路徑自動推導。',
  'TIM BLT':
    'TIM 壓合後厚度 (Bond Line Thickness)。留空則沿用該材料在專案 TIM 清單中的預設厚度。',
  TIM: '此元件使用哪一種熱介面材料。材料本身在 Screen 01 的 TIM 清單中定義，這裡只是選用。',
  Thickness: 'PCB、Copper Coin 或相對應導熱結構厚度，單位 mm。',
  'Heat Path':
    '熱離開元件的主要方向，決定整條熱阻鏈：Coin 銅塊焊接（往下）、Board 板級導熱孔（往下）、TopSurface 元件表面（往上）、DirectMetal 直接鎖附金屬。未填則依類別推定。',
  Limit:
    '元件允許最高溫度。此處不記錄它屬於 Tj 或 Tc，匯入後由 Component Manager 依類別推定並請工程師確認。',
  Rjc: 'Junction-to-Case thermal resistance，單位 °C/W。',
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
  'Source L': '熱源面長',
  'Source W': '熱源面寬',
  'Spread L': '擴散面長',
  'Spread W': '擴散面寬',
  'TIM BLT': 'TIM 厚度',
  Thickness: '厚度',
  'Heat Path': '散熱路徑',
  Limit: '限制溫度',
  Rjc: '熱阻',
  TIM: '導熱介質',
  Source: '來源',
  Status: '匯入狀態',
  'Duplicate Action': '重複處理',
};
