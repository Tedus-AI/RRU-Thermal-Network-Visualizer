/**
 * Storage lights — the header's answer to "did that edit reach SharePoint, and
 * my local folder?"
 *
 * Every save goes to both places, so each gets its own line, in the space the
 * old one-line "Saved to JSON" chip took — the header keeps its height:
 *
 *   ☁ SharePoint   ✓ Saved / 已儲存   10:09
 *   🖴 Local        ✓ Saved / 已儲存   10:09
 *
 * Each line reports its own write pipeline (saving, saved with the time, or
 * what is wrong) and is actionable rather than decorative: an expired sign-in
 * or a lapsed folder permission is fixed by clicking that line (one click,
 * which is also the user gesture the sign-in popup and the permission prompt
 * need). Anything else opens the panel with both places in full.
 */

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Circle,
  Cloud,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Loader2,
  LogIn,
  RefreshCw,
  Settings,
  UserRound,
} from 'lucide-react';

import { useFolderStore, type SyncTarget } from '@/data/folderStore';
import { useSaveStatus } from '@/data/saveStatus';
import { sharePoint } from '@/data/sharepoint';
import { biTitle } from '@/ui/FieldLabel';
import { toast } from '@/ui/toast';
import { longTime, useStorageView, type LightTone, type TargetView } from './storageView';

const TONE_TEXT: Record<LightTone, string> = {
  ok: 'text-ok-500',
  // Bright amber: the accent blue sat too close to the dark shell to read.
  busy: 'text-warn-400',
  warn: 'text-warn-500',
  danger: 'text-danger-500',
  off: 'text-white/40',
};

const TONE_HOVER: Record<LightTone, string> = {
  ok: 'hover:bg-ok-500/10',
  busy: 'hover:bg-warn-400/10',
  warn: 'bg-warn-500/10 hover:bg-warn-500/20',
  danger: 'bg-danger-500/10 hover:bg-danger-500/20',
  off: 'hover:bg-white/5',
};

function StateIcon({ tone, busy }: { tone: LightTone; busy?: boolean }) {
  const cls = 'size-3.5 shrink-0';
  if (busy) return <Loader2 className={`${cls} animate-spin`} aria-hidden />;
  if (tone === 'ok') return <Check className={cls} aria-hidden />;
  if (tone === 'busy') return <Loader2 className={`${cls} animate-spin`} aria-hidden />;
  if (tone === 'off') return <Circle className="size-2.5 shrink-0" aria-hidden />;
  return <AlertTriangle className={cls} aria-hidden />;
}

/** Runs the one-click fix a light offers. Returns whether it worked. */
async function runAction(target: SyncTarget): Promise<boolean> {
  const ok = await useFolderStore.getState().reconnect(target);
  if (!ok) {
    const state = useFolderStore.getState();
    const error = target === 'sharepoint' ? state.sharepoint.lastError : state.lastError;
    toast.error(
      error ??
        (target === 'sharepoint'
          ? 'Not signed in. / 尚未登入 Microsoft。'
          : 'Permission was not granted. / 未取得資料夾權限。'),
    );
  }
  return ok;
}

function Light({
  view,
  working,
  onAction,
  onPanel,
}: {
  view: TargetView;
  working: boolean;
  onAction: () => void;
  onPanel: () => void;
}) {
  const Icon = view.target === 'sharepoint' ? Cloud : HardDrive;
  const fix = view.action !== 'panel';
  return (
    <button
      type="button"
      onClick={fix ? onAction : onPanel}
      disabled={working}
      aria-label={biTitle(`${view.label}: ${view.stateEn}`, `${view.zh}：${view.stateZh}`)}
      title={biTitle(
        `${view.label}${view.isSource ? ' (projects are read from here)' : ''}: ${view.where || '—'}\n${view.stateEn}${view.time ? ` ${view.time}` : ''} — ${view.explain[0]}`,
        `${view.zh}${view.isSource ? '（目前從這裡讀取專案）' : ''}：${view.where || '—'}\n${view.stateZh}${view.time ? ` ${view.time}` : ''} — ${view.explain[1]}`,
      )}
      className={`flex h-[22px] w-full min-w-0 items-center gap-1.5 rounded px-1.5 text-left text-[11px] leading-4 transition-colors disabled:cursor-wait ${TONE_HOVER[view.tone]}`}
    >
      <Icon
        className={`size-3.5 shrink-0 ${view.target === 'sharepoint' ? 'text-accent-500' : 'text-white/60'} ${view.configured ? '' : 'opacity-50'}`}
        aria-hidden
      />
      <span
        className={`w-[3.9rem] shrink-0 font-semibold ${view.configured ? 'text-white/90' : 'text-white/45'}`}
      >
        {view.label}
      </span>
      <span
        className={`flex min-w-0 flex-1 items-center gap-1 font-semibold ${TONE_TEXT[view.tone]}`}
      >
        <StateIcon tone={view.tone} busy={working} />
        {/* Narrow screens keep the English; the Chinese and the time move to
            the tooltip (docs/APP_SHELL_CONTRACT.md, language rule). */}
        <span className="truncate">
          {view.stateEn}
          <span className="hidden min-[1500px]:inline"> / {view.stateZh}</span>
        </span>
      </span>
      {view.time && (
        <span className="hidden shrink-0 font-normal text-ok-500/70 min-[1500px]:inline">
          {view.time}
        </span>
      )}
      {view.pending > 0 && view.tone !== 'busy' && (
        <span
          className="shrink-0 rounded bg-warn-500/20 px-1 text-[10px] font-bold text-warn-400"
          aria-label={biTitle(`${view.pending} waiting`, `${view.pending} 筆待寫入`)}
        >
          {view.pending}
        </span>
      )}
    </button>
  );
}

export function SaveIndicator({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { sharepoint, local } = useStorageView();
  const source = useFolderStore((s) => s.source);
  const cacheFailure = useSaveStatus((s) => s.cacheFailure);

  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState<SyncTarget | null>(null);
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
  if (!source) return null;

  const act = async (target: SyncTarget) => {
    if (working) return;
    setWorking(target);
    try {
      await runAction(target);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div className="flex h-12 w-[13.75rem] items-stretch rounded-md border border-shell-600 bg-shell-900/40 min-[1500px]:w-[17rem]">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-px py-0.5 pl-0.5">
          <Light
            view={sharepoint}
            working={working === 'sharepoint'}
            onAction={() => void act('sharepoint')}
            onPanel={() => setOpen((v) => !v)}
          />
          <Light
            view={local}
            working={working === 'local'}
            onAction={() => void act('local')}
            onPanel={() => setOpen((v) => !v)}
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={biTitle('Storage details', '儲存位置詳細資訊')}
          title={biTitle('Storage details', '儲存位置詳細資訊')}
          className="relative flex w-6 shrink-0 items-center justify-center rounded-r-md border-l border-shell-600 text-white/50 transition-colors hover:bg-shell-700 hover:text-white"
        >
          <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          {cacheFailure && (
            <span
              aria-hidden
              className="absolute top-1 right-1 size-1.5 rounded-full bg-warn-500"
            />
          )}
        </button>
      </div>

      {open && (
        <StoragePanel
          views={[sharepoint, local]}
          cacheFull={Boolean(cacheFailure)}
          onClose={() => setOpen(false)}
          onOpenSettings={onOpenSettings}
          onAction={(target) => void act(target)}
          working={working}
        />
      )}
    </div>
  );
}

const PANEL_TONE: Record<LightTone, string> = {
  ok: 'border-ok-500/30 bg-ok-100/60 text-ok-700',
  busy: 'border-warn-500/30 bg-warn-100/60 text-warn-600',
  warn: 'border-warn-500/40 bg-warn-100/70 text-warn-600',
  danger: 'border-danger-500/40 bg-danger-100/70 text-danger-600',
  off: 'border-line bg-surface-muted text-ink-500',
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
      className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11.5px] font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
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

/** The panel under the lights: both places in full, and what can be done about each. */
function StoragePanel({
  views,
  cacheFull,
  onClose,
  onOpenSettings,
  onAction,
  working,
}: {
  views: TargetView[];
  cacheFull: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  onAction: (target: SyncTarget) => void;
  working: SyncTarget | null;
}) {
  const account = useFolderStore((s) => s.sharepoint.account);
  const folderSupported = useFolderStore((s) => s.folderSupported);
  const remoteChange = views[0].stateEn === 'Newer online';
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const openInSharePoint = async () => {
    const handle = useFolderStore.getState().sharepoint.handle;
    if (!handle) return;
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

  const connectSharePoint = (select: boolean) =>
    run(async () => {
      const ok = await useFolderStore.getState().connectSharePoint({ select });
      if (ok) {
        toast.success(
          select
            ? `Signed in as ${sharePoint.account()?.email ?? ''}. / 已切換 Microsoft 帳號。`
            : 'SharePoint connected — every save now goes there too. / 已連線 SharePoint，之後每次存檔也會寫入。',
        );
        onClose();
      } else {
        const error = useFolderStore.getState().sharepoint.lastError;
        if (error) toast.error(error);
      }
    });

  const chooseFolder = () =>
    run(async () => {
      const ok = await useFolderStore.getState().bind();
      if (ok) {
        toast.success(
          'Local folder set — every save now goes there too. / 已設定本機資料夾，之後每次存檔也會寫入。',
        );
      }
    });

  // A full reload is how the latest SharePoint version is read: the startup
  // path re-reads every project, and writes out anything not yet saved first.
  const reload = () => window.location.reload();

  return (
    <div
      role="dialog"
      aria-label={biTitle('Storage', '儲存位置')}
      className="absolute top-full right-0 z-50 mt-2 flex w-[24rem] flex-col gap-3 rounded-lg border border-line bg-surface p-3.5 text-ink-700 shadow-2xl"
    >
      <p className="text-[11px] leading-relaxed text-ink-500">
        Every save is written to both places that are set up.
        <span className="block text-ink-400">每次存檔都會同時寫入已設定的兩個位置。</span>
      </p>

      {views.map((view) => (
        <section key={view.target} className="flex flex-col gap-1.5 rounded-md border border-line p-2.5">
          <h3 className="flex items-center gap-1.5 text-[12px] font-bold text-ink-900">
            {view.target === 'sharepoint' ? (
              <Cloud className="size-4 text-accent-600" aria-hidden />
            ) : (
              <HardDrive className="size-4 text-ink-400" aria-hidden />
            )}
            {view.target === 'sharepoint' ? 'SharePoint' : 'Local folder'}
            <span className="font-normal text-ink-400">
              / {view.target === 'sharepoint' ? '線上共用' : '本機資料夾'}
            </span>
            {view.isSource && (
              <span
                className="ml-auto rounded bg-accent-100 px-1.5 py-0.5 text-[10px] font-bold text-accent-700"
                title={biTitle('Projects are read from here', '目前從這裡讀取專案')}
              >
                READING / 讀取中
              </span>
            )}
          </h3>
          {view.configured && (
            <p className="font-mono text-[11px] break-all text-ink-900">{view.where || '—'}</p>
          )}
          {view.target === 'sharepoint' && view.configured && (
            <p className="flex items-center gap-1.5 text-[11px] text-ink-700">
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
            </p>
          )}
          <p className={`rounded border px-2 py-1 text-[11px] leading-relaxed ${PANEL_TONE[view.tone]}`}>
            <span className="font-semibold">
              {view.stateEn} / {view.stateZh}
            </span>
            {view.lastSyncAt && (
              <span className="opacity-80">
                {' · '}
                {longTime(view.lastSyncAt)}
              </span>
            )}
            <span className="block">{view.explain[0]}</span>
            <span className="block opacity-80">{view.explain[1]}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {view.target === 'sharepoint' ? (
              view.configured ? (
                <>
                  {view.action !== 'panel' && (
                    <PanelButton
                      primary
                      disabled={working != null}
                      icon={<LogIn className="size-3.5" aria-hidden />}
                      onClick={() => onAction('sharepoint')}
                    >
                      {view.stateEn === 'Sign in' ? 'Sign in / 登入' : 'Retry / 重試'}
                    </PanelButton>
                  )}
                  <PanelButton
                    icon={<ExternalLink className="size-3.5" aria-hidden />}
                    onClick={() => void openInSharePoint()}
                    disabled={view.tone === 'warn' && view.action !== 'panel'}
                    title={biTitle('Open the project folder in SharePoint', '在 SharePoint 開啟專案資料夾')}
                  >
                    Open / 開啟資料夾
                  </PanelButton>
                  <PanelButton
                    icon={
                      busy ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <UserRound className="size-3.5" aria-hidden />
                      )
                    }
                    disabled={busy}
                    onClick={() => void connectSharePoint(true)}
                    title={biTitle('Sign in with another Microsoft account', '改用其他 Microsoft 帳號登入')}
                  >
                    Switch account / 切換帳號
                  </PanelButton>
                </>
              ) : (
                <PanelButton
                  primary
                  disabled={busy}
                  icon={
                    busy ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Cloud className="size-3.5" aria-hidden />
                    )
                  }
                  onClick={() => void connectSharePoint(false)}
                  title={biTitle(
                    'Sign in with the company Microsoft account; the projects here are added to SharePoint, nothing is overwritten',
                    '以公司 Microsoft 帳號登入；這裡的專案會加入 SharePoint，不會覆蓋任何檔案',
                  )}
                >
                  Connect SharePoint / 連線 SharePoint
                </PanelButton>
              )
            ) : view.configured ? (
              <>
                {view.action !== 'panel' && (
                  <PanelButton
                    primary
                    disabled={working != null}
                    icon={<RefreshCw className="size-3.5" aria-hidden />}
                    onClick={() => onAction('local')}
                  >
                    {view.stateEn === 'Reconnect' ? 'Reconnect / 重新授權' : 'Retry / 重試'}
                  </PanelButton>
                )}
                <PanelButton
                  icon={<FolderOpen className="size-3.5" aria-hidden />}
                  disabled={busy}
                  onClick={() => void chooseFolder()}
                >
                  Change folder / 變更資料夾
                </PanelButton>
              </>
            ) : (
              folderSupported && (
                <PanelButton
                  primary
                  disabled={busy}
                  icon={<FolderOpen className="size-3.5" aria-hidden />}
                  onClick={() => void chooseFolder()}
                >
                  Choose folder / 選擇資料夾
                </PanelButton>
              )
            )}
          </div>
        </section>
      ))}

      {cacheFull && (
        <p className="rounded border border-warn-500/40 bg-warn-100/70 px-2 py-1 text-[11px] leading-relaxed text-warn-600">
          Browser storage is full. Edits are held in memory and still written to both places; do
          not close the tab while a write is pending.
          <span className="block opacity-80">
            瀏覽器儲存空間已滿。修改暫存在記憶體並照常寫入；寫入中請勿關閉分頁。
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 border-t border-line pt-2.5">
        <PanelButton
          primary={remoteChange}
          icon={<RefreshCw className="size-3.5" aria-hidden />}
          onClick={reload}
          title={biTitle(
            'Read every project again (edits not yet written are written first)',
            '重新讀取所有專案（未寫入的修改會先寫入）',
          )}
        >
          Reload / 重新載入
        </PanelButton>
        {onOpenSettings && (
          <PanelButton
            icon={<Settings className="size-3.5" aria-hidden />}
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
