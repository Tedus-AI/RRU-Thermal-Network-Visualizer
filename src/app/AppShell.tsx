/**
 * Master App Shell — 00 §49.
 * Header + Sidebar + Main workspace + Right panel + Status bar.
 * Screens 01–12 render inside the workspace and must not replace this frame.
 */

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { ToastViewport } from '@/ui/toast';
import { UnsavedChangesModal } from '@/project/modals/UnsavedChangesModal';
import { useShellActions } from './shellActions';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const saveHandler = useShellActions((s) => s.saveHandler);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header onSave={saveHandler ?? undefined} />
      <div className="flex min-h-0 flex-1">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        <main className="min-w-0 flex-1 overflow-hidden bg-canvas">
          <Outlet />
        </main>
      </div>
      <StatusBar />
      <UnsavedChangesModal />
      <ToastViewport />
    </div>
  );
}
