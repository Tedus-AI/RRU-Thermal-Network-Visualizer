/**
 * Section 6 — Validation (06 §12, PNG §6).
 *
 * The PNG shows a green checklist; the specification requires errors, warnings
 * and informational notes. Both are here: the checks that pass read as a
 * checklist, and anything outstanding reads as an actionable row with the
 * suggested fix. Severity is carried by an icon and a word, never by colour
 * alone (06 §17).
 */

import { AlertTriangle, CircleAlert, CircleCheck, Info } from 'lucide-react';

import { Bi } from '@/ui/FieldLabel';
import type {
  BoundaryValidationMessage,
  BoundaryValidationState,
} from '@/thermal/boundary/types';

const ICONS = {
  error: <CircleAlert size={13} className="mt-px shrink-0 text-danger-600" />,
  warning: <AlertTriangle size={13} className="mt-px shrink-0 text-warn-600" />,
  info: <Info size={13} className="mt-px shrink-0 text-accent-600" />,
};

const ROW_STYLES = {
  error: 'border-danger-500/40 bg-danger-100',
  warning: 'border-warn-500/40 bg-warn-100',
  info: 'border-line bg-surface-muted',
};

/** The checks the PNG shows as ticks, expressed as pass/fail conditions. */
export interface ReadinessCheck {
  label: string;
  zh: string;
  passed: boolean;
}

export function BoundaryValidationPanel({
  validation,
  checks,
  onFocus,
}: {
  validation: BoundaryValidationState;
  checks: ReadinessCheck[];
  onFocus: (message: BoundaryValidationMessage) => void;
}) {
  const outstanding = [...validation.errors, ...validation.warnings, ...validation.infos];

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-1.5">
            {check.passed ? (
              <CircleCheck size={13} className="mt-px shrink-0 text-ok-600" />
            ) : (
              <CircleAlert size={13} className="mt-px shrink-0 text-danger-600" />
            )}
            <span className="min-w-0">
              <span
                className={`block text-[11px] font-semibold ${
                  check.passed ? 'text-ink-700' : 'text-danger-600'
                }`}
              >
                {check.label}
              </span>
              <span className="block text-[10px] text-ink-400">{check.zh}</span>
            </span>
          </li>
        ))}
      </ul>

      {outstanding.length > 0 && (
        <div className="max-h-40 overflow-auto border-t border-line pt-2">
          <ul className="flex flex-col gap-1">
            {outstanding.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onFocus(entry)}
                  className={`flex w-full items-start gap-1.5 rounded border px-2 py-1 text-left ${ROW_STYLES[entry.severity]}`}
                >
                  {ICONS[entry.severity]}
                  <span className="min-w-0">
                    <span className="block text-[10px] leading-snug font-semibold text-ink-900">
                      {entry.message}
                    </span>
                    <span className="block text-[9px] leading-snug text-ink-500">
                      {entry.message_zh}
                    </span>
                    {entry.suggested_action && (
                      <span className="block text-[9px] text-ink-400">
                        → {entry.suggested_action}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-line pt-2 text-[11px] font-semibold">
        <span className="flex items-center gap-1 text-danger-600">
          {ICONS.error} {validation.errors.length}{' '}
          <Bi en="Errors" zh="錯誤" inline />
        </span>
        <span className="flex items-center gap-1 text-warn-600">
          {ICONS.warning} {validation.warnings.length} <Bi en="Warnings" zh="警告" inline />
        </span>
        <span className="flex items-center gap-1 text-accent-600">
          {ICONS.info} {validation.infos.length} <Bi en="Info" zh="資訊" inline />
        </span>
      </div>
    </div>
  );
}
