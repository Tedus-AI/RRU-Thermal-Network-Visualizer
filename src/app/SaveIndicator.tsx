/**
 * Save light — the header's answer to "did that actually get stored?"
 *
 * With no Save button, the only way to trust the tool is to be able to glance
 * up and see that edits are landing. So this reports the real write pipeline
 * rather than a reassuring animation: pending while an edit is on its way,
 * writing while the file is open, and the time of the last successful write
 * once it is done.
 *
 * The two unhappy states are actionable rather than decorative. A lapsed
 * permission is a button, because one click fixes it; a failed write says so in
 * red, because nothing is reaching disk until it is dealt with.
 */

import { AlertTriangle, Check, FolderSync, Loader2 } from 'lucide-react';

import { useFolderStore } from '@/data/folderStore';
import { useSaveStatus } from '@/data/saveStatus';
import { biTitle } from '@/ui/FieldLabel';

function timeOf(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString();
}

export function SaveIndicator() {
  const status = useFolderStore((s) => s.status);
  const pending = useSaveStatus((s) => s.pending);
  const syncing = useFolderStore((s) => s.syncing);
  const lastSyncAt = useFolderStore((s) => s.lastSyncAt);
  const folderName = useFolderStore((s) => s.folderName);
  const lastError = useFolderStore((s) => s.lastError);
  const reconnect = useFolderStore((s) => s.reconnect);

  // Nothing to report before a workspace exists; the gate covers that case.
  if (status === 'unsupported' || status === 'unbound') return null;

  const base =
    'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-semibold whitespace-nowrap';

  if (status === 'needs_permission') {
    return (
      <button
        type="button"
        onClick={() => void reconnect()}
        className={`${base} border-warn-500/40 bg-warn-500/15 text-warn-500 transition-colors hover:bg-warn-500/25`}
        title={biTitle(
          'The browser needs access to the folder again — click to restore it',
          '瀏覽器需要重新授權存取資料夾，點擊即可恢復；在此之前的變更不會寫入磁碟。',
        )}
      >
        <FolderSync className="size-3.5" aria-hidden />
        Reconnect / 需重新授權
      </button>
    );
  }

  if (status === 'error') {
    return (
      <span
        className={`${base} border-danger-500/40 bg-danger-500/15 text-danger-500`}
        title={biTitle(
          `Could not write to the folder: ${lastError ?? 'unknown error'}`,
          `無法寫入資料夾：${lastError ?? '未知錯誤'}。變更目前只存在於瀏覽器。`,
        )}
      >
        <AlertTriangle className="size-3.5" aria-hidden />
        Not Saved / 未寫入
      </span>
    );
  }

  const busy = pending || syncing;

  return (
    <span
      className={`${base} ${
        busy
          ? // Bright amber: the accent blue sat too close to the dark shell to read.
            'border-warn-400/50 bg-warn-400/15 text-warn-400'
          : 'border-ok-500/30 bg-ok-500/10 text-ok-500'
      }`}
      // aria-live so a screen reader hears the transition to saved, which is
      // the whole reassurance this control exists to give.
      aria-live="polite"
      title={biTitle(
        busy
          ? 'Writing your changes to the project folder'
          : `All changes written to ${folderName ?? 'the project folder'}`,
        busy
          ? '正在將變更寫入專案資料夾。'
          : `所有變更已寫入 ${folderName ?? '專案資料夾'}；不需要手動儲存。`,
      )}
    >
      {busy ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Saving… / 儲存中
        </>
      ) : (
        <>
          <Check className="size-3.5" aria-hidden />
          Saved / 已儲存
          {lastSyncAt && <span className="font-normal opacity-70">{timeOf(lastSyncAt)}</span>}
        </>
      )}
    </span>
  );
}
