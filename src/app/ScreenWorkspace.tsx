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

export function ScreenWorkspace({
  title,
  titleZh,
  description,
  descriptionZh,
  badge,
  metrics,
  stepper,
  rightPanel,
  actionBar,
  children,
}: {
  /** English title — always primary (02 §3). */
  title: string;
  /** Traditional Chinese title, shown beside it when there is room. */
  titleZh: string;
  description?: string;
  descriptionZh?: string;
  badge?: ReactNode;
  /** Readiness KPI row. Sits between the title and the stepper (05 §36). */
  metrics?: ReactNode;
  stepper?: ReactNode;
  rightPanel?: ReactNode;
  actionBar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-6 pt-5 pb-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[21px] font-bold text-ink-900">
            {title}
            <span className="ml-2 font-semibold text-ink-500">/ {titleZh}</span>
          </h1>
          {badge}
        </div>
        {(description || descriptionZh) && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
            {description}
            {descriptionZh && (
              <span className={description ? 'block text-ink-400' : 'text-ink-400'}>
                {descriptionZh}
              </span>
            )}
          </p>
        )}
        {metrics && <div className="mt-3.5">{metrics}</div>}
        {stepper && <div className="mt-4">{stepper}</div>}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4 xl:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">{children}</div>
        {rightPanel && (
          <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[22rem] 2xl:w-[24rem]">
            {rightPanel}
          </aside>
        )}
      </div>

      {actionBar}
    </div>
  );
}
