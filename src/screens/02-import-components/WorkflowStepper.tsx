/**
 * Screen-specific workflow stepper — NOT part of the App Shell
 * (docs/APP_SHELL_CONTRACT.md). Only wizard screens render one.
 *
 * Screen 02: 來源 → 對應欄位 → 檢查並套用 (02 §2). Duplicate handling sits on
 * the check step and only when there are duplicates; applying is an action,
 * not a step, so it has no number of its own.
 */

import { Check } from 'lucide-react';
import type { ImportStep } from '@/data/componentImportStore';

const STEPS: Array<{ id: ImportStep; label: string }> = [
  { id: 'source', label: '來源' },
  { id: 'mapping', label: '對應欄位' },
  { id: 'review', label: '檢查並套用' },
];

export function WorkflowStepper({
  current,
  onSelect,
  reachable,
  mappingAuto,
  applied,
}: {
  current: ImportStep;
  onSelect: (step: ImportStep) => void;
  /** Steps the user can jump to — everything after the loaded data stays locked. */
  reachable: ImportStep[];
  /** The source's columns are this tool's own; the mapping step was passed over. */
  mappingAuto: boolean;
  /** Applied: every step is done. */
  applied: boolean;
}) {
  const currentIndex = applied ? STEPS.length : STEPS.findIndex((step) => step.id === current);

  return (
    <ol className="flex items-center gap-1" aria-label="匯入流程">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        const enabled = reachable.includes(step.id);
        const note = step.id === 'mapping' && mappingAuto && currentIndex > index ? '全部自動對應' : '';

        return (
          <li key={step.id} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              disabled={!enabled}
              aria-current={active ? 'step' : undefined}
              onClick={() => onSelect(step.id)}
              className="flex items-center gap-2 disabled:cursor-not-allowed"
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                  active
                    ? 'bg-accent-600 text-white'
                    : done
                      ? 'bg-ok-500 text-white'
                      : enabled
                        ? 'bg-surface text-ink-500 ring-1 ring-line-strong'
                        : 'bg-surface text-ink-400 ring-1 ring-line'
                }`}
              >
                {done ? <Check size={13} /> : index + 1}
              </span>
              <span className="leading-tight whitespace-nowrap">
                <span
                  className={`block text-[13px] font-semibold ${
                    active ? 'text-accent-700' : done ? 'text-ink-700' : 'text-ink-400'
                  }`}
                >
                  {step.label}
                </span>
                {note && <span className="block text-[11px] text-ok-600">{note} ✓</span>}
              </span>
            </button>
            {index < STEPS.length - 1 && (
              <span
                aria-hidden
                className={`mx-1 h-px flex-1 ${done ? 'bg-ok-500/50' : 'bg-line-strong'}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
