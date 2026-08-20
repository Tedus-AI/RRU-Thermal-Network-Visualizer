/**
 * Normalization — 02 §10, §14, §15, §16.
 *
 * Turns raw cell text into typed values. The central rule (02 §14, §34):
 * a value that fails to parse becomes `null`, never 0. A silent zero would look
 * like a real 0 W component and quietly corrupt every downstream heat balance.
 */

import {
  COMPONENT_CATEGORIES,
  HEAT_PATH_TYPES,
  TIM_TYPES,
  type ComponentCategory,
  type HeatPathType,
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

/**
 * 02 §15 — heat path vocabulary, including the names this tool used to store
 * and the ones the Volume Evaluation Tool writes.
 *
 * `None` deserves a note: in the Volume Evaluation Tool it does NOT mean "no
 * path". Those rows carry `Thick(mm) = 0` and get `R_int = 0`, with the TIM
 * sitting straight on the package — which is top-surface cooling. Reading it as
 * "no path" would drop a real conduction route.
 */
const HEAT_PATH_ALIASES: Record<string, HeatPathType> = {
  // Copper coin, i.e. a Final PA soldered to a slug.
  coin: 'Coin',
  'cu coin': 'Coin',
  'copper coin': 'Coin',
  'copper slug': 'Coin',
  'bottom cool coin': 'Coin',

  // Down through the board.
  board: 'Board',
  via: 'Board',
  vias: 'Board',
  'thermal via': 'Board',
  'thermal vias': 'Board',
  'via array': 'Board',
  'pcb only': 'Board',
  pcb: 'Board',
  'board vias': 'Board',

  // Up through the package top.
  none: 'TopSurface',
  na: 'TopSurface',
  '-': 'TopSurface',
  'top surface': 'TopSurface',
  topsurface: 'TopSurface',
  top: 'TopSurface',
  'top cool': 'TopSurface',

  // Bolted to metal, no board path at all.
  'direct metal': 'DirectMetal',
  directmetal: 'DirectMetal',
  'metal mount': 'DirectMetal',
  'main base': 'DirectMetal',
  'small base': 'DirectMetal',
};

/**
 * Returns null for blank OR unrecognised text. There is no "Custom" heat path
 * to hide an unknown in any more, so the caller warns and infers instead.
 */
export function normalizeHeatPath(raw: unknown): HeatPathType | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const exact = HEAT_PATH_TYPES.find((b) => b.toLowerCase() === text.toLowerCase());
  if (exact) return exact;

  return HEAT_PATH_ALIASES[text.toLowerCase()] ?? null;
}

/** True when heat path text was present but could not be recognised. */
export function unrecognisedHeatPath(raw: unknown, normalized: HeatPathType | null): boolean {
  if (normalized != null) return false;
  return (raw == null ? '' : String(raw).trim()).length > 0;
}

/**
 * TIM vocabulary — widened by 04 §11 to include PCM, Gap Filler and Solder as
 * first-class types. Naming a TIM still does NOT create a thermal edge; that
 * decision belongs to Screen 05 (02 §16, 04 §11).
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
  'gap filler': 'Gap Filler',
  gapfiller: 'Gap Filler',
  gap: 'Gap Filler',
  pcm: 'PCM',
  'phase change': 'PCM',
  solder: 'Solder',
  'die attach': 'Solder',
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
