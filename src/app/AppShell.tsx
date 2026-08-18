/**
 * Master App Shell — 00 §49, formalised in docs/APP_SHELL_CONTRACT.md.
 *
 *   AppShell
 *   ├─ TopHeader
 *   ├─ MainSidebar
 *   ├─ BreadcrumbBar
 *   └─ ScreenWorkspace   (rendered by each screen)
 *
 * Screens 01–12 may not replace, restyle or re-invent any part of this frame.
 *
 * The bottom status bar that 00 §49 lists is deliberately gone, to give the
 * workspace back its height. 00 §13 still holds: solver state, project,
 * scenario and save state all read from the header, so no screen shows numbers
 * without their status. Only the component and node counts were lost, and
 * Screen 01's Project Overview already carries those.
 */

import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TopHeader } from './TopHeader';
import { MainSidebar } from './MainSidebar';
import { BreadcrumbBar } from './BreadcrumbBar';
import { ToastViewport } from '@/ui/toast';
import { ScreenErrorBoundary } from './ErrorBoundary';
import { useProjectStore } from '@/data/projectStore';
import { setSyncProject, startFolderAutoSync, useFolderStore } from '@/data/folderStore';
import { WorkspaceGate } from './WorkspaceGate';
import { startAutoPersist } from '@/data/autoPersist';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const projectId = useProjectStore((s) => s.draft?.project_id ?? null);
  const isNewProject = useProjectStore((s) => s.isNew);

  // Pick up a folder bound in an earlier session, then keep edits flowing to it:
  // stores flush themselves, and the flush reaches the folder.
  useEffect(() => {
    void useFolderStore.getState().restore();
    const stopSync = startFolderAutoSync();
    const stopPersist = startAutoPersist();
    return () => {
      stopSync();
      stopPersist();
    };
  }, []);

  // Only a created project can be mirrored — a new one has no file yet.
  useEffect(() => {
    setSyncProject(isNewProject ? null : projectId);
  }, [projectId, isNewProject]);

  return (
    <WorkspaceGate>
      <div className="flex h-full flex-col overflow-hidden">
        <TopHeader />
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
        <ToastViewport />
      </div>
    </WorkspaceGate>
  );
}
