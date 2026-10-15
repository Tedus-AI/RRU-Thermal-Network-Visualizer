/**
 * Storage light — the header's answer to "where does my work go, and did that
 * edit actually get there?"
 *
 * Two lines in the space the old one-line "Saved to JSON" chip took, so the
 * header keeps its height:
 *
 *   line 1  where projects live — SharePoint and the Microsoft account, or the
 *           local folder's name;
 *   line 2  the real write pipeline — pending while an edit is on its way,
 *           writing while the file is open, the time of the last successful
 *           write once it is done.
 *
 * The unhappy states are actionable rather than decorative. An expired sign-in
 * or a lapsed folder permission is fixed by clicking the light itself (one
 * click, which is also the user gesture the sign-in popup needs); a failed
 * write says so in red, because nothing is reaching storage until it is dealt
 * with. Everything else — the full location, the account, opening the folder
 * in SharePoint, switching account — is in the panel the light opens.
 */

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Cloud,
  ExternalLink,
  FolderOpen,
  FolderSync,
  HardDrive,
  Loader2,
  LogIn,
  RefreshCw,
  Settings,
  UserRound,
} from 'lucide-react';

import { useFolderStore } from '@/data/folderStore';
import { useSaveStatus } from '@/data/saveStatus';
import { useProjectStore } from '@/data/projectStore';
import { sharePoint } from '@/data/sharepoint';
import { isSharePointDirectory } from '@/data/sharepointFolder';
import { biTitle } from '@/ui/FieldLabel';
import { toast } from '@/ui/toast';

function timeOf(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString();
}

function dateTimeOf(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

type Tone = 'ok' | 'busy' | 'warn' | 'danger';

const TONE_BOX: Record<Tone, string> = {
  ok: 'border-ok-500/30 bg-ok-500/10 hover:bg-ok-500/15',
  // Bright amber: the accent blue sat too close to the dark shell to read.
  busy: 'border-warn-400/50 bg-warn-400/15 hover:bg-warn-400/20',
  warn: 'border-warn-500/50 bg-warn-500/15 hover:bg-warn-500/25',
  danger: 'border-danger-500/50 bg-danger-500/15 hover:bg-danger-500/25',
};

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok-500',
  busy: 'text-warn-400',
  warn: 'text-warn-500',
  danger: 'text-danger-500',
};

export function SaveIndicator({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const status = useFolderStore((s) => s.status);
  const backend = useFolderStore((s) => s.backend);
  const account = useFolderStore((s) => s.account);
  const pending = useSaveStatus((s) => s.pending);
  const saveError = useSaveStatus((s) => s.error);
  const cacheFailure = useSaveStatus((s) => s.cacheFailure);
  const syncing = useFolderStore((s) => s.syncing);
  const lastSyncAt = useFolderStore((s) => s.lastSyncAt);
  const folderName = useFolderStore((s) => s.folderName);
  const lastSyncedProjectId = useFolderStore((s) => s.lastSyncedProjectId);
  const projectFilenames = useFolderStore((s) => s.projectFilenames);
  const lastError = useFolderStore((s) => s.lastError);
  const remoteChangeAny = useFolderStore((s) => s.remoteChange);
  const activeProjectId = useProjectStore((s) => (s.isNew ? null : (s.draft?.project_id ?? null)));
  // Only news about the project on screen is worth a word here.
  const remoteChange =
    remoteChangeAny && remoteChangeAny.projectId === activeProjectId ? remoteChangeAny : null;
  const reconnect = useFolderStore((s) => s.reconnect);

  const [open, setOpen] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Closes on a click elsewhere or Esc, like any menu.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Nothing to report before a workspace exists; the gate covers that case.
  if (status === 'unbound' || !backend) return null;

  const onSharePoint = backend === 'sharepoint';
  const busy = pending || syncing;
  const syncedFilename = lastSyncedProjectId ? projectFilenames[lastSyncedProjectId] : null;
  const where = onSharePoint ? sharePoint.location() : (folderName ?? '');
  const diskTarget = [onSharePoint ? 'SharePoint' : folderName, syncedFilename]
    .filter(Boolean)
    .join(' / ');

  // --- line 2: the most important thing to know right now --------------------
  let tone: Tone;
  let icon: React.ReactNode;
  let stateEn: string;
  let stateZh: string;
  let explain: [string, string];
  if (status === 'needs_permission') {
    tone = 'warn';
    icon = onSharePoint ? (
      <LogIn className="size-3.5 shrink-0" aria-hidden />
    ) : (
      <FolderSync className="size-3.5 shrink-0" aria-hidden />
    );
    stateEn = onSharePoint ? 'Sign in' : 'Reconnect';
    stateZh = onSharePoint ? '需重新登入' : '需重新授權';
    explain = onSharePoint
      ? [
          'The Microsoft sign-in expired — click to sign in again. Edits stay in this browser until then.',
          'Microsoft 登入已過期，點擊即可重新登入；在此之前的修改先保留在瀏覽器，登入後會寫入 SharePoint。',
        ]
      : [
          'The browser needs access to the folder again — click to restore it.',
          '瀏覽器需要重新授權存取資料夾，點擊即可恢復；在此之前的變更不會寫入磁碟。',
        ];
  } else if (status === 'error') {
    tone = 'danger';
    icon = <AlertTriangle className="size-3.5 shrink-0" aria-hidden />;
    stateEn = 'Not saved';
    stateZh = '未寫入';
    explain = [
      `Could not write to ${onSharePoint ? 'SharePoint' : 'the folder'}: ${lastError ?? 'unknown error'}`,
      `無法寫入${onSharePoint ? ' SharePoint' : '資料夾'}：${lastError ?? '未知錯誤'}。變更目前只存在於瀏覽器。`,
    ];
  } else if (saveError) {
    // A save that threw. It used to be swallowed by a timer, leaving "Writing…"
    // up for good; the store keeps the edit and retries on the next change.
    tone = 'danger';
    icon = <AlertTriangle className="size-3.5 shrink-0" aria-hidden />;
    stateEn = 'Save failed';
    stateZh = '儲存失敗';
    explain = [
      `The last save failed: ${saveError}. The edit is kept and will be retried on the next change.`,
      `最近一次儲存失敗：${saveError}。修改仍保留在畫面中，下次變更時會再嘗試寫入。`,
    ];
  } else if (busy) {
    tone = 'busy';
    icon = <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />;
    stateEn = 'Saving…';
    stateZh = '寫入中';
    explain = [
      `Writing your latest changes to ${onSharePoint ? 'SharePoint' : 'the project JSON file'}`,
      `正在將最新變更寫入${onSharePoint ? ' SharePoint' : '專案 JSON 檔案'}。`,
    ];
  } else if (remoteChange) {
    tone = 'warn';
    icon = <RefreshCw className="size-3.5 shrink-0" aria-hidden />;
    stateEn = 'Newer online';
    stateZh = '雲端有新版';
    explain = [
      `${remoteChange.by ?? 'Someone'} saved this project on SharePoint${remoteChange.at ? ` at ${dateTimeOf(remoteChange.at)}` : ''}. Reload to see it; an edit made now is kept as a separate conflict copy.`,
      `${remoteChange.by ?? '有人'}${remoteChange.at ? `在 ${dateTimeOf(remoteChange.at)} ` : ''}更新了 SharePoint 上的這個專案。請重新載入；現在修改的話會另存為衝突副本。`,
    ];
  } else if (cacheFailure) {
    // The browser refused to cache a value. It is held in memory and still
    // written to storage, so this is a caution, not a failure.
    tone = 'warn';
    icon = <AlertTriangle className="size-3.5 shrink-0" aria-hidden />;
    stateEn = 'Cache full';
    stateZh = '快取已滿';
    explain = [
      'Browser storage is full. Your edits are held in memory and still written to storage; do not close the tab while a write is pending.',
      '瀏覽器儲存空間已滿。修改暫存在記憶體並照常寫入；寫入中請勿關閉分頁。',
    ];
  } else {
    tone = 'ok';
    icon = <Check className="size-3.5 shrink-0" aria-hidden />;
    stateEn = 'Saved';
    stateZh = '已儲存';
    explain = [
      `All changes written to ${diskTarget || (onSharePoint ? 'SharePoint' : 'the project JSON file')}`,
      `所有變更已寫入 ${diskTarget || (onSharePoint ? 'SharePoint' : '專案 JSON 檔案')}；重新整理後仍會保留。`,
    ];
  }

  // --- line 1: where -------------------------------------------------------------
  // The ID (the part of the address before @) — what tells colleagues apart,
  // and short enough for the header. The full name and address are in the
  // tooltip and the panel.
  const whoShort = account ? account.email.split('@')[0] || account.name : '';
  const line1Detail = onSharePoint ? whoShort : (folderName ?? '');
  const whereTitle = onSharePoint
    ? biTitle(
        `SharePoint: ${where}${account ? `\nSigned in as ${[account.name, account.email].filter(Boolean).join(' · ')}` : ''}`,
        `SharePoint 線上儲存：${where}${account ? `\n登入帳號：${[account.name, account.email].filter(Boolean).join(' · ')}` : ''}`,
      )
    : biTitle(`Local folder: ${where}`, `本機資料夾：${where}`);

  const oneClickFix = status === 'needs_permission';

  const run = async (action: () => Promise<void>) => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      await action();
    } finally {
      setBusyAction(false);
    }
  };

  const signIn = () =>
    run(async () => {
      const ok = await reconnect();
      if (!ok && useFolderStore.getState().status === 'needs_permission') {
        toast.error(
          onSharePoint
            ? 'Not signed in. / 尚未登入 Microsoft。'
            : 'Permission was not granted. / 未取得資料夾權限。',
        );
      }
    });

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => (oneClickFix ? void signIn() : setOpen((v) => !v))}
        disabled={busyAction}
        aria-expanded={oneClickFix ? undefined : open}
        aria-haspopup={oneClickFix ? undefined : 'dialog'}
        aria-label={biTitle(
          `${onSharePoint ? 'SharePoint' : 'Local folder'} — ${stateEn}`,
          `${onSharePoint ? 'SharePoint' : '本機資料夾'}：${stateZh}`,
        )}
        title={`${whereTitle}\n\n${biTitle(...explain)}`}
        className={`flex h-12 w-[13.5rem] max-w-full min-w-0 flex-col justify-center gap-0.5 rounded-md border px-2.5 text-left transition-colors disabled:cursor-wait ${TONE_BOX[tone]}`}
      >
        <span className="flex w-full min-w-0 items-center gap-1.5 text-[11px] leading-4">
          {onSharePoint ? (
            <Cloud className="size-3.5 shrink-0 text-accent-500" aria-hidden />
          ) : (
            <HardDrive className="size-3.5 shrink-0 text-white/60" aria-hidden />
          )}
          <span className="shrink-0 font-semibold text-white/90">
            {onSharePoint ? 'SharePoint' : 'Local'}
          </span>
          {line1Detail && (
            <span className="min-w-0 truncate text-white/55">· {line1Detail}</span>
          )}
          {!oneClickFix && (
            <ChevronDown
              className={`ml-auto size-3 shrink-0 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          )}
        </span>
        <span
          className={`flex w-full min-w-0 items-center gap-1.5 text-[11.5px] leading-4 font-semibold ${TONE_TEXT[tone]}`}
          // aria-live so a screen reader hears the transition to saved, which
          // is the whole reassurance this control exists to give.
          aria-live="polite"
        >
          {busyAction ? <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden /> : icon}
          <span className="truncate">
            {stateEn} / {stateZh}
          </span>
          {tone === 'ok' && lastSyncAt && (
            <span className="ml-auto shrink-0 font-normal opacity-70">{timeOf(lastSyncAt)}</span>
          )}
        </span>
      </button>

      {open && !oneClickFix && (
        <StoragePanel
          onSharePoint={onSharePoint}
          where={where}
          account={account}
          explain={explain}
          tone={tone}
          lastSyncAt={lastSyncAt}
          syncedFilename={syncedFilename ?? null}
          remoteChanged={Boolean(remoteChange)}
          onClose={() => setOpen(false)}
          onOpenSettings={onOpenSettings}
        />
      )}
    </div>
  );
}

const PANEL_TONE: Record<Tone, string> = {
  ok: 'border-ok-500/30 bg-ok-100/60 text-ok-700',
  busy: 'border-warn-500/30 bg-warn-100/60 text-warn-600',
  warn: 'border-warn-500/40 bg-warn-100/70 text-warn-600',
  danger: 'border-danger-500/40 bg-danger-100/70 text-danger-600',
};

function PanelButton({
  icon,
  children,
  onClick,
  primary,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? 'border-accent-600 bg-accent-600 text-white hover:bg-accent-700'
          : 'border-line-strong bg-surface text-ink-700 hover:bg-surface-muted'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/** The panel under the light: where, who, and what can be done about it. */
function StoragePanel({
  onSharePoint,
  where,
  account,
  explain,
  tone,
  lastSyncAt,
  syncedFilename,
  remoteChanged,
  onClose,
  onOpenSettings,
}: {
  onSharePoint: boolean;
  where: string;
  account: { name: string; email: string } | null;
  explain: [string, string];
  tone: Tone;
  lastSyncAt: string | null;
  syncedFilename: string | null;
  remoteChanged: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}) {
  const [working, setWorking] = useState(false);

  const openInSharePoint = async () => {
    const handle = useFolderStore.getState().handle;
    if (!isSharePointDirectory(handle)) return;
    // Opened first, from the click, so the browser does not block it; the
    // address arrives a moment later.
    const tab = window.open('about:blank', '_blank');
    try {
      const url = await handle.webUrl();
      if (url && tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        tab?.close();
        toast.error(
          'The folder is not on SharePoint yet — it is created with the first project. / SharePoint 上還沒有這個資料夾，建立第一個專案時會自動建立。',
        );
      }
    } catch (error) {
      tab?.close();
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const switchAccount = async () => {
    setWorking(true);
    try {
      const ok = await useFolderStore.getState().connectSharePoint({ select: true });
      if (ok) {
        toast.success(
          `Signed in as ${sharePoint.account()?.email ?? ''}. / 已切換 Microsoft 帳號。`,
        );
        onClose();
      } else {
        const error = useFolderStore.getState().lastError;
        if (error) toast.error(error);
      }
    } finally {
      setWorking(false);
    }
  };

  // A full reload is how the latest SharePoint version is read: the startup
  // path re-reads every project, and writes out anything not yet saved first.
  const reload = () => window.location.reload();

  return (
    <div
      role="dialog"
      aria-label={biTitle('Storage', '儲存位置')}
      className="absolute top-full right-0 z-50 mt-2 w-[22rem] rounded-lg border border-line bg-surface p-3.5 text-ink-700 shadow-2xl"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-ink-900">
        {onSharePoint ? (
          <Cloud className="size-4 text-accent-600" aria-hidden />
        ) : (
          <HardDrive className="size-4 text-ink-400" aria-hidden />
        )}
        {onSharePoint ? 'SharePoint' : 'Local folder'}
        <span className="font-normal text-ink-400">
          / {onSharePoint ? '線上共用儲存' : '本機資料夾'}
        </span>
      </div>

      <dl className="flex flex-col gap-1.5 text-[11.5px]">
        <div>
          <dt className="text-ink-400">Location / 位置</dt>
          <dd className="font-mono break-all text-ink-900">{where || '—'}</dd>
        </div>
        {onSharePoint && (
          <div>
            <dt className="text-ink-400">Account / 帳號</dt>
            <dd className="flex items-center gap-1.5 text-ink-900">
              <UserRound className="size-3.5 shrink-0 text-ink-400" aria-hidden />
              <span className="min-w-0 truncate">
                {account ? (
                  <>
                    {account.name}
                    {account.email && account.name !== account.email && (
                      <span className="text-ink-400"> · {account.email}</span>
                    )}
                  </>
                ) : (
                  'Not signed in / 尚未登入'
                )}
              </span>
            </dd>
          </div>
        )}
        <div>
          <dt className="text-ink-400">Last write / 上次寫入</dt>
          <dd className="text-ink-900">
            {lastSyncAt ? (
              <>
                {timeOf(lastSyncAt)}
                {syncedFilename && (
                  <span className="font-mono text-ink-400"> · {syncedFilename}</span>
                )}
              </>
            ) : (
              <span className="text-ink-400">Nothing written this session / 本次尚未寫入</span>
            )}
          </dd>
        </div>
      </dl>

      <p className={`mt-2.5 rounded border px-2.5 py-1.5 text-[11px] leading-relaxed ${PANEL_TONE[tone]}`}>
        {explain[0]}
        <span className="block opacity-80">{explain[1]}</span>
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {remoteChanged && (
          <PanelButton primary icon={<RefreshCw className="size-3.5" aria-hidden />} onClick={reload}>
            Reload / 重新載入
          </PanelButton>
        )}
        {onSharePoint && (
          <>
            <PanelButton
              icon={<ExternalLink className="size-3.5" aria-hidden />}
              onClick={() => void openInSharePoint()}
              title={biTitle('Open the project folder in SharePoint', '在 SharePoint 開啟專案資料夾')}
            >
              Open / 開啟資料夾
            </PanelButton>
            <PanelButton
              icon={
                working ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <UserRound className="size-3.5" aria-hidden />
                )
              }
              disabled={working}
              onClick={() => void switchAccount()}
              title={biTitle('Sign in with another Microsoft account', '改用其他 Microsoft 帳號登入')}
            >
              Switch account / 切換帳號
            </PanelButton>
          </>
        )}
        {!remoteChanged && onSharePoint && (
          <PanelButton
            icon={<RefreshCw className="size-3.5" aria-hidden />}
            onClick={reload}
            title={biTitle(
              'Read every project again from SharePoint (unsaved edits are written first)',
              '從 SharePoint 重新讀取所有專案（未寫入的修改會先寫入）',
            )}
          >
            Reload / 重新載入
          </PanelButton>
        )}
        {onOpenSettings && (
          <PanelButton
            icon={
              onSharePoint ? (
                <Settings className="size-3.5" aria-hidden />
              ) : (
                <FolderOpen className="size-3.5" aria-hidden />
              )
            }
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
          >
            Storage settings / 儲存設定
          </PanelButton>
        )}
      </div>
    </div>
  );
}
