/**
 * Which power a scenario solves with.
 *
 * AI-Thermal states two Pd per component: at the high-temperature condition
 * (`Power(W)`, this tool's `power_W`) and at 25 °C (`Power_RT(W)`, this tool's
 * `power_rt_W`). PA efficiency moves with temperature, so the two differ; a
 * room-temperature scenario (validation against a 25 °C lab test) has to use
 * the second. The power scale still multiplies whichever is chosen.
 *
 * `hot` is every scenario that existed before this, and is stored as no key.
 */

export const POWER_BASES = ['hot', 'rt'] as const;
export type PowerBasis = (typeof POWER_BASES)[number];

export const POWER_BASIS_LABEL: Record<PowerBasis, string> = {
  hot: '高溫 Pd',
  rt: '常溫 Pd',
};

/** A scenario's basis: `rt` only when it says so. */
export function powerBasisOf(scenario: { power_basis?: unknown } | null | undefined): PowerBasis {
  return scenario?.power_basis === 'rt' ? 'rt' : 'hot';
}

/** The basis as a report prints it, in the report's language. */
export const POWER_BASIS_EN: Record<PowerBasis, string> = {
  hot: 'Hot-condition Pd',
  rt: 'Room-temperature Pd (25 °C)',
};

export function powerBasisText(
  basis: PowerBasis,
  mode: 'english' | 'chinese' | 'bilingual' = 'bilingual',
): string {
  if (mode === 'english') return POWER_BASIS_EN[basis];
  if (mode === 'chinese') return POWER_BASIS_LABEL[basis];
  return `${POWER_BASIS_EN[basis]} / ${POWER_BASIS_LABEL[basis]}`;
}
