/**
 * "A newer build is deployed": the same reminder AI-Thermal and 5G-RRU show.
 *
 * Every push to main deploys a new build, and a tab opened before it keeps
 * running the old code until it is reloaded — for days, on a laptop that is
 * only ever put to sleep. The build publishes `version.json` (`vite.config.ts`);
 * the tab fetches it shortly after opening, every five minutes and whenever it
 * comes back to the foreground, and a version other than its own puts up the
 * banner (`UpdateBanner.tsx`).
 *
 * Updating never reloads under an edit: whatever is still on its way to the
 * folder or SharePoint is flushed first, and the reload waits for it. The new
 * build then clears the browser cache and reads the projects back from there
 * (`bootstrapStorage.ts`), as any deploy does.
 */

import { create } from 'zustand';

import { flushPendingWork, hasWorkNotOnDisk } from '@/data/unloadGuard';

/** This bundle's version; `dev` under `vite dev`, where there is nothing to compare. */
export const APP_VERSION: string = __APP_VERSION__;

/** The version without the commit, as the header shows it: `v2026.10.27.1402`. */
export function displayVersion(version: string): string {
  return version === 'dev' ? '開發版' : `v${version.replace(/-[0-9a-f]{7,}$/, '')}`;
}

const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 5 * 60_000;
const SNOOZE_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const FLUSH_WAIT_MS = 15_000;

interface UpdateState {
  /** The deployed version, once it has been read. */
  live: string | null;
  /** The banner is showing. */
  prompted: boolean;
  /** Waiting for writes to finish before reloading. */
  updating: boolean;
  /** Why the last update attempt stopped, if it did. */
  blocked: string | null;
}

export const useUpdateStore = create<UpdateState>(() => ({
  live: null,
  prompted: false,
  updating: false,
  blocked: null,
}));

/** Whether the running build is the deployed one: true, false, or null when unknown. */
export function isLatest(live: string | null, running: string = APP_VERSION): boolean | null {
  if (running === 'dev' || live == null) return null;
  return live === running;
}

/** The deployed version, or null when it could not be read (offline, a dev server). */
export async function fetchLiveVersion(
  base: string = import.meta.env.BASE_URL,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(`${base}version.json?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const version =
      body && typeof body === 'object' ? (body as { version?: unknown }).version : undefined;
    return typeof version === 'string' && version.trim() !== '' ? version.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let snoozedUntil = 0;

/** One check: reads the deployed version and raises the banner when it is not this one. */
export async function checkForUpdate(): Promise<void> {
  if (APP_VERSION === 'dev') return;
  const live = await fetchLiveVersion();
  if (live == null) return;
  const prompted = live !== APP_VERSION && Date.now() >= snoozedUntil;
  useUpdateStore.setState((state) => ({
    live,
    prompted: state.prompted || prompted,
  }));
}

/** 「稍後」: hides the banner for ten minutes; the next check after that raises it again. */
export function snoozeUpdate(): void {
  snoozedUntil = Date.now() + SNOOZE_MS;
  useUpdateStore.setState({ prompted: false, blocked: null });
}

/** Resolves once nothing is on its way to disk, or with false after `timeout`. */
async function writesSettled(timeout: number): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (hasWorkNotOnDisk()) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return true;
}

/**
 * 「立即更新」: writes out what is pending, then reloads on the new version.
 *
 * The version goes on the URL so the HTML itself is fetched again rather than
 * served from the browser's cache (GitHub Pages lets it be cached for minutes),
 * and with it the new bundle.
 */
export async function applyUpdate(): Promise<void> {
  const { live } = useUpdateStore.getState();
  useUpdateStore.setState({ updating: true, blocked: null });
  flushPendingWork();
  if (!(await writesSettled(FLUSH_WAIT_MS))) {
    useUpdateStore.setState({
      updating: false,
      blocked: '還有修改沒寫入資料夾／SharePoint，先等右上角的儲存狀態變成「已儲存」再更新。',
    });
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('v', live ?? String(Date.now()));
  window.location.replace(url.toString());
}

let started = false;

/** Starts checking. Idempotent; returns a stop for tests. */
export function startUpdateCheck(): () => void {
  if (started || typeof window === 'undefined' || APP_VERSION === 'dev') return () => {};
  started = true;
  const first = setTimeout(() => void checkForUpdate(), FIRST_CHECK_MS);
  const every = setInterval(() => void checkForUpdate(), CHECK_EVERY_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  };
  document.addEventListener('visibilitychange', onVisible);

  // The `?v=` an update reloaded with has done its job; keep the address clean.
  const url = new URL(window.location.href);
  if (url.searchParams.has('v')) {
    url.searchParams.delete('v');
    window.history.replaceState(window.history.state, '', url.toString());
  }

  return () => {
    clearTimeout(first);
    clearInterval(every);
    document.removeEventListener('visibilitychange', onVisible);
    started = false;
  };
}
