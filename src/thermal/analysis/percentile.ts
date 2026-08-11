/**
 * Percentiles — 09 §24, §30.
 *
 * "P95 means 95 % of the selected nodes are at or below this temperature."
 *
 * The method is linear interpolation between the two closest ranks (the R-7 /
 * Excel `PERCENTILE.INC` definition). It is written out rather than delegated
 * because 09 §24 asks for a DETERMINISTIC implementation: several libraries
 * silently differ on nearest-rank vs interpolated, which would move a KPI
 * between releases for no engineering reason.
 */

/** Ascending copy. Non-finite values are dropped, never coerced. */
export function sortedFinite(values: number[]): number[] {
  return values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
}

/**
 * `p` is a fraction in [0, 1]. `sorted` must already be ascending.
 * Returns null for an empty dataset — a percentile of nothing is not 0.
 */
export function percentileOfSorted(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];

  const clamped = Math.min(1, Math.max(0, p));
  const position = (sorted.length - 1) * clamped;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];

  const fraction = position - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

export function percentile(values: number[], p: number): number | null {
  return percentileOfSorted(sortedFinite(values), p);
}

/**
 * Where one value sits in the dataset — 09 §30.
 *
 * "97th percentile" means the node is hotter than 97 % of the selected dataset.
 * Ties count as "at or below", so the hottest node reads 100 and the coldest
 * reads its share of the ties rather than a misleading 0.
 */
export function percentilePositionOf(sorted: number[], value: number): number | null {
  if (sorted.length === 0 || !Number.isFinite(value)) return null;
  let atOrBelow = 0;
  for (const entry of sorted) {
    if (entry <= value) atOrBelow++;
    else break;
  }
  return (atOrBelow / sorted.length) * 100;
}
