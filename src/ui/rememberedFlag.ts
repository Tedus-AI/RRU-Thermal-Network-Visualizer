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

/**
 * The same, for a value that is not a yes/no.
 *
 * Screen 07's toolbar is a set of reading choices — which result to colour the
 * graph by, which labels to show, how to lay it out — and every one of them
 * reset to its default the moment the engineer stepped to another screen and
 * back. Checking a result against Screen 08 and returning meant re-choosing ΔT,
 * re-ticking Limits, re-picking the layout, every single time.
 *
 * `valid` is not optional politeness: what comes back is whatever a previous
 * BUILD wrote, and a mode or layout that no longer exists would drive the
 * screen into a state its own switch cannot render. An unrecognised value
 * falls back rather than being trusted.
 */
export function useRememberedValue<T>(
  key: string,
  fallback: T,
  valid: (value: unknown) => value is T,
): [T, (next: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(key));
      if (raw == null) return fallback;
      const parsed: unknown = JSON.parse(raw);
      return valid(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(key), JSON.stringify(value));
    } catch {
      // Storage being unavailable must not break the control.
    }
  }, [key, value]);

  const set = useCallback((next: T | ((current: T) => T)) => setValue(next), []);

  return [value, set];
}
