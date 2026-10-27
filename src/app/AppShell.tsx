/**
 * Master App Shell — 00 §49, formalised in docs/APP_SHELL_CONTRACT.md.
 *
 *   AppShell
 *   ├─ TopHeader
 *   ├─ MainSidebar
 *   └─ ScreenWorkspace   (rendered by each screen)
 *
 * Screens 01–12 may not replace, restyle or re-invent any part of this frame.
 *
 * The bottom status bar that 00 §49 lists is deliberately gone, to give the
 * workspace back its height. 00 §13 still holds: solver state, project,
 * scenario and save state all read from the header, so no screen shows numbers
 * without their status. Only the component and node counts were lost, and
 * Screen 01's project progress already carries those.
 *
 * The breadcrumb bar went the same way: the project name is in the header's
 * selector and the screen is in the sidebar and the page title, so the bar was
 * a third copy of both.
 */

import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TopHeader } from './TopHeader';
import { UpdateBanner } from './UpdateBanner';
import { startUpdateCheck } from './updateCheck';
import { MainSidebar } from './MainSidebar';
import { ToastViewport } from '@/ui/toast';
import { ScreenErrorBoundary } from './ErrorBoundary';
import { useProjectStore } from '@/data/projectStore';
import { setSyncProject, startFolderAutoSync, useFolderStore } from '@/data/folderStore';
import { WorkspaceGate } from './WorkspaceGate';
import { startAutoPersist } from '@/data/autoPersist';
import { setPreferredCacheProject } from '@/data/persistence';
import { startUnloadGuard } from '@/data/unloadGuard';
import { describePrune, startComponentDeletionSync } from '@/data/componentDeletion';
import { useComponentStore } from '@/data/componentStore';
import { toast } from '@/ui/toast';
import { Button, Modal } from '@/ui/primitives';
import { projectPath } from './navigation';

/** `/project/<id>/<screen>` → its parts, or null elsewhere. */
function routeProject(pathname: string): { projectId: string; screen: string } | null {
  const match = /^\/project\/([^/]+)\/([^/]+)/.exec(pathname);
  if (!match) return null;
  try {
    return { projectId: decodeURIComponent(match[1]), screen: match[2] };
  } catch {
    return null;
  }
}

/** How often, at most, the open project is compared with SharePoint. */
const REMOTE_CHECK_MS = 30_000;

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;
  const projectId = useProjectStore((s) => s.draft?.project_id ?? null);
  const isNewProject = useProjectStore((s) => s.isNew);

  // Pick up a folder bound in an earlier session, then keep edits flowing to it:
  // stores flush themselves, and the flush reaches the folder.
  useEffect(() => {
    void useFolderStore.getState().restore();
    const stopSync = startFolderAutoSync();
    const stopPersist = startAutoPersist();
    // A tab closed inside the save debounce used to lose the edit.
    const stopGuard = startUnloadGuard();
    // A newer build deployed while this tab was open (the AI-Thermal reminder).
    const stopUpdateCheck = startUpdateCheck();
    // A component deleted in 04 leaves 05 and 06 too, including in a project
    // saved before deletions did that.
    const stopDeletionSync = startComponentDeletionSync(
      () => {
        const { loaded_project_id, components } = useComponentStore.getState();
        return { projectId: loaded_project_id, ids: components.map((component) => component.id) };
      },
      useComponentStore.subscribe,
      (result) => toast.success(describePrune(result)),
    );
    return () => {
      stopSync();
      stopPersist();
      stopGuard();
      stopUpdateCheck();
      stopDeletionSync();
    };
  }, []);

  // A one-off message from the folder sync, such as edits kept as a recovered
  // copy. Shown once, then cleared, so it cannot repeat on every render.
  const folderNotice = useFolderStore((s) => s.notice);
  useEffect(() => {
    if (!folderNotice) return;
    toast.warning(folderNotice);
    useFolderStore.getState().clearNotice();
  }, [folderNotice]);

  // Only a created project can be mirrored — a new one has no file yet.
  useEffect(() => {
    setSyncProject(isNewProject ? null : projectId);
    // When the browser runs out of room, the open project is the one kept there.
    setPreferredCacheProject(projectId);
  }, [projectId, isNewProject]);

  // A save found the open project changed on SharePoint by someone else: this
  // session's version is now a separate project (see folderStore
  // `resolveConflict`). Move onto it in the same tick the store says so —
  // a subscription, not an effect — so nothing can be saved into the original
  // in between. The same screen stays open.
  useEffect(
    () =>
      useFolderStore.subscribe((state, previous) => {
        const conflict = state.conflict;
        if (!conflict || conflict === previous.conflict) return;
        const route = routeProject(locationRef.current);
        if (route?.projectId !== conflict.projectId) return;
        navigate(projectPath(conflict.copyId, route.screen), { replace: true });
      }),
    [navigate],
  );
  const conflict = useFolderStore((s) => s.conflict);

  // SharePoint is shared: when the tab comes back into view (and every few
  // minutes while it is), ask whether someone saved the open project since.
  // The header offers a reload; nothing is replaced under the engineer's hands.
  useEffect(() => {
    let last = 0;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last < REMOTE_CHECK_MS) return;
      const { draft, isNew } = useProjectStore.getState();
      if (!draft || isNew) return;
      last = Date.now();
      void useFolderStore.getState().checkRemote(draft.project_id);
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 4 * REMOTE_CHECK_MS);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
    };
  }, []);

  return (
    <WorkspaceGate>
      <div className="flex h-full flex-col overflow-hidden">
        <UpdateBanner />
        <TopHeader />
        <div className="flex min-h-0 flex-1">
          <MainSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
          <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
            <div className="min-h-0 flex-1">
              {/* A screen crash must never blank the whole app. */}
              <ScreenErrorBoundary resetKey={location.pathname}>
                <Outlet />
              </ScreenErrorBoundary>
            </div>
          </main>
        </div>
        <ToastViewport />
        {conflict && (
          <Modal
            title="已另存為衝突副本"
            width="max-w-lg"
            onClose={() => useFolderStore.getState().clearConflict()}
            footer={
              <>
                <Button
                  onClick={() => {
                    const route = routeProject(locationRef.current);
                    useFolderStore.getState().clearConflict();
                    navigate(projectPath(conflict.projectId, route?.screen ?? 'info'));
                  }}
                >
                  開啟 SharePoint 版本
                </Button>
                <Button
                  variant="primary"
                  onClick={() => useFolderStore.getState().clearConflict()}
                >
                  繼續編輯我的副本
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-2 text-[12.5px] leading-relaxed text-ink-700">
              <p>
                「{conflict.projectName}」在你編輯期間已被
                <span className="font-semibold">{conflict.remoteBy ?? '其他人'}</span>
                {conflict.remoteAt ? `（${new Date(conflict.remoteAt).toLocaleString()}）` : ''}
                存到 SharePoint。沒有資料被覆蓋：你的版本已另存為「
                <span className="font-semibold">{conflict.copyName}</span>
                」並已開啟，原專案顯示 SharePoint 上的版本。
              </p>
              <p className="rounded border border-line bg-surface-muted px-2.5 py-1.5 text-[11.5px] text-ink-500">
                請比對兩個版本、整合需要的內容後，刪除不再需要的那一個。
              </p>
            </div>
          </Modal>
        )}
      </div>
    </WorkspaceGate>
  );
}
