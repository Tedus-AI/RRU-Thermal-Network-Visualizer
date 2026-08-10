/**
 * Breadcrumb bar — part of the App Shell.
 *
 * Adopted from the 02 mockup. Derived from the route, so no screen has to render
 * or configure it (see docs/APP_SHELL_CONTRACT.md).
 */

import { ChevronRight, Home } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import { SCREENS, projectPath } from './navigation';
import { useProjectStore } from '@/data/projectStore';
import { useGuardedNavigate } from './useGuardedNavigate';

export function BreadcrumbBar() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useGuardedNavigate();
  const projectName = useProjectStore((s) => s.draft?.project_name);

  const screen = SCREENS.find((item) => location.pathname.endsWith(`/${item.path}`));
  if (!projectId) return null;

  const crumbs = [
    { label: 'Home', zh: '首頁', onClick: () => navigate('/') },
    {
      label: projectName || projectId,
      zh: null as string | null,
      onClick: () => navigate(projectPath(projectId, 'info')),
    },
  ];

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex h-10 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-6 text-[12px]"
    >
      <Home size={14} className="text-ink-400" aria-hidden />
      {crumbs.map((crumb) => (
        <span key={crumb.label} className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={crumb.onClick}
            className="text-ink-500 hover:text-accent-600 hover:underline"
          >
            {crumb.label}
            {crumb.zh && <span className="ml-1 text-ink-400">/ {crumb.zh}</span>}
          </button>
          <ChevronRight size={13} className="text-ink-400" aria-hidden />
        </span>
      ))}
      <span aria-current="page" className="font-semibold text-ink-900">
        {screen ? `${screen.code} ${screen.labelEn}` : 'Overview'}
        {screen && <span className="ml-1 font-normal text-ink-500">/ {screen.label}</span>}
      </span>
    </nav>
  );
}
