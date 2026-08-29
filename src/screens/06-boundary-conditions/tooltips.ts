/**
 * zh-TW tooltips — from `06_Boundary_Conditions_Tooltips_zh-TW.json`.
 *
 * Kept as data so every panel quotes the same wording, and so the project rule
 * holds: English label visible, Traditional Chinese on hover when there is no
 * room to show both (docs/APP_SHELL_CONTRACT.md).
 */

export const T06 = {
  page: '設定此情境下的環境溫度、對流、輻射、太陽負載與固定溫度邊界。',
  pageSubtitle: '這一頁只設定情境相關的邊界條件，不建立新的熱網路拓撲，也不執行求解。',

  step: {
    scenario: '選擇目前要設定邊界條件的情境。不同情境可以共用 05 的拓撲，但邊界條件彼此獨立。',
    ambientSite: '檢查由 Screen 01 情境設定帶入的環境溫度、風速與太陽條件。',
    surfaceMapping: '將 05 建立的 boundary port 對應到此情境的對流、輻射、太陽或固定溫度條件。',
    convection: '設定表面到空氣的對流係數 h 與有效面積，用於推導邊界熱阻。',
    radiationSolar: '設定輻射參數與太陽熱輸入。太陽負載是外部熱源，不是熱阻。',
    validate: '檢查所有必要邊界條件是否完整，確認可以交給 07 進行熱網路求解。',
  },

  kpi: {
    boundarySet: '顯示目前情境的邊界條件集合狀態，例如草稿、需檢查或可求解。',
    boundaryPorts: '顯示 05 拓撲中的邊界端口有多少已完成此情境的條件指定。',
    ambient: '顯示此情境的環境溫度狀態。這不是求解後的節點溫度。',
    convection: '顯示對流 profile 的數量與是否缺少 h 或面積資料。',
    radiationSolar: '顯示輻射與太陽負載是否已設定完成。',
    solveReadiness: '檢查此情境是否已具備交給 07 求解所需的邊界輸入。',
  },

  field: {
    scenarioName: '情境名稱，例如 Baseline Hot Day、Solar Peak 或 Lab Chamber。',
    copyFromScenario: '從另一個情境複製邊界條件，複製後會成為目前情境的獨立資料。',
    externalAmbient: '外部環境溫度由 Screen 01 情境設定統一管理，06 僅引用此值。',
    internalAir: '內部空氣溫度。目前只作情境記錄，不會自動加入 07 的熱網路求解。',
    radiationSurrounding:
      '周圍輻射溫度。產生新的輻射 profile 時用來預填參數；求解以已指派 profile 的參數為準。',
    altitude:
      '安裝海拔。目前以手動 h 或邊界 profile 為正式計算輸入，因此海拔只作情境記錄，不會自行修正熱阻。',
    windSpeed:
      '外部風速由 Screen 01 管理，供情境識別；目前不會自動推算對流 h，求解以 profile 內的手動 h 為準。',
    windDirection: '風向用於記錄安裝條件，目前不會自動修正對流熱阻。',
    airflowMode: '氣流模式用於情境分類；目前求解仍以已指派 profile 的 h 為準。',
    convectionMethod:
      '設定對流輸入方式。目前正式計算輸入為 profile 內的手動 h，尚未實作自動相關式。',
    solarEnabled:
      '啟用太陽負載設定。只有當表面已指派完整的 solar profile 時，才會成為 07 的外部熱輸入。',
    solarIrradiance:
      '太陽輻照度，單位 W/m²。產生新的 solar profile 時用來預填；求解以已指派 profile 的值為準。',
    solarIncidence: '太陽入射角用於記錄安裝方位，目前不會自動轉換為投影面積係數。',
    absorptivity: '表面吸收太陽能的比例，需介於 0 到 1。',
    emissivity: '表面發射率，用於輻射熱交換計算，需介於 0 到 1。',
    shadingFactor: '遮蔽係數，1 代表無遮蔽，0 代表完全遮蔽。',
    projectedAreaFactor: '投影面積係數，代表實際承受日照的比例。',
    viewFactor: '視角因子，代表表面與周圍環境之間的輻射交換比例。',
    hConv: '對流熱傳係數 h，單位 W/m²K。V1 由工程師手動輸入。',
    area: '參與此邊界條件的有效表面積，單位 m²。',
    fixedTemperature: '固定溫度邊界的溫度值，例如恆溫槽或受控冷板。',
    adiabaticReason: '絕熱邊界不需要數值；理由僅供稽核，可留白且不會阻擋求解。',
    boundaryType: '此邊界端口採用的邊界條件型別。',
    representation: '此 profile 在 07 求解時的表示方式，例如並聯邊界或外部熱負載。',
    dataSource:
      '資料來源：manual、analytical、datasheet、assumed、measurement 或 vendor。FloTHERM 來源需等 Screen 03 完成後再啟用。',
    confidence: '此邊界輸入的信心度。低信心度會顯示警告，但不會改變數值求解結果。',
  },

  derived: {
    disclaimer: '求解前的邊界輸入預覽。節點溫度與連線熱流由 07 計算。',
    rconv: '對流邊界熱阻預覽 = 1 / (h × A)。',
    rrad: '輻射邊界熱阻預覽 = 1 / (h_rad × A)，其中 h_rad 為線性化輻射係數。',
    rcombined: '對流與輻射為並聯，因此以導熱率相加後取倒數，不是熱阻相加。',
    qsolar: '太陽熱負載預覽，為外部熱輸入，與元件功耗分開儲存。',
  },

  mapping:
    '預留給 FloTHERM 等外部模擬的對照別名；Screen 03 的解析功能尚未實作，此處僅儲存中繼資料。',
  floThermDeferred: 'FloTHERM 匯入延後中，別名僅供未來對照使用。',
  readOnlyTopology: '拓撲由 05 建立，於此畫面唯讀：06 不新增或刪除任何節點與連線。',
} as const;
