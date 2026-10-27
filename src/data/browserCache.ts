/**
 * 「清空瀏覽器暫存」: empties this tool's working copy in the browser.
 *
 * The browser keeps only a working cache of the projects (`persistence.ts`); the
 * folder and SharePoint hold the real files. The cache lives in localStorage,
 * whose small quota GitHub Pages shares between every tool on the site
 * (AI-Thermal, 5G-RRU, this one), so it can fill up. Nothing is lost when it
 * does — edits are kept in memory and still written out — but the warning
 * stays until the cache is smaller.
 *
 * Clearing is what every deploy of a new build already does (`buildStamp.ts`):
 * the `tnv.*` collections go, and the next load reads the projects back from
 * the folder or SharePoint. The settings are not in that namespace — where to
 * store, the Microsoft sign-in, panel sizes — so they stay.
 *
 * It is refused whenever the browser copy could be the only one: no folder or
 * SharePoint connected, an edit still on its way, or a project that is in the
 * browser but in neither place.
 */

import { BUILD_STAMP_KEY, ownedKeys, type StorageLike } from './buildStamp';
import { hasUnsyncedProjects, useFolderStore } from './folderStore';
import { loadProjects } from './persistence';
import { useSaveStatus } from './saveStatus';
import { flushPendingWork } from './unloadGuard';

export interface BrowserCacheUsage {
  /** This tool's working copy (`tnv.*`), in UTF-16 characters — what the quota counts. */
  own: number;
  /** Everything else on the same site: the other tools, the Microsoft sign-in, layout settings. */
  other: number;
}

/** Characters stored on this site, split into this tool's cache and the rest. */
export function browserCacheUsage(storage: StorageLike): BrowserCacheUsage {
  const own = new Set(ownedKeys(storage));
  let ownChars = 0;
  let otherChars = 0;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key == null) continue;
    const chars = key.length + (storage.getItem(key) ?? '').length;
    if (own.has(key)) ownChars += chars;
    else otherChars += chars;
  }
  return { own: ownChars, other: otherChars };
}

/** A storage size as a person reads it. Characters are two bytes each. */
export function formatCacheSize(characters: number): string {
  const bytes = characters * 2;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Why clearing now could lose something, or null when it is safe. */
export function browserCacheClearBlocker(): string | null {
  const state = useFolderStore.getState();
  const sharepoint = state.sharepoint.enabled && state.sharepoint.status === 'connected';
  const local = state.handle != null && state.status === 'connected';
  if (!sharepoint && !local) {
    return state.sharepoint.enabled || state.handle
      ? 'SharePoint／本機資料夾目前沒有連上，瀏覽器裡的可能是唯一一份。先重新連上再清空。'
      : '沒有設定 SharePoint 或本機資料夾，瀏覽器裡的就是唯一一份。先設定儲存位置（或匯出專案檔）再清空。';
  }
  if (useSaveStatus.getState().pending || hasUnsyncedProjects()) {
    return '還有修改沒寫入資料夾／SharePoint，等右上角顯示「已儲存」再清空。';
  }
  const files = new Set([
    ...(sharepoint ? Object.keys(state.sharepoint.projectFilenames) : []),
    ...(local ? Object.keys(state.projectFilenames) : []),
  ]);
  const onlyHere = loadProjects()
    .filter((project) => !files.has(project.project_id))
    .map((project) => project.project_name || project.project_id);
  if (onlyHere.length > 0) {
    return `「${onlyHere.slice(0, 3).join('」「')}」${onlyHere.length > 3 ? ` 等 ${onlyHere.length} 個專案` : ''}只在瀏覽器裡，還沒寫進資料夾／SharePoint，先等它寫入（或匯出專案檔）。`;
  }
  return null;
}

/**
 * Removes the working copy and reloads, so the projects are read back from the
 * folder or SharePoint. Returns the reason instead when it is not safe.
 *
 * The build stamp stays: the reload must not be mistaken for a new build,
 * which would put the demo project back in.
 */
export async function clearBrowserCache(storage: StorageLike = localStorage): Promise<string | null> {
  flushPendingWork();
  // The flush starts the folder write; give it the moment it needs to land.
  const deadline = Date.now() + 10_000;
  while (useSaveStatus.getState().pending && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const blocker = browserCacheClearBlocker();
  if (blocker) return blocker;
  for (const key of ownedKeys(storage)) {
    if (key !== BUILD_STAMP_KEY) storage.removeItem(key);
  }
  window.location.reload();
  return null;
}
