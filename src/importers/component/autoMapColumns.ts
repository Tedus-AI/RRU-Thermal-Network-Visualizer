/**
 * Header detection and automatic column mapping — 02 §11, §12.
 *
 * A source whose headers already match the canonical schema maps with no user
 * interaction; near-misses ("Device Name", "Power Dissipation", "元件名稱") are
 * resolved through an alias table.
 */

import { CANONICAL_FIELDS, IGNORE_COLUMN, type CanonicalField, type MappingTarget } from './types';

/** 02 §12 — alias lists include Traditional Chinese headers. */
const ALIASES: Record<CanonicalField, string[]> = {
  Component: [
    'component',
    'components',
    'device',
    'device name',
    'devicename',
    'part',
    'part name',
    'part number',
    'comp name',
    'comp',
    'name',
    '元件',
    '元件名稱',
    '零件',
    '零件名稱',
    '料號',
  ],
  Qty: ['qty', 'quantity', 'count', 'pcs', 'number', 'no of parts', '數量', '顆數', '個數'],
  'Power(W)': [
    'power',
    'power(w)',
    'power w',
    'power_w',
    'power dissipation',
    'dissipation',
    'watt',
    'watts',
    'pd',
    'p(w)',
    '功耗',
    '單顆功耗',
    '發熱量',
  ],
  Category: [
    'category',
    'type',
    'comp type',
    'component type',
    'board',
    'group',
    'class',
    '類別',
    '分類',
    '類型',
  ],
  'Limit(C)': [
    'limit',
    'limit(c)',
    'limit c',
    'limit_c',
    'temp limit',
    'temperature limit',
    'max temp',
    'tjmax',
    'tj max',
    'tj_max',
    'tcmax',
    '溫度上限',
    '最高溫度',
    '限制溫度',
  ],
  R_jc: [
    'r_jc',
    'rjc',
    'r jc',
    'rjc(c/w)',
    'theta jc',
    'thetajc',
    'θjc',
    'junction case',
    'junction-to-case',
    'junction to case',
    '熱阻',
    'jc熱阻',
  ],
  // The old canonical name and the Volume Evaluation Tool's column both alias
  // onto Heat Path, so an export written before the rename still maps itself.
  Heat_Path: [
    'heat_path',
    'heat path',
    'heatpath',
    'board_type',
    'board type',
    'boardtype',
    'board',
    'pcb type',
    'board path',
    'cooling direction',
    '板材類型',
    '板級導熱',
    '導熱方式',
    '散熱路徑',
    '主要散熱方向',
  ],
  TIM_Type: [
    'tim_type',
    'tim type',
    'timtype',
    'tim',
    'interface material',
    'thermal interface',
    '導熱介質',
    '介面材料',
    '熱介面材料',
  ],
  Source_L: [
    'source_l',
    'source l',
    'pad_l',
    'pad l',
    'padl',
    'pad length',
    'pad_l(mm)',
    'epad l',
    '長',
    '接觸面長',
    'pad 長',
    '熱源面長',
    '銅塊接合面長',
  ],
  Source_W: [
    'source_w',
    'source w',
    'pad_w',
    'pad w',
    'padw',
    'pad width',
    'pad_w(mm)',
    'epad w',
    '寬',
    '接觸面寬',
    'pad 寬',
    '熱源面寬',
    '銅塊接合面寬',
  ],
  Spread_L: ['spread_l', 'spread l', 'spread length', 'base_l', 'base l', '擴散面長', '底面長'],
  Spread_W: ['spread_w', 'spread w', 'spread width', 'base_w', 'base w', '擴散面寬', '底面寬'],
  TIM_k: ['tim_k', 'tim k', 'k_tim', 'tim conductivity', 'tim 導熱係數', 'tim 熱傳導率'],
  TIM_BLT: ['tim_blt', 'tim blt', 'blt', 'bond line thickness', 'tim thickness', 'tim 厚度'],
  'Thick(mm)': ['thick', 'thick(mm)', 'thickness', 'thickness(mm)', 'thk', '厚度', '板厚'],
};

/** Lower-case, strip punctuation and spacing so "Power (W)" == "power_w". */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .replace(/[\s_\-./]+/g, ' ')
    .replace(/[()°]/g, '')
    .trim();
}

const COMPACT = (value: string) => normalizeHeader(value).replace(/\s+/g, '');

export function matchCanonicalField(header: string): CanonicalField | null {
  const normalized = normalizeHeader(header);
  const compact = COMPACT(header);
  if (!compact) return null;

  // Exact canonical name wins outright.
  for (const field of CANONICAL_FIELDS) {
    if (COMPACT(field) === compact) return field;
  }

  for (const field of CANONICAL_FIELDS) {
    for (const alias of ALIASES[field]) {
      const aliasCompact = COMPACT(alias);
      if (aliasCompact === compact) return field;
    }
  }

  // Fall back to a contains match, longest alias first so "power dissipation"
  // beats "power" and cannot be stolen by a shorter, less specific alias.
  const candidates: Array<{ field: CanonicalField; length: number }> = [];
  for (const field of CANONICAL_FIELDS) {
    for (const alias of ALIASES[field]) {
      const aliasNormalized = normalizeHeader(alias);
      if (aliasNormalized.length < 3) continue;
      if (normalized.includes(aliasNormalized)) {
        candidates.push({ field, length: aliasNormalized.length });
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0].field;
}

/**
 * Maps every source column to a canonical field or to "ignore".
 * A canonical field is never claimed twice — the first (leftmost) column wins and
 * later matches fall back to ignore, so the user resolves it explicitly.
 */
export function autoMapColumns(headers: string[]): MappingTarget[] {
  const claimed = new Set<CanonicalField>();
  return headers.map((header) => {
    const field = matchCanonicalField(header);
    if (field && !claimed.has(field)) {
      claimed.add(field);
      return field;
    }
    return IGNORE_COLUMN;
  });
}

export function unmappedRequiredFields(mapping: MappingTarget[], required: CanonicalField[]) {
  const mapped = new Set(mapping.filter((m) => m !== IGNORE_COLUMN));
  return required.filter((field) => !mapped.has(field));
}
