/**
 * Screen-specific workflow stepper — NOT part of the App Shell
 * (docs/APP_SHELL_CONTRACT.md). Only wizard screens render one.
 *
 * Screen 02: Source → Mapping → Validate → Duplicates → Apply (02 §2).
 */

import { Check } from 'lucide-react';
import type { ImportStep } from '@/data/componentImportStore';

const STEPS: Array<{ id: ImportStep; label: string; zh: string }> = [
  { id: 'source', label: 'Source', zh: '來源' },
  { id: 'mapping', label: 'Mapping', zh: '欄位對應' },
  { id: 'validate', label: 'Validate', zh: '驗證結果' },
  { id: 'duplicates', label: 'Duplicates', zh: '重複處理' },
  { id: 'apply', label: 'Apply', zh: '套用匯入' },
];

export function WorkflowStepper({
  current,
  onSelect,
  reachable,
}: {
  current: ImportStep;
  onSelect: (step: ImportStep) => void;
  /** Steps the user can jump to — everything after the loaded data stays locked. */
  reachable: ImportStep[];
}) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);

  return (
    <ol className="flex items-center gap-1" aria-label="Import workflow / 匯入流程">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        const enabled = reachable.includes(step.id);

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
                  className={`block text-[12px] font-semibold ${
                    active ? 'text-accent-700' : done ? 'text-ink-700' : 'text-ink-400'
                  }`}
                >
                  {step.label}
                </span>
                <span className="block text-[10px] text-ink-400">{step.zh}</span>
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
