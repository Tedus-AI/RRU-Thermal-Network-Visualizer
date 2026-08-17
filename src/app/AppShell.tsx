/**
 * Master App Shell — 00 §49, formalised in docs/APP_SHELL_CONTRACT.md.
 *
 *   AppShell
 *   ├─ TopHeader
 *   ├─ MainSidebar
 *   ├─ BreadcrumbBar
 *   ├─ ScreenWorkspace   (rendered by each screen)
 *   └─ BottomStatusBar
 *
 * Screens 01–12 may not replace, restyle or re-invent any part of this frame.
 */

import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TopHeader } from './TopHeader';
import { MainSidebar } from './MainSidebar';
import { BottomStatusBar } from './BottomStatusBar';
import { BreadcrumbBar } from './BreadcrumbBar';
import { ToastViewport } from '@/ui/toast';
import { UnsavedChangesModal } from '@/project/modals/UnsavedChangesModal';
import { useShellActions } from './shellActions';
import { ScreenErrorBoundary } from './ErrorBoundary';
import { useProjectStore } from '@/data/projectStore';
import { setSyncProject, startFolderAutoSync, useFolderStore } from '@/data/folderStore';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const saveHandler = useShellActions((s) => s.saveHandler);
  const location = useLocation();
  const projectId = useProjectStore((s) => s.draft?.project_id ?? null);
  const isNewProject = useProjectStore((s) => s.isNew);

  // Pick up a folder bound in an earlier session, and start mirroring saves.
  useEffect(() => {
    void useFolderStore.getState().restore();
    return startFolderAutoSync();
  }, []);

  // Only a saved project can be mirrored — an unsaved one is not on disk to read.
  useEffect(() => {
    setSyncProject(isNewProject ? null : projectId);
  }, [projectId, isNewProject]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopHeader onSave={saveHandler ?? undefined} />
      <div className="flex min-h-0 flex-1">
        <MainSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
          <BreadcrumbBar />
          <div className="min-h-0 flex-1">
            {/* A screen crash must never blank the whole app. */}
            <ScreenErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </ScreenErrorBoundary>
          </div>
        </main>
      </div>
      <BottomStatusBar />
      <UnsavedChangesModal />
      <ToastViewport />
    </div>
  );
}
