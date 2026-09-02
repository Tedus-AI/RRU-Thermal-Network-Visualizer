/**
 * A yes/no view preference, remembered between visits.
 *
 * The graph legends open and close, and until now each one forgot on every
 * mount: whatever you decided about it you decided again next time you opened
 * the screen. That is fine for a control you touch once, and wrong for one you
 * touch on every visit to say the same thing.
 *
 * Stored under the same `tnvui.` prefix as the panel sizes and the column
 * widths, and for the same reason: `syncBuildStamp` clears the `tnv.` namespace
 * whenever the build changes, because project data written against an older
 * schema cannot be trusted. Whether a legend is open has no schema.
 */

import { useCallback, useEffect, useState } from 'react';

import { PANEL_STORAGE_PREFIX } from './panelSize';

function storageKey(key: string): string {
  return `${PANEL_STORAGE_PREFIX}flag.${key}`;
}

export function readRememberedFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return fallback;
  } catch {
    // A store that is unavailable just means "no remembered answer".
    return fallback;
  }
}

export function writeRememberedFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(storageKey(key), value ? 'true' : 'false');
  } catch {
    // Storage being unavailable must not break the control.
  }
}

/**
 * `useState` for a flag that outlives the mount.
 *
 * Read lazily so the first paint already carries the remembered answer — a
 * legend that flashed open and then collapsed would be worse than one that
 * never remembered at all.
 */
export function useRememberedFlag(
  key: string,
  fallback: boolean,
): [boolean, (next: boolean | ((current: boolean) => boolean)) => void] {
  const [value, setValue] = useState(() => readRememberedFlag(key, fallback));

  useEffect(() => {
    writeRememberedFlag(key, value);
  }, [key, value]);

  const set = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => setValue(next),
    [],
  );

  return [value, set];
}
