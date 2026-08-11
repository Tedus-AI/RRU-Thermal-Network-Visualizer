/**
 * Normalisation — 08 §4.
 *
 * The three ranking inputs have different units: °C of temperature drop, °C of
 * improvement after a re-solve, and °C of margin recovered. They are scaled to
 * 0–1 against the best value in THIS batch, so the score answers "how does this
 * candidate compare with the others in front of me", which is what a ranking is.
 *
 * Two deliberate choices:
 *
 *   - a negative value normalises to 0, not to a negative number. A change that
 *     makes the target worse is not evidence of a bottleneck, and letting it go
 *     negative would let a bad candidate drag a good component of its own score;
 *   - when every candidate scores 0 on a component, they all get 0 rather than
 *     0/0. Dividing by a zero maximum would turn "nothing helps" into "everything
 *     helps equally".
 */

export function normalizeAgainstMax(values: number[]): number[] {
  const max = values.reduce((best, value) => (Number.isFinite(value) && value > best ? value : best), 0);
  if (!(max > 0)) return values.map(() => 0);
  return values.map((value) => {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(1, value / max);
  });
}

/** Absolute magnitude normalisation, for signed quantities such as edge ΔT. */
export function normalizeMagnitude(values: number[]): number[] {
  return normalizeAgainstMax(values.map((value) => (Number.isFinite(value) ? Math.abs(value) : 0)));
}
