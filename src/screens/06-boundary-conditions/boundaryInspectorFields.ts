/**
 * Screen 06 boundary inspector: the static field tables.
 *
 * Which numeric inputs each boundary type asks for and what it requires, the
 * fin-array geometry inputs, and the data-source choices. The inspector and
 * its panels both read them.
 */

import type { BoundaryConditionType, BoundaryDataSource } from '@/thermal/boundary/types';
import { FIN_GEOMETRY_KEYS } from '@/thermal/boundary/calculations';

import { T06 } from './tooltips';

/** Types whose surface can be described as a fin array instead of an h. */
export const FIN_CAPABLE_TYPES = new Set<BoundaryConditionType>([
  'convection_to_ambient',
  'combined_convection_radiation',
]);

/**
 * Parameters the geometry supersedes.
 *
 * They are hidden rather than disabled while geometry is on. A greyed-out `h`
 * still showing 8 next to a computed 6.23 invites the reader to wonder which
 * one the solve used, and the answer — that the stored value is inert — is not
 * visible in a disabled box.
 */
export const FIN_DERIVED_PARAMETER_KEYS = new Set([
  'h_W_m2K',
  'area_m2',
  'emissivity',
  'viewFactor',
  'surfaceReferenceTemperatureGuess_C',
]);

export const FIN_GEOMETRY_FIELDS: Array<{
  key: string;
  label: string;
  zh: string;
  unit: string;
  tip: string;
  dieCastingOnly?: boolean;
}> = [
  {
    key: FIN_GEOMETRY_KEYS.baseLength,
    label: 'Base L',
    zh: '底座長',
    unit: 'mm',
    tip: '散熱器底座沿鰭片長度方向的尺寸，取自 01 的散熱器底座。',
  },
  {
    key: FIN_GEOMETRY_KEYS.baseWidth,
    label: 'Base W',
    zh: '底座寬',
    unit: 'mm',
    tip: '散熱器底座橫跨鰭片排列方向的尺寸；鰭片數由此推算。',
  },
  {
    key: FIN_GEOMETRY_KEYS.height,
    label: 'Fin Height',
    zh: '鰭片高度',
    unit: 'mm',
    tip: '鰭片自底座算起的高度。h 會隨鰭片變高而下降（邊界層變厚），這正是固定 h 模型會高估高鰭片的原因。',
  },
  {
    key: FIN_GEOMETRY_KEYS.gap,
    label: 'Air Gap',
    zh: '鰭片間隙 Air gap',
    unit: 'mm',
    tip: '相鄰兩片鰭片之間的空氣間隙（淨間距，不是 fin pitch；pitch＝厚度＋air gap）。h 的對流項與輻射項都由它決定。',
  },
  {
    key: FIN_GEOMETRY_KEYS.thickness,
    label: 'Fin Thickness',
    zh: '鰭片厚度',
    unit: 'mm',
    tip: '鰭片尖端厚度。壓鑄件的根部較厚，由拔模角推算。',
  },
  {
    key: FIN_GEOMETRY_KEYS.conductivity,
    label: 'Fin k',
    zh: '鰭片導熱係數',
    unit: 'W/mK',
    tip: '鰭片本身的導熱係數，決定鰭片效率。連結 AI-Thermal 時取 5G-RRU 的 K_FIN（出廠預設 Embedded 200、Die-casting 150）；沒有連結時留白＝製程預設：埋入/擠型純鋁 200；壓鑄鰭片與基座一體成形，取 01 的散熱器基座材料 k（ADC12 為 96）。',
  },
  {
    key: FIN_GEOMETRY_KEYS.draftAngle,
    label: 'Draft Angle',
    zh: '拔模角',
    unit: '°',
    tip: '壓鑄鰭片的脫模斜度。根部變厚會壓縮通道並可能少排一片鰭片。',
    dieCastingOnly: true,
  },
  {
    key: FIN_GEOMETRY_KEYS.processEfficiency,
    label: 'Process Factor',
    zh: '製程係數',
    unit: '',
    tip: '鰭片模型未涵蓋部分的殘差修正，預設 1.0（不修正）。大於 1 代表表面效能超過鰭片效率本身，那是在吸收模型缺少的物理量——而本工具另外計算擴散熱阻，可能重複計入。',
  },
  {
    key: FIN_GEOMETRY_KEYS.countOverride,
    label: 'Fin Count',
    zh: '鰭片數',
    unit: 'pcs',
    tip: '留白即由底座寬度、間距與厚度自動推算；只有實際排片與計算不同時才覆寫。',
  },
];

export const SOURCES: BoundaryDataSource[] = [
  'manual',
  'analytical',
  'datasheet',
  'assumed',
  'measurement',
  'vendor',
];

/** Required numeric inputs for each actively supported boundary type. */
export const TYPE_PARAMETERS: Record<
  BoundaryConditionType,
  Array<{ key: string; label: string; zh: string; unit: string; tip?: string; max?: number }>
> = {
  // Ambient temperature is authoritative in Screen 01 Scenario Settings. This entry
  // remains empty for legacy schema compatibility and is never offered by this UI.
  ambient_reservoir: [],
  convection_to_ambient: [
    { key: 'h_W_m2K', label: 'Convection h', zh: '對流係數', unit: 'W/m²K', tip: T06.field.hConv },
    { key: 'area_m2', label: 'Effective Area', zh: '有效面積', unit: 'm²', tip: T06.field.area },
  ],
  radiation_to_surroundings: [
    { key: 'emissivity', label: 'Emissivity', zh: '發射率', unit: '', tip: T06.field.emissivity, max: 1 },
    { key: 'viewFactor', label: 'View Factor', zh: '視角因子', unit: '', tip: T06.field.viewFactor, max: 1 },
    { key: 'area_m2', label: 'Effective Area', zh: '有效面積', unit: 'm²', tip: T06.field.area },
    {
      key: 'surfaceReferenceTemperatureGuess_C',
      label: 'Surface Temperature Guess',
      zh: '表面溫度假設',
      unit: '°C',
      tip: '線性化輻射係數 εσF(Ts²+Ta²)(Ts+Ta) 需要表面溫度假設，周圍溫度取情境環境溫度；留白時以環境溫度 + 35°C 預估，真實值由 07 求解。',
    },
  ],
  combined_convection_radiation: [
    { key: 'h_W_m2K', label: 'Convection h', zh: '對流係數', unit: 'W/m²K', tip: T06.field.hConv },
    { key: 'emissivity', label: 'Emissivity', zh: '發射率', unit: '', tip: T06.field.emissivity, max: 1 },
    { key: 'viewFactor', label: 'View Factor', zh: '視角因子', unit: '', tip: T06.field.viewFactor, max: 1 },
    { key: 'area_m2', label: 'Effective Area', zh: '有效面積', unit: 'm²', tip: T06.field.area },
    {
      key: 'surfaceReferenceTemperatureGuess_C',
      label: 'Surface Temperature Guess',
      zh: '表面溫度假設',
      unit: '°C',
      tip: '對流關聯式與輻射係數 εσF(Ts²+Ta²)(Ts+Ta) 共用此假設，周圍溫度取情境環境溫度；留白時以環境溫度 + 35°C 預估，真實表面溫度由 07 求解。',
    },
  ],
  solar_load: [
    {
      key: 'irradiance_W_m2',
      label: 'Irradiance',
      zh: '輻照度',
      unit: 'W/m²',
      tip: T06.field.solarIrradiance,
    },
    {
      key: 'absorptivity',
      label: 'Absorptivity',
      zh: '吸收率',
      unit: '',
      tip: T06.field.absorptivity,
      max: 1,
    },
    {
      key: 'projectedAreaFactor',
      label: 'Projected Area Factor',
      zh: '投影面積係數',
      unit: '',
      tip: T06.field.projectedAreaFactor,
      max: 1,
    },
    {
      key: 'shadingFactor',
      label: 'Shading Factor',
      zh: '遮蔽係數',
      unit: '',
      tip: T06.field.shadingFactor,
      max: 1,
    },
    { key: 'receivingArea_m2', label: 'Receiving Area', zh: '受照面積', unit: 'm²' },
  ],
  fixed_temperature_boundary: [
    {
      key: 'fixedTemperature_C',
      label: 'Fixed Temperature',
      zh: '固定溫度',
      unit: '°C',
      tip: T06.field.fixedTemperature,
    },
  ],
  adiabatic_symmetry: [],
  external_cfd_placeholder: [],
};

export const TYPE_REQUIREMENT: Record<BoundaryConditionType, { en: string; zh: string }> = {
  ambient_reservoir: {
    en: 'Ambient temperature is inherited from Screen 01 Scenario Settings.',
    zh: '環境溫度由 Screen 01「情境設定」統一提供。',
  },
  convection_to_ambient: {
    en: 'h and effective area are required. Without either value, Rconv cannot be calculated and Screen 07 is blocked.',
    zh: '必須提供 h 與有效面積；缺少任一值便無法計算 Rconv，並會阻擋 07 求解。',
  },
  radiation_to_surroundings: {
    en: 'Emissivity, view factor and effective area are required. The surface-temperature guess may use the shown assumption.',
    zh: '發射率、視角因子與有效面積為必要值；表面溫度假設可採系統顯示的預估。',
  },
  combined_convection_radiation: {
    en: 'Convection and radiation inputs form parallel heat paths. Missing inputs make the applicable preview incomplete.',
    zh: '對流與輻射形成並聯散熱路徑；缺少輸入會使相應的預覽不完整。',
  },
  solar_load: {
    en: 'All five factors are required to calculate solar heat input. This is a heat load, not a resistance.',
    zh: '五項係數都必須完整，才能計算太陽熱輸入；它是熱負載，不是熱阻。',
  },
  fixed_temperature_boundary: {
    en: 'A known temperature is required for a controlled cold plate, chamber fixture or test interface.',
    zh: '受控冷板、環境箱治具或測試介面必須提供已知固定溫度。',
  },
  adiabatic_symmetry: {
    en: 'No numeric input is required. A reason is optional audit information and does not block the solver.',
    zh: '不需要數值輸入；理由僅供稽核，可留白且不會阻擋求解。',
  },
  external_cfd_placeholder: {
    en: 'Metadata only while Screen 03 is deferred. It does not provide solver input.',
    zh: 'Screen 03 延後期間僅保留中繼資料，不會提供求解輸入。',
  },
};
