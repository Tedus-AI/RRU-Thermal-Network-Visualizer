/**
 * Workspace gate — nothing loads until projects can be read from somewhere.
 *
 * Projects are kept in two places at once: SharePoint (shared with the team,
 * the same site as the Project TIM Manager) and a local folder (a copy on this
 * computer that opens offline). Either one is enough to open the workspace;
 * every save then goes to both.
 *
 * The gate shows each place with the one thing it needs — set it up, sign in
 * again, re-grant the folder permission, or try again — because a sign-in
 * that expired overnight and a folder permission the browser dropped are
 * routine, and only a click can restore either. SharePoint works in every
 * browser; the local folder needs the File System Access API (Chrome / Edge)
 * and says so instead of offering a dead button.
 */

import { useState } from 'react';
import { Cloud, FolderOpen, FolderSync, HardDrive, Loader2, LogIn, MonitorX, RefreshCw } from 'lucide-react';

import { Button } from '@/ui/primitives';
import { useFolderStore } from '@/data/folderStore';
import { sharePoint } from '@/data/sharepoint';

function Spinning({ busy, icon }: { busy: boolean; icon: React.ReactNode }) {
  return busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <>{icon}</>;
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded border border-danger-500/40 bg-danger-100/50 px-2.5 py-1.5 text-[11.5px] break-words text-danger-600"
    >
      {message}
    </p>
  );
}

type Busy = 'sp' | 'sp-select' | 'local' | 'local-pick' | null;

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const source = useFolderStore((s) => s.source);
  const restoring = useFolderStore((s) => s.restoring);
  const hydrated = useFolderStore((s) => s.hydrated);
  const busyMessage = useFolderStore((s) => s.busy);
  const localStatus = useFolderStore((s) => s.status);
  const handle = useFolderStore((s) => s.handle);
  const folderName = useFolderStore((s) => s.folderName);
  const folderSupported = useFolderStore((s) => s.folderSupported);
  const localError = useFolderStore((s) => s.lastError);
  const sp = useFolderStore((s) => s.sharepoint);
  const [busy, setBusy] = useState<Busy>(null);

  // Once the projects are read, the app stays up through an expired sign-in,
  // a lapsed permission or a failed write: the header's storage lights say so
  // and fix it with one click, and nothing typed meanwhile is lost.
  if (hydrated && source) return <>{children}</>;

  const sourceReading =
    source != null &&
    (source === 'sharepoint' ? sp.status === 'connected' : localStatus === 'connected');
  // Say nothing until the remembered choices have been looked up, rather than
  // flashing a "choose" prompt at someone who already has one — and while the
  // projects are being read, say from where.
  if (restoring || busyMessage || sourceReading) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <span className="flex items-center gap-2 text-[13px] text-ink-400">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {busyMessage ??
            (source === 'sharepoint'
              ? 'Opening SharePoint… / 正在開啟 SharePoint…'
              : 'Opening project folder… / 正在開啟專案資料夾…')}
        </span>
      </div>
    );
  }

  const run = async (which: Busy, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(which);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };
  const store = () => useFolderStore.getState();
  const openSharePoint = (select = false) =>
    run(select ? 'sp-select' : 'sp', () =>
      sp.enabled && sp.status === 'needs_permission' && !select
        ? store().reconnect('sharepoint')
        : store().connectSharePoint({ select }),
    );
  const reconnectLocal = () => run('local', () => store().reconnect('local'));
  const chooseFolder = () => run('local-pick', () => store().bind());

  const remembered = sp.enabled || handle != null;

  // SharePoint: what the button says depends on what is wrong.
  const spButton = !sp.enabled
    ? { label: 'Open SharePoint / 開啟 SharePoint', icon: <Cloud className="size-4" aria-hidden /> }
    : sp.status === 'needs_permission'
      ? { label: 'Sign in and continue / 登入並繼續', icon: <LogIn className="size-4" aria-hidden /> }
      : { label: 'Try again / 重試', icon: <RefreshCw className="size-4" aria-hidden /> };

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-canvas p-8">
      <div className="w-full max-w-2xl rounded-lg border border-line bg-surface p-7 shadow-sm">
        <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
          <Cloud className="size-5" aria-hidden />
        </div>
        <h1 className="text-[19px] font-bold text-ink-900">
          {remembered ? 'Continue where you left off' : 'Where are your projects?'}
        </h1>
        <p className="mt-0.5 text-[14px] font-semibold text-ink-500">
          {remembered ? '繼續上次的工作' : '請選擇專案儲存位置'}
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
          Use both: every save goes to SharePoint and to the local folder, and the local copy opens
          when SharePoint cannot be reached. Either one is enough to start.
          <span className="mt-1 block text-ink-400">
            建議兩個都設定：每次存檔會同時寫入 SharePoint 與本機資料夾；SharePoint 連不上時可用本機副本開啟。
            任一個即可開始使用，另一個之後可在右上角的儲存狀態中設定。
          </span>
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <section
            className="flex flex-col gap-2.5 rounded-lg border border-accent-500/40 bg-accent-50 p-4"
            onPointerEnter={() => void sharePoint.preload()}
            onFocus={() => void sharePoint.preload()}
          >
            <h2 className="flex items-center gap-1.5 text-[14px] font-bold text-ink-900">
              <Cloud className="size-4 text-accent-600" aria-hidden />
              SharePoint
              <span className="text-[12px] font-semibold text-ink-500">/ 線上共用</span>
            </h2>
            <p className="text-[12px] leading-relaxed text-ink-500">
              {sp.enabled && sp.status === 'needs_permission' ? (
                <>
                  The Microsoft sign-in has expired
                  {sp.account ? (
                    <>
                      {' '}
                      (<span className="font-semibold text-ink-700">{sp.account.email}</span>)
                    </>
                  ) : null}
                  ; signing in opens a Microsoft window.
                  <span className="mt-1 block text-ink-400">
                    Microsoft 登入已過期，按下按鈕會開啟 Microsoft 登入視窗。
                  </span>
                </>
              ) : (
                <>
                  Sign in with your company Microsoft account. Projects are shared with the team in{' '}
                  <span className="font-mono break-all text-ink-700">{sharePoint.location()}</span>.
                  <span className="mt-1 block text-ink-400">
                    以公司 Microsoft 帳號登入，專案存放在上列 SharePoint 資料夾，與團隊共用；任何瀏覽器皆可使用。
                  </span>
                </>
              )}
            </p>
            {sp.enabled && sp.status === 'error' && <ErrorNote message={sp.lastError} />}
            {!sp.enabled && sp.lastError && <ErrorNote message={sp.lastError} />}
            <div className="mt-auto flex flex-col items-start gap-1.5">
              <Button
                variant="primary"
                disabled={busy != null}
                icon={<Spinning busy={busy === 'sp'} icon={spButton.icon} />}
                onClick={() => void openSharePoint()}
              >
                {spButton.label}
              </Button>
              {sp.account && (
                <button
                  type="button"
                  className="text-[11.5px] text-ink-400 underline-offset-2 hover:underline"
                  disabled={busy != null}
                  onClick={() => void openSharePoint(true)}
                >
                  Use another account / 改用其他帳號
                </button>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface-muted p-4">
            <h2 className="flex items-center gap-1.5 text-[14px] font-bold text-ink-900">
              <HardDrive className="size-4 text-ink-400" aria-hidden />
              Local folder
              <span className="text-[12px] font-semibold text-ink-500">/ 本機資料夾</span>
            </h2>
            {!folderSupported ? (
              <p className="flex gap-2 text-[12px] leading-relaxed text-ink-500">
                <MonitorX className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
                <span>
                  This browser cannot open a local folder (it needs the File System Access API —
                  Chrome or Edge). SharePoint works here.
                  <span className="mt-1 block text-ink-400">
                    此瀏覽器無法開啟本機資料夾（需要 Chrome 或 Edge）；SharePoint 可正常使用。
                  </span>
                </span>
              </p>
            ) : handle && localStatus === 'needs_permission' ? (
              <>
                <p className="text-[12px] leading-relaxed text-ink-500">
                  Your folder{' '}
                  <span className="font-mono font-semibold text-ink-900">{folderName ?? ''}</span> is
                  remembered; the browser only needs access granted again — for security, only a
                  click can do that.
                  <span className="mt-1 block text-ink-400">
                    已記住你的資料夾，只需重新授權；基於安全性，權限只能由使用者點擊恢復。
                  </span>
                </p>
                <ErrorNote message={localError} />
                <div className="mt-auto flex flex-col items-start gap-1.5">
                  <Button
                    variant="secondary"
                    disabled={busy != null}
                    icon={<Spinning busy={busy === 'local'} icon={<FolderSync className="size-4" aria-hidden />} />}
                    onClick={() => void reconnectLocal()}
                  >
                    Reconnect / 重新連結
                  </Button>
                  <button
                    type="button"
                    className="text-[11.5px] text-ink-400 underline-offset-2 hover:underline"
                    disabled={busy != null}
                    onClick={() => void chooseFolder()}
                  >
                    Choose a different folder / 改選其他資料夾
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[12px] leading-relaxed text-ink-500">
                  A copy of every project in a folder on this computer; every project file already in
                  it is listed, and it opens without the network.
                  <span className="mt-1 block text-ink-400">
                    每個專案在這台電腦的資料夾保留一份副本；資料夾內既有的專案檔會全部列出，離線也能開啟。
                  </span>
                </p>
                <ErrorNote message={localError} />
                <div className="mt-auto">
                  <Button
                    variant="secondary"
                    disabled={busy != null}
                    icon={<Spinning busy={busy === 'local-pick'} icon={<FolderOpen className="size-4" aria-hidden />} />}
                    onClick={() => void chooseFolder()}
                  >
                    Choose Folder / 選擇資料夾
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
