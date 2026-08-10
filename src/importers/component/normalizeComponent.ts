/**
 * Normalization — 02 §10, §14, §15, §16.
 *
 * Turns raw cell text into typed values. The central rule (02 §14, §34):
 * a value that fails to parse becomes `null`, never 0. A silent zero would look
 * like a real 0 W component and quietly corrupt every downstream heat balance.
 */

import {
  BOARD_TYPES,
  COMPONENT_CATEGORIES,
  TIM_TYPES,
  type BoardType,
  type ComponentCategory,
  type TimType,
} from '@/domain/component';

export interface NumericParse {
  value: number | null;
  /** True when text was present but could not be read as a number. */
  invalid: boolean;
}

/**
 * Accepts "52.13", "52,13", "1 234.5", "35 W", "0.35 C/W", "(2)" negatives.
 * Returns invalid=true rather than guessing when the text is not numeric.
 */
export function parseNumericCell(raw: string | undefined | null): NumericParse {
  if (raw == null) return { value: null, invalid: false };
  const text = String(raw).trim();
  if (text === '' || text === '-' || text === '—' || text === 'N/A' || text === 'n/a') {
    return { value: null, invalid: false };
  }

  let cleaned = text
    .replace(/[\s '’]/g, '')
    // Strip trailing units: W, C/W, °C, mm …
    .replace(/(w|c\/w|°c|℃|mm|ohm)$/i, '');

  let negative = false;
  if (/^\((.*)\)$/.test(cleaned)) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }

  // "1,234.5" -> thousands separator; "52,13" -> decimal comma.
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',')) {
    cleaned = /,\d{3}$/.test(cleaned) ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  }

  if (!/^[+-]?\d*\.?\d+(e[+-]?\d+)?$/i.test(cleaned)) {
    return { value: null, invalid: true };
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return { value: null, invalid: true };
  return { value: negative ? -parsed : parsed, invalid: false };
}

const CATEGORY_ALIASES: Record<string, ComponentCategory> = {
  rf: 'RF',
  'rf board': 'RF',
  radio: 'RF',
  pa: 'RF',
  digital: 'Digital',
  dig: 'Digital',
  'digital board': 'Digital',
  baseband: 'Digital',
  pwr: 'Power',
  power: 'Power',
  'power board': 'Power',
  psu: 'Power',
  filter: 'Filter',
  duplexer: 'Filter',
  cavity: 'Filter',
  other: 'Other',
  misc: 'Other',
  mech: 'Other',
};

export function normalizeCategory(raw: unknown): ComponentCategory | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const exact = COMPONENT_CATEGORIES.find((c) => c.toLowerCase() === text.toLowerCase());
  if (exact) return exact;

  return CATEGORY_ALIASES[text.toLowerCase()] ?? null;
}

/** 02 §15 — unrecognised values become Custom (and the caller raises a warning). */
const BOARD_TYPE_ALIASES: Record<string, BoardType> = {
  via: 'Thermal Via',
  vias: 'Thermal Via',
  'thermal via': 'Thermal Via',
  'thermal vias': 'Thermal Via',
  'via array': 'Thermal Via',
  'cu coin': 'Copper Coin',
  'copper coin': 'Copper Coin',
  'copper slug': 'Copper Coin',
  coin: 'Copper Coin',
  none: 'None',
  'no board path': 'None',
  na: 'None',
  '-': 'None',
};

export function normalizeBoardType(raw: unknown): BoardType | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const exact = BOARD_TYPES.find((b) => b.toLowerCase() === text.toLowerCase());
  if (exact) return exact;

  return BOARD_TYPE_ALIASES[text.toLowerCase()] ?? 'Custom';
}

/**
 * 02 §16 — V1 TIM vocabulary. Legacy "Solder" from the Volume Tool is mapped to
 * Custom and must NOT be turned into a separate thermal edge here; that decision
 * belongs to Screen 05.
 */
const TIM_ALIASES: Record<string, TimType> = {
  grease: 'Grease',
  'thermal grease': 'Grease',
  paste: 'Grease',
  'thermal paste': 'Grease',
  pad: 'Pad',
  'thermal pad': 'Pad',
  'gap pad': 'Pad',
  pad2: 'Pad2',
  'pad 2': 'Pad2',
  putty: 'Putty',
  'gap filler': 'Putty',
  gapfiller: 'Putty',
  none: 'None',
  na: 'None',
  '-': 'None',
};

export function normalizeTim(raw: unknown): TimType | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const exact = TIM_TYPES.find((t) => t.toLowerCase() === text.toLowerCase());
  if (exact) return exact;

  return TIM_ALIASES[text.toLowerCase()] ?? 'Custom';
}

/** True when the raw text was present but had to fall back to Custom. */
export function fellBackToCustom(raw: unknown, normalized: string | null): boolean {
  if (normalized !== 'Custom') return false;
  const text = raw == null ? '' : String(raw).trim();
  return text.length > 0 && text.toLowerCase() !== 'custom';
}
