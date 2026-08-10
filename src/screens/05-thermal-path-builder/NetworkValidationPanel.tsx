/**
 * Step 5 — Validation (05 §33, §34, §35).
 *
 * ERROR blocks Continue; WARNING and INFO do not. A coupling cycle is legal
 * physics and never appears here as an error (05 §34).
 */

import { AlertTriangle, CircleAlert, Info } from 'lucide-react';

import type { GraphIssue, GraphValidationResult } from '@/thermal/graph/graphValidation';

const ICONS = {
  error: <CircleAlert size={13} className="shrink-0 text-danger-600" />,
  warning: <AlertTriangle size={13} className="shrink-0 text-warn-600" />,
  info: <Info size={13} className="shrink-0 text-accent-600" />,
};

const ROW_STYLES = {
  error: 'border-danger-500/40 bg-danger-100',
  warning: 'border-warn-500/40 bg-warn-100',
  info: 'border-line bg-surface-muted',
};

export function NetworkValidationPanel({
  validation,
  onFocus,
}: {
  validation: GraphValidationResult | null;
  onFocus: (issue: GraphIssue) => void;
}) {
  if (!validation) return null;

  const total = validation.issues.length;

  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <h3 className="text-[13px] font-bold text-ink-700">Validation / 驗證提示</h3>
        <span className="ml-auto rounded bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-500">
          {total} issue{total === 1 ? '' : 's'}
        </span>
      </header>

      <div className="max-h-56 overflow-auto p-2.5">
        {total === 0 && (
          <p className="py-4 text-center text-[12px] text-ok-600">
            No issues found. The topology is ready for Screen 06. / 未發現問題，可進入邊界條件設定。
          </p>
        )}

        <ul className="flex flex-col gap-1.5">
          {validation.issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? index}`}>
              <button
                type="button"
                onClick={() => onFocus(issue)}
                className={`flex w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left ${ROW_STYLES[issue.severity]}`}
              >
                {ICONS[issue.severity]}
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold text-ink-900">
                    {issue.message}
                  </span>
                  <span className="block text-[10px] text-ink-500">{issue.messageZh}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <footer className="flex items-center gap-3 border-t border-line px-3.5 py-2 text-[11px] font-semibold">
        <span className="flex items-center gap-1 text-danger-600">
          {ICONS.error} {validation.errors} Blocking Errors
        </span>
        <span className="flex items-center gap-1 text-warn-600">
          {ICONS.warning} {validation.warnings} Warnings
        </span>
        <span className="flex items-center gap-1 text-accent-600">
          {ICONS.info} {validation.info} Info
        </span>
      </footer>
    </section>
  );
}
