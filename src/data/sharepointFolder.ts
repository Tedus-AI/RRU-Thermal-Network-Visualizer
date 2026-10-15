/**
 * The SharePoint project folder, as a `DirectoryHandle`.
 *
 * `folderStore`, `workspace` and the component library already know how to
 * keep projects in a folder: list it, read each file, write one file per
 * project after every save, rescue edits that never arrived. Implementing the
 * same handle over Microsoft Graph lets all of that run unchanged against
 * `RRU_Thermal_Network/Database` on SharePoint, instead of growing a second
 * save pipeline beside the first.
 *
 * What SharePoint adds is other people. Every write is conditional:
 *
 *   - a file this session has seen is written with If-Match: <its eTag>;
 *   - a file it has never seen is created with conflictBehavior=fail.
 *
 * So a save can never overwrite someone else's: it fails with `conflict`, and
 * `folderStore` keeps that version as a separate project (and the library
 * merges). The eTag is taken from the metadata BEFORE the content, so the one
 * held can only be older than the text, never newer — the worst case is one
 * conflict too many, never one too few.
 *
 * SharePoint may answer with the copy from before our own write for a short
 * while (the TIM Manager saw this in production). Metadata older than what our
 * own write returned is therefore ignored for a minute after it.
 */

import type { DirectoryHandle, FileHandle, PermissionState } from './folderBinding';
import {
  SHAREPOINT_CONFIG,
  SharePointError,
  drivePath,
  graph,
  itemByPath,
  resolveSite,
  sharePoint,
} from './sharepoint';

/** How long SharePoint may serve the pre-write copy of a file. */
const STALE_MS = 60_000;
/** Right after our own write, our record is the file — no need to ask again. */
const RECENT_MS = 10_000;

const SELECT = 'id,name,size,eTag,lastModifiedDateTime,lastModifiedBy,file,webUrl';

interface DriveItem {
  id: string;
  name: string;
  size?: number;
  eTag?: string;
  lastModifiedDateTime?: string;
  lastModifiedBy?: { user?: { displayName?: string; email?: string } };
  file?: unknown;
  webUrl?: string;
}

export interface RemoteFileMeta {
  id: string;
  etag: string | null;
  size: number;
  /** Epoch ms. */
  modified: number;
  modifiedBy: string | null;
  webUrl: string | null;
}

interface Known extends RemoteFileMeta {
  /** The content that goes with `etag`, once read or written. */
  text?: string;
  /** When this session last wrote the file. */
  wroteAt?: number;
}

function metaOf(item: DriveItem): RemoteFileMeta {
  const modified = Date.parse(item.lastModifiedDateTime ?? '');
  return {
    id: item.id,
    etag: item.eTag ?? null,
    size: typeof item.size === 'number' ? item.size : 0,
    modified: Number.isFinite(modified) ? modified : 0,
    modifiedBy: item.lastModifiedBy?.user?.displayName || item.lastModifiedBy?.user?.email || null,
    webUrl: item.webUrl ?? null,
  };
}

function notFound(name: string): SharePointError {
  return new SharePointError(`${name} is not on SharePoint / SharePoint 上沒有 ${name}`, {
    status: 404,
  });
}

export class SharePointDirectory implements DirectoryHandle {
  readonly kind = 'directory' as const;
  /** Shown wherever the local folder's name would be. */
  readonly name = 'SharePoint';
  readonly folder: string;

  private readonly known = new Map<string, Known>();
  /** Text of a write whose outcome is unknown (timed out / 5xx), by file. */
  private readonly uncertain = new Map<string, string>();

  constructor(folder: string = SHAREPOINT_CONFIG.dataFolder) {
    this.folder = folder;
  }

  private pathOf(name: string): string {
    return `${this.folder}/${name}`;
  }

  /** Records what SharePoint said, unless it is the stale pre-write copy. */
  private remember(name: string, incoming: RemoteFileMeta): Known {
    const current = this.known.get(name);
    if (
      current?.wroteAt != null &&
      Date.now() - current.wroteAt < STALE_MS &&
      incoming.modified < current.modified
    ) {
      return current;
    }
    const next: Known = {
      ...incoming,
      text: current && current.etag != null && current.etag === incoming.etag ? current.text : undefined,
      wroteAt: current?.wroteAt,
    };
    this.known.set(name, next);
    return next;
  }

  /** Metadata straight from SharePoint; null when the file does not exist. */
  private async fetchMeta(name: string, interactive = false): Promise<Known | null> {
    await resolveSite(interactive);
    const res = await graph(`${itemByPath(this.pathOf(name))}?$select=${SELECT}`, {
      interactive,
      ok: (status) => status === 404,
    });
    if (res.status === 404) {
      this.known.delete(name);
      return null;
    }
    return this.remember(name, metaOf((await res.json()) as DriveItem));
  }

  // --- DirectoryHandle ---------------------------------------------------------

  async *values(): AsyncIterableIterator<FileHandle> {
    for (const name of await this.list()) yield this.fileHandle(name);
  }

  /** File names in the folder. A folder that does not exist yet is empty. */
  async list(): Promise<string[]> {
    await resolveSite(false);
    const names: string[] = [];
    let url: string | null = `${itemByPath(this.folder)}:/children?$select=${SELECT}&$top=200`;
    while (url) {
      const res: Response = await graph(url, { ok: (status) => status === 404 });
      if (res.status === 404) return [];
      const page = (await res.json()) as { value?: DriveItem[]; '@odata.nextLink'?: string };
      for (const item of page.value ?? []) {
        if (!item.file) continue;
        this.remember(item.name, metaOf(item));
        names.push(item.name);
      }
      url = page['@odata.nextLink'] ?? null;
    }
    return names;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle> {
    if (options?.create) return this.fileHandle(name);
    const current = this.known.get(name);
    const justWritten = current?.wroteAt != null && Date.now() - current.wroteAt < RECENT_MS;
    if (!justWritten && !(await this.fetchMeta(name))) throw notFound(name);
    return this.fileHandle(name);
  }

  async removeEntry(name: string): Promise<void> {
    await resolveSite(false);
    await graph(itemByPath(this.pathOf(name)), {
      method: 'DELETE',
      ok: (status) => status === 404,
    });
    this.known.delete(name);
    this.uncertain.delete(name);
  }

  /** Granted while a token can be had without a popup. */
  async queryPermission(): Promise<PermissionState> {
    return (await sharePoint.canUseSilently()) ? 'granted' : 'prompt';
  }

  /** Signs in again (popup) — from a click only. */
  async requestPermission(): Promise<PermissionState> {
    const result = await sharePoint.signIn();
    return result.ok ? 'granted' : 'denied';
  }

  // --- files ---------------------------------------------------------------------

  private fileHandle(name: string): FileHandle {
    return {
      name,
      kind: 'file',
      getFile: async () => {
        const meta = this.known.get(name);
        if (!meta) throw notFound(name);
        return {
          lastModified: meta.modified,
          size: meta.size,
          text: () => this.readText(name),
        };
      },
      createWritable: async () => {
        let buffer = '';
        return {
          write: async (data: string | Blob) => {
            buffer += typeof data === 'string' ? data : await data.text();
          },
          close: () => this.put(name, buffer),
        };
      },
    };
  }

  private async readText(name: string): Promise<string> {
    const meta = this.known.get(name);
    if (!meta) throw notFound(name);
    if (meta.text != null) return meta.text;
    await resolveSite(false);
    const res = await graph(`${drivePath()}/items/${meta.id}/content`, {
      ok: (status) => status === 404,
    });
    if (res.status === 404) {
      this.known.delete(name);
      throw notFound(name);
    }
    const text = await res.text();
    if (!text.trim() && meta.size > 0) {
      throw new SharePointError(
        `SharePoint returned empty content for ${name} (${meta.size} bytes on the server); stopped so nothing is overwritten / SharePoint 回傳空白內容，為避免覆蓋資料已暫停，請稍後再試`,
      );
    }
    if (this.known.get(name) === meta) meta.text = text;
    return text;
  }

  /** The conditional write described at the top of the file. */
  private async put(name: string, text: string, retried = false): Promise<void> {
    await resolveSite(false);
    const meta = this.known.get(name);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let url: string;
    if (meta) {
      url = `${drivePath()}/items/${meta.id}/content`;
      if (meta.etag) headers['If-Match'] = meta.etag;
    } else {
      url = `${itemByPath(this.pathOf(name))}:/content?@microsoft.graph.conflictBehavior=fail`;
    }

    let res: Response;
    try {
      res = await graph(url, {
        method: 'PUT',
        body: text,
        headers,
        // A file deleted on SharePoint since it was read: written again below.
        ok: (status) => status === 404 && Boolean(meta),
      });
    } catch (error) {
      if (error instanceof SharePointError) {
        if (error.uncertain) this.uncertain.set(name, text);
        // On a conflict the record is kept: it is the version this session
        // started from, which `readRemote` hands back as `base`.
        error.message = `${name}: ${error.message}`;
      }
      throw error;
    }
    if (res.status === 404) {
      this.known.delete(name);
      if (retried) throw notFound(name);
      return this.put(name, text, true);
    }

    let item: DriveItem | null = null;
    try {
      item = (await res.json()) as DriveItem;
    } catch {
      // No body.
    }
    this.uncertain.delete(name);
    if (item?.id) {
      this.known.set(name, { ...metaOf(item), text, wroteAt: Date.now() });
      if (!item.eTag) await this.fetchMeta(name).catch(() => null);
    } else {
      // Without the new eTag a later write could not be made conditional.
      this.known.delete(name);
      await this.fetchMeta(name).catch(() => null);
    }
  }

  // --- for conflict handling ----------------------------------------------------

  /**
   * The file as SharePoint has it now, ignoring anything remembered — with
   * `base`, the text this session last read or wrote (null if it never had
   * one), so a caller can tell a real change from a re-save.
   */
  async readRemote(
    name: string,
  ): Promise<{ text: string; meta: RemoteFileMeta; base: string | null } | null> {
    const base = this.known.get(name)?.text ?? null;
    const remote = await this.fetchRemote(name);
    if (remote) this.adopt(name, remote.meta, remote.text);
    else this.known.delete(name);
    return remote ? { ...remote, base } : null;
  }

  /** Current metadata from SharePoint, without touching what this session holds. */
  private async freshMeta(name: string): Promise<RemoteFileMeta | null> {
    await resolveSite(false);
    const res = await graph(`${itemByPath(this.pathOf(name))}?$select=${SELECT}`, {
      ok: (status) => status === 404,
    });
    if (res.status === 404) return null;
    return metaOf((await res.json()) as DriveItem);
  }

  /**
   * SharePoint's current metadata, WITHOUT updating what this session holds:
   * the next write must still be checked against the version it read.
   */
  async peek(name: string): Promise<RemoteFileMeta | null> {
    const meta = await this.freshMeta(name);
    if (!meta) return null;
    const current = this.known.get(name);
    // The pre-write copy SharePoint may still serve is not a change.
    if (
      current?.wroteAt != null &&
      Date.now() - current.wroteAt < STALE_MS &&
      meta.modified < current.modified
    ) {
      return this.cached(name);
    }
    return meta;
  }

  /**
   * The file as SharePoint has it now — metadata first, then content — and
   * nothing remembered. The caller decides whether to `adopt` it: taking the
   * eTag without taking the content into the cache would let the next write
   * replace that content unseen.
   */
  async fetchRemote(name: string): Promise<{ text: string; meta: RemoteFileMeta } | null> {
    const meta = await this.freshMeta(name);
    if (!meta) return null;
    const res = await graph(`${drivePath()}/items/${meta.id}/content`, {
      ok: (status) => status === 404,
    });
    if (res.status === 404) return null;
    const text = await res.text();
    if (!text.trim() && meta.size > 0) {
      throw new SharePointError(
        `SharePoint returned empty content for ${name}; stopped so nothing is overwritten / SharePoint 回傳空白內容，為避免覆蓋資料已暫停`,
      );
    }
    return { text, meta };
  }

  /** Records `text` as this session's version of the file, so writes are checked against it. */
  adopt(name: string, meta: RemoteFileMeta, text: string): void {
    this.known.set(name, { ...meta, text });
  }

  /** True when `text` is exactly what a write of ours that timed out was sending. */
  wasOurUncertainWrite(name: string, text: string): boolean {
    return this.uncertain.get(name) === text;
  }

  /** The file's text as this session last read or wrote it, or null. */
  cachedText(name: string): string | null {
    return this.known.get(name)?.text ?? null;
  }

  /** What is known about a file without asking SharePoint. */
  cached(name: string): RemoteFileMeta | null {
    const meta = this.known.get(name);
    return meta
      ? {
          id: meta.id,
          etag: meta.etag,
          size: meta.size,
          modified: meta.modified,
          modifiedBy: meta.modifiedBy,
          webUrl: meta.webUrl,
        }
      : null;
  }

  /** Link that opens the folder (or one file) in SharePoint. */
  async webUrl(name?: string): Promise<string | null> {
    await resolveSite(true);
    const res = await graph(
      `${itemByPath(name ? this.pathOf(name) : this.folder)}?$select=webUrl`,
      { interactive: true, ok: (status) => status === 404 },
    );
    if (res.status === 404) return null;
    return ((await res.json()) as { webUrl?: string }).webUrl ?? null;
  }
}

export function isSharePointDirectory(handle: unknown): handle is SharePointDirectory {
  return handle instanceof SharePointDirectory;
}
