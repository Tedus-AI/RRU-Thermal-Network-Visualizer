/**
 * Standard screen frame — part of the App Shell.
 *
 * Every screen 01–12 renders its content through this component so the page
 * title, the optional workflow stepper slot, the right analysis panel and the
 * bottom action bar are laid out identically everywhere.
 *
 * The stepper itself is NOT part of the shell: screens that are wizards pass
 * their own component in (see docs/APP_SHELL_CONTRACT.md).
 */

import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { SCREENS } from './navigation';

export function ScreenWorkspace({
  title,
  titleZh,
  description,
  descriptionZh,
  badge,
  headerAside,
  metrics,
  stepper,
  rightPanel,
  actionBar,
  children,
}: {
  /** English title — shown only when there is no Chinese one. */
  title: string;
  /** Traditional Chinese title — what the page shows (docs/APP_SHELL_CONTRACT.md). */
  titleZh: string;
  description?: string;
  descriptionZh?: string;
  badge?: ReactNode;
  /**
   * A panel beside the title, filling the band the description would occupy.
   *
   * For a screen whose headline IS a verdict — the old 09's thermal status,
   * before it merged into 07: the verdict has to be the first thing read, and
   * putting it in the body pushed it under a row of cards that only make sense
   * once you know it.
   */
  headerAside?: ReactNode;
  /** Readiness KPI row. Sits between the title and the stepper (05 §36). */
  metrics?: ReactNode;
  stepper?: ReactNode;
  rightPanel?: ReactNode;
  actionBar?: ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();
  // The sidebar number goes in front of the title, so the page says where it
  // sits in the workflow without a breadcrumb repeating it.
  const no = SCREENS.find((screen) => location.pathname.endsWith(`/${screen.path}`))?.no;

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-6 pt-5 pb-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:gap-6">
          <div className="min-w-0 xl:flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-[21px] font-bold text-ink-900">
                {no && <span className="tabular mr-2 font-semibold text-ink-400">{no}</span>}
                {titleZh || title}
              </h1>
              {badge}
            </div>
            {(description || descriptionZh) && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
                {descriptionZh || description}
              </p>
            )}
          </div>
          {headerAside && (
            /* Sized by its content up to about half the band. It used to be a
               fixed 46 %, which a one-line panel filled with air and pushed the
               title's own column into matching emptiness. */
            <div className="min-w-0 xl:max-w-[46%] xl:shrink-0">{headerAside}</div>
          )}
        </div>
        {metrics && <div className="mt-3.5">{metrics}</div>}
        {stepper && <div className="mt-4">{stepper}</div>}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4 xl:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">{children}</div>
        {rightPanel && (
          /* As narrow as its rows allow without wrapping: the longest ones
             ("9999 節點 · 9999 段", "下一步：02 匯入硬體元件") measure about
             230 px. It was 22–24 rem, mostly air beside short numbers. */
          <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[15.5rem]">
            {rightPanel}
          </aside>
        )}
      </div>

      {actionBar}
    </div>
  );
}
