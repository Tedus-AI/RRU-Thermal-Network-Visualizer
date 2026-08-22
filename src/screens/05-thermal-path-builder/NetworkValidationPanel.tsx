/**
 * Step 5 — Validation (05 §33, §34, §35).
 *
 * Rendered as a floating card over the canvas, as in `05.png`: the graph is the
 * subject of this screen, so the issue list overlays a corner of it and can be
 * collapsed, rather than taking a full-width block of the page.
 *
 * ERROR blocks Continue; WARNING and INFO do not. A coupling cycle is legal
 * physics and never appears here as an error (05 §34).
 */

import { useState } from 'react';
import { AlertTriangle, ChevronDown, CircleAlert, Info } from 'lucide-react';

import type { GraphIssue, GraphValidationResult } from '@/thermal/graph/graphValidation';

const ICONS = {
  error: <CircleAlert size={12} className="mt-px shrink-0 text-danger-600" />,
  warning: <AlertTriangle size={12} className="mt-px shrink-0 text-warn-600" />,
  info: <Info size={12} className="mt-px shrink-0 text-accent-600" />,
};

const ROW_STYLES = {
  error: 'border-danger-500/40 bg-danger-100',
  warning: 'border-warn-500/40 bg-warn-100',
  info: 'border-line bg-surface-muted',
};

/** Errors first, then warnings, then info — the blocking work comes first. */
const ORDER = { error: 0, warning: 1, info: 2 } as const;

export function NetworkValidationPanel({
  validation,
  onFocus,
}: {
  validation: GraphValidationResult | null;
  onFocus: (issue: GraphIssue) => void;
}) {
  const [open, setOpen] = useState(true);
  if (!validation) return null;

  const issues = [...validation.issues].sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity],
  );

  return (
    <div className="absolute right-3 bottom-3 z-10 flex max-h-[calc(100%-1.5rem)] w-[22rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-md border border-line bg-surface/95 shadow-md">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full shrink-0 items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <span className="text-[11px] font-bold text-ink-700">Validation / 驗證提示</span>
        <span className="ml-auto flex items-center gap-2 text-[10px] font-bold">
          <span className="flex items-center gap-1 text-danger-600">
            {ICONS.error} {validation.errors}
          </span>
          <span className="flex items-center gap-1 text-warn-600">
            {ICONS.warning} {validation.warnings}
          </span>
          <span className="flex items-center gap-1 text-accent-600">
            {ICONS.info} {validation.info}
          </span>
        </span>
        <ChevronDown size={13} className={`text-ink-400 ${open ? '' : '-rotate-90'}`} />
      </button>

      {open && (
        <div className="min-h-0 overflow-y-auto border-t border-line px-2 py-1.5">
          {issues.length === 0 ? (
            <p className="py-3 text-center text-[11px] text-ok-600">
              No issues found. Ready for Screen 06. / 未發現問題，可進入邊界條件設定。
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {issues.map((issue, index) => (
                <li key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? index}`}>
                  <button
                    type="button"
                    onClick={() => onFocus(issue)}
                    className={`flex w-full items-start gap-1.5 rounded border px-2 py-1 text-left ${ROW_STYLES[issue.severity]}`}
                  >
                    {ICONS[issue.severity]}
                    <span className="min-w-0">
                      <span className="block text-[10px] leading-snug font-semibold text-ink-900">
                        {issue.message}
                      </span>
                      <span className="block text-[9px] leading-snug text-ink-500">
                        {issue.messageZh}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
