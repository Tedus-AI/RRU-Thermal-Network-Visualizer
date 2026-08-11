/**
 * Solver Messages / validation — 07 §36, §37, PNG bottom-right.
 *
 * Two halves. The checklist across the top is the specification's five groups
 * (Pre-Solve, Matrix, Boundary, Energy Balance, Result Integrity). Below it is
 * the message log the mockup shows, with the All / Info / Warning / Error
 * filters and a focus action per message so "Focus Issue", "Go to Screen 05"
 * and "Go to Screen 06" all have somewhere to go (07 §37).
 */

import { useMemo, useState } from 'react';
import { CircleCheck, Info, TriangleAlert, XCircle } from 'lucide-react';

import { biTitle } from '@/ui/FieldLabel';
import type { SolverIssue } from '@/thermal/solver/solverTypes';

import { ISSUE_GROUPS, groupIssues } from './resultViewModel';

type Filter = 'all' | 'info' | 'warning' | 'error';

const SEVERITY_ICON = {
  error: <XCircle size={13} className="text-danger-600" />,
  warning: <TriangleAlert size={13} className="text-warn-600" />,
  info: <Info size={13} className="text-accent-600" />,
} as const;

export function SolverValidationPanel({
  issues,
  hasRun,
  onFocus,
  onNavigate,
}: {
  issues: SolverIssue[];
  /** False before any check or solve has been run in this session. */
  hasRun: boolean;
  onFocus: (issue: SolverIssue) => void;
  onNavigate: (screen: '05' | '06') => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(
    () => ({
      all: issues.length,
      info: issues.filter((entry) => entry.severity === 'info').length,
      warning: issues.filter((entry) => entry.severity === 'warning').length,
      error: issues.filter((entry) => entry.severity === 'error').length,
    }),
    [issues],
  );

  const grouped = useMemo(() => groupIssues(issues), [issues]);
  const visible = filter === 'all' ? issues : issues.filter((entry) => entry.severity === filter);

  const FILTERS: Array<{ id: Filter; label: string; zh: string }> = [
    { id: 'all', label: 'All', zh: '全部' },
    { id: 'info', label: 'Info', zh: '資訊' },
    { id: 'warning', label: 'Warning', zh: '警告' },
    { id: 'error', label: 'Error', zh: '錯誤' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* 07 §36 — the five check groups, each showing its own worst severity. */}
      <ul className="grid shrink-0 gap-1">
        {ISSUE_GROUPS.map((group) => {
          const entries = grouped[group.id] ?? [];
          const failed = entries.some((entry) => entry.severity === 'error');
          const warned = entries.some((entry) => entry.severity === 'warning');
          return (
            <li
              key={group.id}
              title={biTitle(group.label, group.zh)}
              className="flex items-center gap-1.5 text-[11px]"
            >
              {failed ? (
                <XCircle size={13} className="shrink-0 text-danger-600" />
              ) : warned ? (
                <TriangleAlert size={13} className="shrink-0 text-warn-600" />
              ) : (
                <CircleCheck size={13} className="shrink-0 text-ok-600" />
              )}
              <span className="font-semibold text-ink-700">{group.label}</span>
              <span className="text-ink-400">/ {group.zh}</span>
              <span
                className={`ml-auto font-bold ${
                  failed ? 'text-danger-600' : warned ? 'text-warn-600' : 'text-ok-600'
                }`}
              >
                {!hasRun ? 'Not run' : failed ? `${entries.filter((e) => e.severity === 'error').length} error` : warned ? `${entries.filter((e) => e.severity === 'warning').length} warning` : 'Pass'}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex shrink-0 flex-wrap gap-1">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={filter === entry.id}
            title={biTitle(entry.label, entry.zh)}
            onClick={() => setFilter(entry.id)}
            className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
              filter === entry.id
                ? 'bg-accent-600 text-white'
                : 'bg-surface-muted text-ink-500 hover:text-ink-900'
            }`}
          >
            {entry.label} ({counts[entry.id]})
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-ink-400">
            {hasRun
              ? 'No messages in this filter. / 此篩選沒有訊息。'
              : 'Run a pre-solve check or solve the network. / 請先執行檢查或求解。'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {visible.map((entry) => (
              <li
                key={`${entry.id}:${entry.code}`}
                className="rounded-md border border-line bg-surface-muted px-2 py-1.5"
              >
                <div className="flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">{SEVERITY_ICON[entry.severity]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] leading-snug font-medium text-ink-700">
                      {entry.message}
                    </p>
                    <p className="text-[11px] leading-snug text-ink-400">{entry.message_zh}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {(entry.node_id || entry.edge_id) && (
                        <button
                          type="button"
                          onClick={() => onFocus(entry)}
                          title={biTitle('Focus this object on the graph', '在圖上聚焦此物件')}
                          className="text-[10px] font-bold text-accent-600 hover:underline"
                        >
                          Focus Issue / 定位
                        </button>
                      )}
                      {(entry.fix_in === '05' || entry.fix_in === '06') && (
                        <button
                          type="button"
                          onClick={() => onNavigate(entry.fix_in as '05' | '06')}
                          title={biTitle(`Go to Screen ${entry.fix_in}`, `前往 ${entry.fix_in}`)}
                          className="text-[10px] font-bold text-accent-600 hover:underline"
                        >
                          Go to {entry.fix_in}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
