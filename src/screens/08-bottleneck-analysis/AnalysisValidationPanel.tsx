/**
 * Analysis Validation — 08 §21, PNG left column bottom card.
 *
 * A readiness checklist over the blocking conditions, then the run's own
 * warnings and information. A candidate whose solve failed is reported here as
 * well as in its ranking row, so a failure is never silent.
 */

import { useState } from 'react';
import { CircleCheck, Info, TriangleAlert, XCircle } from 'lucide-react';

import { biTitle } from '@/ui/FieldLabel';
import type { AnalysisIssue, BottleneckAnalysis } from '@/thermal/analysis/analysisTypes';

import { REJECTION_LABELS, rejectionSummary } from './analysisViewModel';

export interface ReadinessCheck {
  label: string;
  zh: string;
  passed: boolean;
  /** A check that is informational rather than blocking. */
  advisory?: boolean;
}

const ICON = {
  error: <XCircle size={13} className="text-danger-600" />,
  warning: <TriangleAlert size={13} className="text-warn-600" />,
  info: <Info size={13} className="text-accent-600" />,
} as const;

export function AnalysisValidationPanel({
  checks,
  analysis,
  onFocus,
}: {
  checks: ReadinessCheck[];
  analysis: BottleneckAnalysis | null;
  onFocus: (edgeId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const issues: AnalysisIssue[] = analysis?.issues ?? [];
  const errors = issues.filter((entry) => entry.severity === 'error');
  const warnings = issues.filter((entry) => entry.severity === 'warning');
  const infos = issues.filter((entry) => entry.severity === 'info');
  const ordered = [...errors, ...warnings, ...infos];
  const visible = showAll ? ordered : ordered.slice(0, 4);
  const rejected = rejectionSummary(analysis);

  return (
    <div className="grid gap-2">
      <ul className="grid gap-1">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-1.5 text-[11px]">
            {check.passed ? (
              <CircleCheck size={13} className="mt-px shrink-0 text-ok-600" />
            ) : check.advisory ? (
              <TriangleAlert size={13} className="mt-px shrink-0 text-warn-600" />
            ) : (
              <XCircle size={13} className="mt-px shrink-0 text-danger-600" />
            )}
            <span className="min-w-0">
              <span className={check.passed ? 'text-ink-700' : 'font-semibold text-ink-900'}>
                {check.label}
              </span>
              <span className="block text-ink-400">{check.zh}</span>
            </span>
          </li>
        ))}
      </ul>

      {ordered.length > 0 && (
        <ul className="grid gap-1 border-t border-line pt-2">
          {visible.map((entry) => (
            <li key={`${entry.id}:${entry.code}`} className="flex items-start gap-1.5 text-[11px]">
              <span className="mt-px shrink-0">{ICON[entry.severity]}</span>
              <span className="min-w-0">
                <span className="text-ink-700">{entry.message}</span>
                <span className="block text-ink-400">{entry.message_zh}</span>
                {entry.edge_id && (
                  <button
                    type="button"
                    onClick={() => onFocus(entry.edge_id as string)}
                    title={biTitle('Focus this edge on the graph', '在圖上聚焦此連線')}
                    className="text-[10px] font-bold text-accent-600 hover:underline"
                  >
                    Focus / 定位
                  </button>
                )}
              </span>
            </li>
          ))}
          {ordered.length > 4 && (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="text-[10px] font-bold text-accent-600 hover:underline"
              >
                {showAll
                  ? 'Show fewer / 收合'
                  : `Show all ${ordered.length} messages / 顯示全部`}
              </button>
            </li>
          )}
        </ul>
      )}

      {rejected.length > 0 && (
        <div className="border-t border-line pt-2">
          <p className="mb-1 text-[10px] font-bold text-ink-700">
            Excluded edges <span className="font-normal text-ink-400">/ 未納入分析的連線</span>
          </p>
          <ul className="grid gap-0.5">
            {rejected.map((entry) => (
              <li key={entry.reason} className="flex justify-between gap-2 text-[10px] text-ink-500">
                <span title={REJECTION_LABELS[entry.reason]?.zh}>
                  {REJECTION_LABELS[entry.reason]?.label ?? entry.reason}
                </span>
                <span className="font-semibold tabular">{entry.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
