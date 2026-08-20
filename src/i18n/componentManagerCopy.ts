/**
 * Traditional Chinese copy for Screen 04.
 * Source: 04/04_Component_Manager_Tooltips_zh-TW.json.
 */

export const MANAGER_TOOLTIPS_ZH: Record<string, string> = {
  Rjc: '接面到外殼熱阻；若封裝模型適用，後續可成為 package thermal edge。',
  'Limit Type': '指定 thermal limit 是 Tj、Tc、Ts 或自訂參考溫度。',
  'Thermal Profile': '供 Screen 05 建立熱網路使用的準備資料；本頁不建立 Node/Edge。',
  'Preferred Base Zone': 'Network Builder 的區域提示，不等於已建立 Base thermal node。',
  'Qty Modeling': '多顆同型元件在 Screen 05 中偏好的 Aggregate / Individual / Grouped 表示方式。',
  'External Mapping':
    '預留給 FloTHERM 等外部模擬物件的 mapping；03 目前延後，本頁不解析 FloTHERM 格式。',
  'Total Power': 'Qty × Power 的元件功耗摘要，不是 Thermal Edge 的 Heat Flow Q。',
  'Project Default': '此元件繼承 Project 共用材料或 thermal parameter。',
  'Component Override': '此元件改用自己的 thermal parameter。',
  'Architecture Template Preference':
    '只保存建模偏好；真正 Thermal Nodes / Edges 由 Screen 05 建立。',
  Qty: '元件數量；不代表 Screen 05 一定建立相同數量的節點。',
  Power: '單顆元件功耗，單位 W。',
  Limit: '元件允許最高溫度，單位 °C。',
  Package: '封裝型式，例如 QFN、BGA、Bare Die、Module。',
  'Heat Path':
    '熱離開元件的主要方向，決定套用哪一條熱阻鏈與哪一個架構模板。選擇路徑本身不會建立 Node/Edge。',
  TIM: '熱介面材料；指定材料不代表一定建立獨立 Edge。',
  'Source Area':
    '熱離開元件的那個面的面積，由長寬相乘導出，或改用自訂面積。焊料層與擴散段的熱阻用它。',
  'Spread Area':
    '熱離開擴散結構的那個面的面積。板級路徑由 45 度擴散推導、銅塊路徑取銅塊尺寸、其餘等於熱源面。TIM 熱阻用它，所以它通常大於熱源面。',
  Completeness: '熱規格完整度檢查清單，逐項顯示缺少哪一種資料。',
  Source: '此筆資料的來源與修改紀錄，用於資料追溯。',
};

export function tip(key: string): string | undefined {
  return MANAGER_TOOLTIPS_ZH[key];
}

export const ZH: Record<string, string> = {
  'Component Manager': '元件管理',
  Components: '元件總數',
  'Heat Sources': '熱源數',
  'Total Power': '總功耗',
  Ready: '就緒',
  Warnings: '警告',
  Errors: '錯誤',
  Disabled: '停用',
  Status: '狀態',
  Category: '分類',
  Component: '元件名稱',
  Qty: '數量',
  Power: '單顆功耗',
  'Limit Type': '限制類型',
  Limit: '限制溫度',
  Rjc: '接面熱阻',
  Package: '封裝',
  'Heat Path': '散熱路徑',
  TIM: '導熱介質',
  'Thermal Profile': '熱模型狀態',
  Source: '來源',
  Enabled: '啟用',
  Overview: '概要',
  'Thermal Spec': '熱規格',
  Geometry: '幾何',
  'Architecture Prep': '架構準備',
  'External Mapping': '外部映射',
  Completeness: '完整度',
};
