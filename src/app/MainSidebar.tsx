/**
 * Left sidebar — part of the Master App Shell (00 §49). Identical on 01–12.
 */

import { useLocation, useParams } from 'react-router-dom';
import { ChevronsLeft } from 'lucide-react';
import { GROUP_ICONS, SCREEN_GROUPS, projectPath } from './navigation';
import { useGuardedNavigate } from './useGuardedNavigate';

export function MainSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useGuardedNavigate();

  return (
    <nav
      aria-label="主要導覽"
      className={`flex shrink-0 flex-col border-r border-shell-line bg-shell-800 transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-72'
      }`}
    >
      <div className="scrollbar-thin flex-1 overflow-y-auto py-3">
        {SCREEN_GROUPS.map((group) => {
          const GroupIcon = GROUP_ICONS[group.label];
          return (
            <div key={group.label} className="mb-1.5">
              <div
                className={`flex items-center gap-2 px-3 py-2 text-[12px] font-bold tracking-wide text-white/55 ${
                  collapsed ? 'justify-center px-0' : ''
                }`}
              >
                {GroupIcon && <GroupIcon size={15} />}
                {!collapsed && (
                  <span>
                    {group.labelEn}
                    <span className="ml-1 font-normal text-white/35">/ {group.label}</span>
                  </span>
                )}
              </div>

              <ul>
                {group.screens.map((screen) => {
                  const to = projectId ? projectPath(projectId, screen.path) : null;
                  const active = to != null && location.pathname === to;
                  const Icon = screen.icon;
                  return (
                    <li key={screen.code}>
                      <button
                        type="button"
                        disabled={!to}
                        title={collapsed ? `${screen.code} ${screen.labelEn} / ${screen.label}` : undefined}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => to && navigate(to)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          collapsed ? 'justify-center px-0' : ''
                        } ${
                          active
                            ? 'bg-accent-600 font-semibold text-white'
                            : 'text-white/75 hover:bg-shell-700 hover:text-white'
                        }`}
                      >
                        <Icon size={16} className="shrink-0" />
                        {!collapsed && (
                          /* English primary, Traditional Chinese beneath — 02 §3. */
                          <span className="min-w-0 flex-1 leading-tight">
                            <span className="block truncate">
                              <span className="tabular mr-1.5 text-white/50">{screen.code}</span>
                              {screen.labelEn}
                            </span>
                            <span className="block truncate text-[11px] text-white/45">
                              {screen.label}
                            </span>
                          </span>
                        )}
                        {!collapsed && !screen.implemented && (
                          <span
                            className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white/40"
                            title={
                              screen.deferred
                                ? 'Deferred until the FloTHERM export schema is validated'
                                : undefined
                            }
                          >
                            {screen.deferred ? 'Deferred' : '待開發'}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? '展開選單' : '收合選單'}
        className="flex items-center justify-center gap-2 border-t border-shell-line py-3 text-[12px] text-white/55 hover:bg-shell-700 hover:text-white"
      >
        <ChevronsLeft size={15} className={collapsed ? 'rotate-180' : ''} />
        {!collapsed && <span>Collapse / 收合選單</span>}
      </button>
    </nav>
  );
}
