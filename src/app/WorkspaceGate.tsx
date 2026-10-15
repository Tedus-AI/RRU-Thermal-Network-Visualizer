/**
 * Workspace gate — nothing loads until a storage location is open.
 *
 * Projects live either on SharePoint (shared with the team, the same site as
 * the Project TIM Manager) or in a local folder. Until one is open there is no
 * project list to show and nowhere for a new project to go, so rather than open
 * an empty-looking app that silently discards work, the gate states what it
 * needs.
 *
 * Blocking states, in order of how much the user can do about them:
 *   - a stored choice that needs one click: the Microsoft sign-in expired, or
 *     the browser downgraded the folder permission (routine between sessions;
 *     only a gesture can restore either);
 *   - nothing chosen yet, or opening failed: pick SharePoint or a folder.
 *
 * SharePoint works in every browser; the local folder needs the File System
 * Access API (Chrome / Edge), and says so instead of offering a dead button.
 */

import { useState } from 'react';
import { Cloud, FolderOpen, FolderSync, Loader2, LogIn, MonitorX } from 'lucide-react';

import { Button } from '@/ui/primitives';
import { useFolderStore } from '@/data/folderStore';
import { sharePoint } from '@/data/sharepoint';

function Frame({
  icon: Icon,
  tone,
  title,
  zhTitle,
  children,
  wide,
}: {
  icon: typeof FolderOpen;
  tone: string;
  title: string;
  zhTitle: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-canvas p-8">
      <div
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-lg border border-line bg-surface p-7 shadow-sm`}
      >
        <div className={`mb-4 flex size-11 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="size-5" aria-hidden />
        </div>
        <h1 className="text-[19px] font-bold text-ink-900">{title}</h1>
        <p className="mt-0.5 text-[14px] font-semibold text-ink-500">{zhTitle}</p>
        <div className="mt-4 flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}

function Spinning({ busy, icon }: { busy: boolean; icon: React.ReactNode }) {
  return busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <>{icon}</>;
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded border border-danger-500/40 bg-danger-100/50 px-3 py-2 text-[12px] break-words text-danger-600"
    >
      {message}
    </p>
  );
}

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const status = useFolderStore((s) => s.status);
  const backend = useFolderStore((s) => s.backend);
  const restoring = useFolderStore((s) => s.restoring);
  const hydrated = useFolderStore((s) => s.hydrated);
  const folderName = useFolderStore((s) => s.folderName);
  const folderSupported = useFolderStore((s) => s.folderSupported);
  const account = useFolderStore((s) => s.account);
  const lastError = useFolderStore((s) => s.lastError);
  const uploading = useFolderStore((s) => s.uploading);
  const [busy, setBusy] = useState<'sharepoint' | 'folder' | 'reconnect' | null>(null);

  // Once the projects are read, the app stays up through an expired sign-in,
  // a lapsed permission or a failed write: the header's storage light says so
  // and fixes it with one click, and nothing typed meanwhile is lost (it waits
  // in the cache, marked unsynced).
  if (hydrated && status !== 'unbound') return <>{children}</>;

  const run = async (which: 'sharepoint' | 'folder' | 'reconnect', action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(which);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };
  const openSharePoint = (select = false) =>
    run('sharepoint', () => useFolderStore.getState().connectSharePoint({ select }));
  const chooseFolder = () => run('folder', () => useFolderStore.getState().bind());

  // Say nothing until the remembered choice has been looked up, rather than
  // flashing a "choose" prompt at someone who already has one — and while the
  // projects are being read, say from where.
  if (restoring || (status === 'connected' && !hydrated && !lastError)) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <span className="flex items-center gap-2 text-[13px] text-ink-400">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {uploading
            ? 'Uploading projects to SharePoint… / 正在上傳專案到 SharePoint…'
            : backend === 'sharepoint'
              ? 'Opening SharePoint… / 正在開啟 SharePoint…'
              : 'Opening project folder… / 正在開啟專案資料夾…'}
        </span>
      </div>
    );
  }

  if (status === 'needs_permission' && backend === 'sharepoint') {
    return (
      <Frame
        icon={LogIn}
        tone="bg-warn-100 text-warn-600"
        title="Sign in to Microsoft to continue"
        zhTitle="請重新登入 Microsoft 以繼續使用 SharePoint"
      >
        <p className="text-[13px] leading-relaxed text-ink-500">
          Your projects are on SharePoint{' '}
          <span className="font-mono font-semibold break-all text-ink-900">
            {sharePoint.location()}
          </span>
          {account ? (
            <>
              {' '}
              (last account <span className="font-semibold text-ink-900">{account.email}</span>)
            </>
          ) : null}
          . The Microsoft sign-in has expired; signing in opens a Microsoft window.
          <span className="mt-1 block text-ink-400">
            專案存放在 SharePoint。Microsoft 登入已過期，按下按鈕會開啟 Microsoft 登入視窗。
          </span>
        </p>
        <ErrorNote message={lastError} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            disabled={busy != null}
            icon={<Spinning busy={busy === 'reconnect'} icon={<LogIn className="size-4" aria-hidden />} />}
            onClick={() => void run('reconnect', () => useFolderStore.getState().reconnect())}
          >
            Sign in and continue / 登入並繼續
          </Button>
          <button
            type="button"
            className="text-[12px] text-ink-400 underline-offset-2 hover:underline"
            disabled={busy != null}
            onClick={() => void openSharePoint(true)}
          >
            Use another account / 改用其他帳號
          </button>
        </div>
        {/* Opening a folder reads it like any other: edits this browser still
            holds are written there first (as a recovered copy), never dropped. */}
        {folderSupported && (
          <button
            type="button"
            className="self-start text-[12px] text-ink-400 underline-offset-2 hover:underline"
            disabled={busy != null}
            onClick={() => void chooseFolder()}
          >
            Use a local folder instead / 改用本機資料夾
          </button>
        )}
      </Frame>
    );
  }

  if (status === 'needs_permission') {
    return (
      <Frame
        icon={FolderSync}
        tone="bg-warn-100 text-warn-600"
        title="Reconnect your project folder"
        zhTitle="請重新連結專案資料夾"
      >
        <p className="text-[13px] leading-relaxed text-ink-500">
          Your folder{' '}
          <span className="font-mono font-semibold text-ink-900">{folderName ?? ''}</span> is
          remembered, but the browser needs you to grant access again. This is normal — for
          security, permission can only be restored by a click.
          <span className="mt-1 block text-ink-400">
            已記住你的資料夾，但瀏覽器要求重新授權。這是正常的：基於安全性，
            權限只能由使用者點擊恢復，程式無法自動完成。
          </span>
        </p>
        <div>
          <Button
            variant="primary"
            disabled={busy != null}
            icon={<Spinning busy={busy === 'reconnect'} icon={<FolderSync className="size-4" aria-hidden />} />}
            onClick={() => void run('reconnect', () => useFolderStore.getState().reconnect())}
          >
            Reconnect / 重新連結
          </Button>
        </div>
        <button
          type="button"
          className="self-start text-[12px] text-ink-400 underline-offset-2 hover:underline"
          disabled={busy != null}
          onClick={() => void chooseFolder()}
        >
          Choose a different folder / 改選其他資料夾
        </button>
        <button
          type="button"
          className="self-start text-[12px] text-ink-400 underline-offset-2 hover:underline"
          disabled={busy != null}
          onClick={() => void openSharePoint()}
        >
          Use SharePoint instead / 改用 SharePoint
        </button>
      </Frame>
    );
  }

  // 'unbound', or 'error' / connected-but-not-yet-read: choose where projects live.
  return (
    <Frame
      icon={Cloud}
      tone="bg-accent-100 text-accent-600"
      title="Where are your projects?"
      zhTitle="請選擇專案儲存位置"
      wide
    >
      <p className="text-[13px] leading-relaxed text-ink-500">
        Edits are written automatically as you work — there is no Save step.
        <span className="mt-1 block text-ink-400">編輯會在你操作的同時自動寫入，不需要手動儲存。</span>
      </p>

      <ErrorNote message={lastError} />

      <div className="grid gap-3 sm:grid-cols-2">
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
            Sign in with your company Microsoft account. Projects are shared with the team in{' '}
            <span className="font-mono break-all text-ink-700">{sharePoint.location()}</span>.
            <span className="mt-1 block text-ink-400">
              以公司 Microsoft 帳號登入，專案存放在上列 SharePoint 資料夾，與團隊共用；任何瀏覽器皆可使用。
            </span>
          </p>
          <div className="mt-auto flex flex-col items-start gap-1.5">
            <Button
              variant="primary"
              disabled={busy != null}
              icon={<Spinning busy={busy === 'sharepoint'} icon={<Cloud className="size-4" aria-hidden />} />}
              onClick={() => void openSharePoint()}
            >
              Open SharePoint / 開啟 SharePoint
            </Button>
            {account && (
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
            <FolderOpen className="size-4 text-ink-400" aria-hidden />
            Local folder
            <span className="text-[12px] font-semibold text-ink-500">/ 本機資料夾</span>
          </h2>
          {folderSupported ? (
            <>
              <p className="text-[12px] leading-relaxed text-ink-500">
                Projects are files in a folder on this machine; every project file already in it is
                listed, and an empty folder starts empty.
                <span className="mt-1 block text-ink-400">
                  專案以檔案形式存在本機資料夾；資料夾內既有的專案檔會全部列出，空資料夾就是從空白開始。
                </span>
              </p>
              <div className="mt-auto">
                <Button
                  variant="secondary"
                  disabled={busy != null}
                  icon={<Spinning busy={busy === 'folder'} icon={<FolderOpen className="size-4" aria-hidden />} />}
                  onClick={() => void chooseFolder()}
                >
                  Choose Folder / 選擇資料夾
                </Button>
              </div>
            </>
          ) : (
            <p className="flex gap-2 text-[12px] leading-relaxed text-ink-500">
              <MonitorX className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
              <span>
                This browser cannot open a local folder (it needs the File System Access API — Chrome
                or Edge). SharePoint works here.
                <span className="mt-1 block text-ink-400">
                  此瀏覽器無法開啟本機資料夾（需要 Chrome 或 Edge）；SharePoint 可正常使用。
                </span>
              </span>
            </p>
          )}
        </section>
      </div>
    </Frame>
  );
}
