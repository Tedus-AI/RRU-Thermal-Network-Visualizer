/**
 * Engineering tooltips — 05 §57 and 05_Thermal_Path_Builder_Tooltips_zh-TW.json.
 *
 * Kept as data so every panel quotes the same wording. English is the primary
 * label everywhere; these are the Traditional Chinese explanations shown on
 * hover/focus where there is no room for an inline translation (05 §3).
 */

export const TOOLTIPS_ZH = {
  thermalPort:
    '元件模板的熱連接埠，供 local subgraph 連到共用 Base、Heat Pipe 或 HSK 結構。',
  qtyRepresentation:
    '決定多顆同型元件要以 Aggregate、Individual 或 Grouped 方式表示。',
  architectureTemplate:
    '生成元件 local thermal subgraph 的模板；透過 ports 連到共用系統結構，不可硬綁 Main Base。',
  sharedStructure:
    '所有元件共同使用的 Main Base、Base Zones、Heat Sink、Housing 等系統層熱結構。',
  spreadingResistance:
    '代表 3D heat spreading 的等效熱阻；除非假設合理，不能直接以 L/kA 取代。',
  boundaryPlaceholder:
    '預留給 Screen 06 設定 Ambient、Convection、Radiation 等邊界條件。',
  unresolvedRth:
    '拓樸已定義，但此段熱阻尚未知、參數不足或需由 Boundary / CFD / Measurement 校正。',
  activeRthSource:
    '決定 solver 未來使用哪個 Rth 來源；Analytical、FloTHERM、Measurement、Manual 必須各自保留。',
  externalMapping:
    '預留給 FloTHERM 等外部模擬物件 / interface 的映射資料；Screen 03 尚未實作 parser。',
  validate:
    '檢查 orphan heat source、未連接 ports、invalid Rth、missing nodes 與 topology readiness。',
  generateFromPreferences:
    '依 Screen 04 的 Template / Qty / Base Zone preference 產生 network preview，確認後才建立。',
  totalPower:
    '元件總功耗可作 source node aggregation，但不可直接視為任何 Thermal Edge 的 Heat Flow Q。',
} as const;
