/**
 * What each storage target is doing, worded for the engineer.
 *
 * Shared by the header's storage lights, their panel and Settings, so the three
 * never disagree about whether something is saved. One function per target,
 * fed straight from the stores; no state of its own.
 */

import { useShallow } from 'zustand/react/shallow';

import { useFolderStore, type SyncTarget, type TargetState } from '@/data/folderStore';
import { useProjectStore } from '@/data/projectStore';
import { useSaveStatus } from '@/data/saveStatus';
import { sharePoint } from '@/data/sharepoint';

export type LightTone = 'ok' | 'busy' | 'warn' | 'danger' | 'off';

/** What a click on the light does. */
export type LightAction = 'signin' | 'reconnect' | 'panel';

export interface TargetView {
  target: SyncTarget;
  /** "SharePoint" / "Local". */
  label: string;
  zh: string;
  /** Set up on this browser. */
  configured: boolean;
  /** The cache was read from here. */
  isSource: boolean;
  tone: LightTone;
  stateEn: string;
  stateZh: string;
  /** English / Chinese explanation for the tooltip and the panel. */
  explain: [string, string];
  /** "10:09" of the last write this session, when the state is "saved". */
  time: string | null;
  action: LightAction;
  /** Where the files are. */
  where: string;
  /** Projects this target has not received yet. */
  pending: number;
  lastFile: string | null;
  lastSyncAt: string | null;
}

export function shortTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function longTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

interface Common {
  pending: boolean;
  saveError: string | null;
  source: SyncTarget | null;
  pendingCount: Record<SyncTarget, number>;
  remoteChangeHere: boolean;
  remoteBy: string | null;
  remoteAt: string | null;
}

function view(
  target: SyncTarget,
  state: TargetState,
  configured: boolean,
  where: string,
  common: Common,
  extra: { folderSupported?: boolean; offline?: boolean },
): TargetView {
  const sp = target === 'sharepoint';
  const label = sp ? 'SharePoint' : 'Local';
  const zh = sp ? 'SharePoint 線上' : '本機資料夾';
  const pending = common.pendingCount[target];
  const lastFile =
    state.lastSyncedProjectId && Object.hasOwn(state.projectFilenames, state.lastSyncedProjectId)
      ? state.projectFilenames[state.lastSyncedProjectId]
      : null;
  const base = {
    target,
    label,
    zh,
    configured,
    isSource: common.source === target,
    where,
    pending,
    lastFile,
    lastSyncAt: state.lastSyncAt,
    time: null as string | null,
  };
  const waiting =
    pending > 0
      ? [` ${pending} project(s) are waiting to be written there.`, ` 有 ${pending} 個專案等待寫入。`]
      : ['', ''];

  if (!configured) {
    if (!sp && extra.folderSupported === false) {
      return {
        ...base,
        tone: 'off',
        stateEn: 'Not available',
        stateZh: '不支援',
        explain: [
          'This browser cannot open a local folder (Chrome and Edge can). SharePoint works here.',
          '此瀏覽器無法開啟本機資料夾（請用 Chrome 或 Edge）；SharePoint 可正常使用。',
        ],
        action: 'panel',
      };
    }
    return {
      ...base,
      tone: 'off',
      stateEn: 'Not set up',
      stateZh: '未設定',
      explain: sp
        ? [
            'Not connected to SharePoint. Connect it to share projects with the team; every save then goes there too.',
            '尚未連線 SharePoint。連線後專案與團隊共用，每次存檔也會寫入 SharePoint。',
          ]
        : [
            'No local folder. Choose one to keep a copy of every project on this computer, which also opens offline.',
            '尚未設定本機資料夾。設定後每個專案都會在這台電腦保留一份副本，離線也能開啟。',
          ],
      action: 'panel',
    };
  }

  if (state.status === 'needs_permission') {
    return {
      ...base,
      tone: 'warn',
      stateEn: sp ? 'Sign in' : 'Reconnect',
      stateZh: sp ? '需重新登入' : '需重新授權',
      explain: sp
        ? [
            `The Microsoft sign-in expired — click to sign in again.${waiting[0]} Edits are kept${common.source === 'local' ? ' in the local folder' : ' in this browser'} until then.`,
            `Microsoft 登入已過期，點擊即可重新登入。${waiting[1]}在此之前修改會先保留${common.source === 'local' ? '在本機資料夾' : '在瀏覽器'}，登入後補寫。`,
          ]
        : [
            `The browser needs access to the folder again — click to restore it.${waiting[0]}`,
            `瀏覽器需要重新授權存取資料夾，點擊即可恢復。${waiting[1]}`,
          ],
      action: sp ? 'signin' : 'reconnect',
    };
  }

  if (state.status === 'error') {
    const offline = sp && extra.offline;
    return {
      ...base,
      tone: offline ? 'warn' : 'danger',
      stateEn: offline ? 'Offline' : 'Not saved',
      stateZh: offline ? '離線' : '未寫入',
      explain: [
        `${offline ? 'SharePoint cannot be reached; working from the local copy.' : `Could not write to ${sp ? 'SharePoint' : 'the folder'}.`} ${state.lastError ?? ''}${waiting[0]} Click to try again.`,
        `${offline ? '無法連線到 SharePoint，目前使用本機副本。' : `無法寫入${sp ? ' SharePoint' : '資料夾'}。`}${waiting[1]}點擊重試。`,
      ],
      action: sp ? 'signin' : 'reconnect',
    };
  }

  if (common.saveError) {
    return {
      ...base,
      tone: 'danger',
      stateEn: 'Save failed',
      stateZh: '儲存失敗',
      explain: [
        `The last save failed: ${common.saveError}. The edit is kept and retried on the next change.`,
        `最近一次儲存失敗：${common.saveError}。修改仍保留，下次變更時會再嘗試寫入。`,
      ],
      action: 'panel',
    };
  }

  if (state.syncing || common.pending || pending > 0) {
    return {
      ...base,
      tone: 'busy',
      stateEn: 'Saving…',
      stateZh: '寫入中',
      explain: [
        `Writing your latest changes to ${sp ? 'SharePoint' : 'the local folder'}.${waiting[0]}`,
        `正在將最新變更寫入${sp ? ' SharePoint' : '本機資料夾'}。${waiting[1]}`,
      ],
      action: 'panel',
    };
  }

  if (sp && common.remoteChangeHere) {
    return {
      ...base,
      tone: 'warn',
      stateEn: 'Newer online',
      stateZh: '雲端有新版',
      explain: [
        `${common.remoteBy ?? 'Someone'} saved this project on SharePoint${common.remoteAt ? ` at ${longTime(common.remoteAt)}` : ''}. Reload to see it; an edit made now is kept as a separate conflict copy.`,
        `${common.remoteBy ?? '有人'}${common.remoteAt ? `在 ${longTime(common.remoteAt)} ` : ''}更新了 SharePoint 上的這個專案。請重新載入；現在修改的話會另存為衝突副本。`,
      ],
      action: 'panel',
    };
  }

  return {
    ...base,
    tone: 'ok',
    stateEn: 'Saved',
    stateZh: '已儲存',
    time: shortTime(state.lastSyncAt),
    explain: [
      `All changes written to ${sp ? 'SharePoint' : 'the local folder'}${lastFile ? ` (last: ${lastFile})` : ''}.`,
      `所有變更已寫入${sp ? ' SharePoint' : '本機資料夾'}${lastFile ? `（最近：${lastFile}）` : ''}。`,
    ],
    action: 'panel',
  };
}

/** Both targets, as the header and Settings show them. */
export function useStorageView(): { sharepoint: TargetView; local: TargetView } {
  const local = useFolderStore(
    useShallow((s) => ({
      status: s.status,
      syncing: s.syncing,
      lastSyncAt: s.lastSyncAt,
      lastSyncedProjectId: s.lastSyncedProjectId,
      lastError: s.lastError,
      projectFilenames: s.projectFilenames,
    })),
  );
  const handle = useFolderStore((s) => s.handle);
  const folderName = useFolderStore((s) => s.folderName);
  const folderSupported = useFolderStore((s) => s.folderSupported);
  const sp = useFolderStore((s) => s.sharepoint);
  const source = useFolderStore((s) => s.source);
  const pendingCount = useFolderStore((s) => s.pendingCount);
  const remoteChange = useFolderStore((s) => s.remoteChange);
  const pending = useSaveStatus((s) => s.pending);
  const saveError = useSaveStatus((s) => s.error);
  const activeProjectId = useProjectStore((s) => (s.isNew ? null : (s.draft?.project_id ?? null)));

  const common: Common = {
    pending,
    saveError,
    source,
    pendingCount,
    remoteChangeHere: Boolean(remoteChange && remoteChange.projectId === activeProjectId),
    remoteBy: remoteChange?.by ?? null,
    remoteAt: remoteChange?.at ?? null,
  };
  return {
    sharepoint: view('sharepoint', sp, sp.enabled, sharePoint.location(), common, {
      offline: source === 'local' && sp.status === 'error',
    }),
    local: view('local', local, handle != null, folderName ?? '', common, { folderSupported }),
  };
}
