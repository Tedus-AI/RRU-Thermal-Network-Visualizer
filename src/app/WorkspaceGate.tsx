/**
 * Workspace gate — nothing loads until a folder is open.
 *
 * The folder is where projects live, so until one is connected there is no
 * project list to show and nowhere for a new project to go. Rather than open an
 * empty-looking app that silently discards work, the gate states what it needs.
 *
 * Three blocking states, in order of how much the user can do about them:
 * an unsupported browser (nothing), no folder chosen (pick one), and a folder
 * whose permission lapsed (one click). The last is not a failure — browsers
 * routinely downgrade a stored handle to `prompt` between sessions, and only a
 * gesture can restore it.
 */

import { useState } from 'react';
import { FolderOpen, FolderSync, Loader2, MonitorX } from 'lucide-react';

import { Button } from '@/ui/primitives';
import { useFolderStore } from '@/data/folderStore';

function Frame({
  icon: Icon,
  tone,
  title,
  zhTitle,
  children,
}: {
  icon: typeof FolderOpen;
  tone: string;
  title: string;
  zhTitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-canvas p-8">
      <div className="w-full max-w-lg rounded-lg border border-line bg-surface p-7 shadow-sm">
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

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const status = useFolderStore((s) => s.status);
  const restoring = useFolderStore((s) => s.restoring);
  const hydrated = useFolderStore((s) => s.hydrated);
  const folderName = useFolderStore((s) => s.folderName);
  const lastError = useFolderStore((s) => s.lastError);
  const [busy, setBusy] = useState(false);

  if (status === 'connected' && hydrated) return <>{children}</>;

  // Say nothing until the remembered handle has been looked up, rather than
  // flashing a "choose a folder" prompt at someone who already has one.
  if (restoring) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <span className="flex items-center gap-2 text-[13px] text-ink-400">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Opening project folder… / 正在開啟專案資料夾…
        </span>
      </div>
    );
  }

  if (status === 'unsupported') {
    return (
      <Frame
        icon={MonitorX}
        tone="bg-danger-100 text-danger-600"
        title="This browser cannot open a project folder"
        zhTitle="此瀏覽器無法開啟專案資料夾"
      >
        <p className="text-[13px] leading-relaxed text-ink-500">
          Projects are stored as files in a folder you choose, which needs the File System Access
          API. Chrome and Edge support it; Firefox and Safari do not.
          <span className="mt-1 block text-ink-400">
            專案以檔案形式儲存在你指定的資料夾，需要 File System Access API。 Chrome 與 Edge
            支援，Firefox 與 Safari 不支援。
          </span>
        </p>
        <p className="rounded border border-line bg-surface-muted px-3 py-2 text-[13px] font-semibold text-ink-700">
          Please reopen this tool in Chrome or Edge.
          <span className="block font-normal text-ink-500">請改用 Chrome 或 Edge 開啟本工具。</span>
        </p>
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
            disabled={busy}
            icon={
              busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FolderSync className="size-4" aria-hidden />
              )
            }
            onClick={async () => {
              setBusy(true);
              await useFolderStore.getState().reconnect();
              setBusy(false);
            }}
          >
            Reconnect / 重新連結
          </Button>
        </div>
        <button
          type="button"
          className="self-start text-[12px] text-ink-400 underline-offset-2 hover:underline"
          onClick={async () => {
            setBusy(true);
            await useFolderStore.getState().bind();
            setBusy(false);
          }}
        >
          Choose a different folder / 改選其他資料夾
        </button>
      </Frame>
    );
  }

  // 'unbound', or 'error' / connected-but-not-yet-read: all need a folder chosen.
  return (
    <Frame
      icon={FolderOpen}
      tone="bg-accent-100 text-accent-600"
      title="Choose your project folder"
      zhTitle="請選擇專案資料夾"
    >
      <p className="text-[13px] leading-relaxed text-ink-500">
        Projects are stored as files in a folder on this machine. Every project file already in the
        folder is listed; an empty folder simply starts empty.
        <span className="mt-1 block text-ink-400">
          專案以檔案形式儲存在本機資料夾中。資料夾內既有的專案檔會全部列出；
          空資料夾就是從空白開始。
        </span>
      </p>
      <p className="text-[13px] leading-relaxed text-ink-500">
        Edits are written to disk automatically as you work — there is no Save step.
        <span className="mt-1 block text-ink-400">
          編輯會在你操作的同時自動寫入磁碟，不需要手動儲存。
        </span>
      </p>
      {lastError && (
        <p className="rounded border border-danger-500/40 bg-danger-100/50 px-3 py-2 text-[12px] text-danger-600">
          {lastError}
        </p>
      )}
      <div>
        <Button
          variant="primary"
          disabled={busy}
          icon={
            busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <FolderOpen className="size-4" aria-hidden />
            )
          }
          onClick={async () => {
            setBusy(true);
            await useFolderStore.getState().bind();
            setBusy(false);
          }}
        >
          Choose Folder / 選擇資料夾
        </Button>
      </div>
    </Frame>
  );
}
