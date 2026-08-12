/**
 * Local delivery — 12 §20, §35, AC-12-22, AC-12-23, AC-12-34.
 *
 * Everything here is local. A blob is built in the page and handed to the
 * browser; nothing is uploaded, and there is no server in the V1 path at all
 * (§35). `Choose Folder` is offered only when the File System Access API is
 * actually present, and any failure — including the user dismissing the picker —
 * falls back to a normal Browser Download rather than losing the file (§20).
 */

export type DeliveryMode = 'browser_download' | 'folder';
export type DeliveryOutcome = 'downloaded' | 'written_to_folder' | 'cancelled';

interface FileSystemWritable {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}
interface FileSystemFileHandleLike {
  createWritable: () => Promise<FileSystemWritable>;
}
interface FileSystemDirectoryHandleLike {
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandleLike>;
  name: string;
}

type PickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandleLike>;
};

/** 12 §20 — the option is shown only when the browser really has the API. */
export function supportsFolderPicker(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandleLike | null> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    return await picker({ mode: 'readwrite' });
  } catch {
    // Dismissing the picker is a normal outcome, not an error.
    return null;
  }
}

/** A plain browser download. The object URL is revoked by the caller (12 §33). */
export function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export interface DeliverInput {
  blob: Blob;
  filename: string;
  mode: DeliveryMode;
  directory?: FileSystemDirectoryHandleLike | null;
}

export interface DeliverResult {
  outcome: DeliveryOutcome;
  /** Kept alive for "Download Again" while the tab lives (12 §33). */
  object_url: string;
  /** Set when a folder write was attempted and did not work out. */
  fallback_reason?: string;
}

export async function deliver(input: DeliverInput): Promise<DeliverResult> {
  const url = URL.createObjectURL(input.blob);

  if (input.mode === 'folder' && input.directory) {
    try {
      const handle = await input.directory.getFileHandle(input.filename, { create: true });
      const writable = await handle.createWritable();
      await writable.write(input.blob);
      await writable.close();
      return { outcome: 'written_to_folder', object_url: url };
    } catch (error) {
      // 12 §20, AC-12-23 — the fallback must ALWAYS be Browser Download. A
      // permission revoked mid-export must not cost the engineer the file.
      triggerDownload(url, input.filename);
      return {
        outcome: 'downloaded',
        object_url: url,
        fallback_reason: error instanceof Error ? error.message : 'Folder write failed',
      };
    }
  }

  triggerDownload(url, input.filename);
  return { outcome: 'downloaded', object_url: url };
}

export function textBlob(text: string, mime: string): Blob {
  return new Blob([text], { type: mime });
}
