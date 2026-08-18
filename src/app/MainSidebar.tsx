/**
 * Left sidebar — part of the Master App Shell (00 §49). Identical on 01–12.
 *
 * The twelve screens belong to four stages, and the nesting has to be legible
 * at a glance. Three things carry it, and they work together:
 *
 *   1. the group heading is a different KIND of text — smaller, upper-case,
 *      letter-spaced, dimmer — so it never reads as another clickable row;
 *   2. its items are indented behind a vertical rail, which is what actually
 *      says "these belong to that";
 *   3. groups are separated by space and a hairline, so the eye finds the
 *      boundaries before it reads any label.
 *
 * Indentation alone was not enough: the previous version gave heading and item
 * the same padding and near-identical icon sizes, so all sixteen rows read as
 * one flat list.
 */

import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronsLeft } from 'lucide-react';
import { GROUP_ICONS, SCREEN_GROUPS, projectPath } from './navigation';

export function MainSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      aria-label="主要導覽"
      className={`flex shrink-0 flex-col border-r border-shell-line bg-shell-800 transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-72'
      }`}
    >
      <div className="scrollbar-thin flex-1 overflow-y-auto py-2">
        {SCREEN_GROUPS.map((group, groupIndex) => {
          const GroupIcon = GROUP_ICONS[group.label];
          const first = groupIndex === 0;

          return (
            <section
              key={group.label}
              aria-label={group.labelEn}
              className={
                collapsed
                  ? first
                    ? 'py-2'
                    : 'border-t border-shell-line/70 py-2'
                  : first
                    ? 'pt-1 pb-3'
                    : 'mt-1 border-t border-shell-line/70 pt-3 pb-3'
              }
            >
              {/* Deliberately not a button: it is a caption, not a destination. */}
              {collapsed ? (
                GroupIcon && (
                  <div className="flex justify-center pb-1" title={group.labelEn}>
                    <GroupIcon size={13} className="text-white/30" />
                  </div>
                )
              ) : (
                <h2 className="flex items-center gap-1.5 px-3 pb-1.5 text-[10.5px] font-bold tracking-[0.09em] text-white/40 uppercase">
                  {GroupIcon && <GroupIcon size={12} className="shrink-0" />}
                  <span className="truncate">
                    {group.labelEn}
                    <span className="ml-1.5 font-medium tracking-normal text-white/25 normal-case">
                      {group.label}
                    </span>
                  </span>
                </h2>
              )}

              {/* The rail is what carries the nesting; the indent alone did not. */}
              <ul className={collapsed ? '' : 'ml-[1.15rem] border-l border-white/10 pl-1.5'}>
                {group.screens.map((screen) => {
                  const to = projectId ? projectPath(projectId, screen.path) : null;
                  const active = to != null && location.pathname === to;
                  const Icon = screen.icon;
                  return (
                    <li key={screen.code} className="relative">
                      {/* A notch on the rail marks where the current screen sits. */}
                      {active && !collapsed && (
                        <span
                          aria-hidden
                          className="absolute top-1/2 -left-[calc(0.375rem+1px)] h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent-500"
                        />
                      )}
                      <button
                        type="button"
                        disabled={!to}
                        title={
                          collapsed ? `${screen.code} ${screen.labelEn} / ${screen.label}` : undefined
                        }
                        aria-current={active ? 'page' : undefined}
                        onClick={() => to && navigate(to)}
                        className={`flex w-full items-center gap-2.5 rounded-md text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          collapsed ? 'justify-center px-0 py-2' : 'mr-2 px-2.5 py-1.5'
                        } ${
                          active
                            ? 'bg-accent-600 font-semibold text-white'
                            : 'text-white/70 hover:bg-shell-700 hover:text-white'
                        }`}
                      >
                        <Icon size={15} className="shrink-0" />
                        {!collapsed && (
                          /* English primary, Traditional Chinese beneath — 02 §3. */
                          <span className="min-w-0 flex-1 leading-tight">
                            <span className="block truncate">
                              <span
                                className={`tabular mr-1.5 ${active ? 'text-white/70' : 'text-white/40'}`}
                              >
                                {screen.code}
                              </span>
                              {screen.labelEn}
                            </span>
                            <span
                              className={`block truncate text-[10.5px] ${
                                active ? 'text-white/70' : 'text-white/40'
                              }`}
                            >
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
            </section>
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
