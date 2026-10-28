/**
 * Presentation helpers for Screen 08.
 *
 * Formatting only, and the one rule about which study buttons are live.
 * Nothing here recomputes a margin or re-orders the parts — the order arrives
 * from `marginRanking` and is displayed as given.
 */

/** A missing value is N/A. It is never rendered as 0. */
export function num(value: number | null | undefined, digits = 1, unit = ''): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  const text = Math.abs(value) >= 1000 ? value.toFixed(0) : value.toFixed(digits);
  return unit ? `${text} ${unit}` : text;
}

export function rth(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  if (value >= 100) return value.toFixed(1);
  if (value >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

export function signed(value: number | null | undefined, digits = 1, unit = ''): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  const text = `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
  return unit ? `${text} ${unit}` : text;
}

export function timeOf(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

/**
 * Which of the three write buttons are live, given where the tuner stands.
 *
 * Add and Save are one decision, not two: a draft can only be added and a
 * record being edited can only be written over, so the pair says which of
 * "new row" and "same row" this click means. Reset is separate — it is the
 * only one of the three that changes nothing outside the screen.
 *
 * It lives here, tested, because the rule is easy to state and was twice got
 * wrong in the component: first with no way to leave a record at all, then
 * with a way out that cleared the cuts on the way, which left Add grey for a
 * second reason and threw away the reader's work.
 */
export function studyButtons({
  readOnly,
  editing,
  dirty,
}: {
  readOnly: boolean;
  /** True while the sliders are attached to a saved study. */
  editing: boolean;
  /** True while they say something the study — or the solve — does not. */
  dirty: boolean;
}): { add: boolean; save: boolean; reset: boolean } {
  return {
    add: !readOnly && !editing && dirty,
    save: !readOnly && editing && dirty,
    reset: dirty,
  };
}
