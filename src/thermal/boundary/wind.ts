/**
 * Wind speed is an input the physics does not use yet.
 *
 * Screen 01 asks for it, Screen 06 stores it per scenario and the report
 * prints it — but no convection coefficient in the solve depends on it: the
 * fin correlation is a still-air fit, the plate correlations are natural
 * convection, and a stated h is whatever was stated. Printing "3 m/s" beside a
 * still-air answer invites the reader to think the wind was accounted for, so
 * every place that shows a non-zero wind says that it was not.
 */

/** True when a wind speed was entered that the solve will not apply. */
export function windRecordedOnly(wind_m_s: number | null | undefined): boolean {
  return typeof wind_m_s === 'number' && Number.isFinite(wind_m_s) && wind_m_s > 0;
}

export const WIND_NOT_APPLIED = {
  en: 'not applied — natural convection only',
  zh: '未套用，僅自然對流',
} as const;

/** `3.0 m/s (not applied — natural convection only / 未套用，僅自然對流)`. */
export function windLabel(
  formatted: string,
  wind_m_s: number | null | undefined,
  mode: 'english' | 'chinese' | 'bilingual' = 'bilingual',
): string {
  if (!windRecordedOnly(wind_m_s)) return formatted;
  const note =
    mode === 'english'
      ? WIND_NOT_APPLIED.en
      : mode === 'chinese'
        ? WIND_NOT_APPLIED.zh
        : `${WIND_NOT_APPLIED.en} / ${WIND_NOT_APPLIED.zh}`;
  return `${formatted} (${note})`;
}
