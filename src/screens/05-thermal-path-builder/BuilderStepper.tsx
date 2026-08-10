/**
 * Screen-specific workflow stepper — NOT part of the App Shell
 * (docs/APP_SHELL_CONTRACT.md). Screen 05 has five steps (05 §5).
 *
 * Components → Templates → Shared Structure → Connections → Validate
 */

import { Check } from 'lucide-react';

export const BUILDER_STEPS = [
  { id: 'components', label: 'Components', zh: '元件' },
  { id: 'templates', label: 'Templates', zh: '模板' },
  { id: 'structure', label: 'Shared Structure', zh: '共用結構' },
  { id: 'connections', label: 'Connections', zh: '連接設定' },
  { id: 'validate', label: 'Validate', zh: '驗證' },
] as const;

export type BuilderStep = (typeof BUILDER_STEPS)[number]['id'];

export function BuilderStepper({
  current,
  onSelect,
  completed,
}: {
  current: BuilderStep;
  onSelect: (step: BuilderStep) => void;
  /** Steps whose work is already done — they get a tick instead of a number. */
  completed: BuilderStep[];
}) {
  const currentIndex = BUILDER_STEPS.findIndex((step) => step.id === current);

  return (
    <ol className="flex items-center gap-1" aria-label="Thermal path builder / 熱路徑建立流程">
      {BUILDER_STEPS.map((step, index) => {
        const active = index === currentIndex;
        const done = completed.includes(step.id) && !active;

        return (
          <li key={step.id} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              aria-current={active ? 'step' : undefined}
              onClick={() => onSelect(step.id)}
              className="flex items-center gap-2"
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                  active
                    ? 'bg-accent-600 text-white'
                    : done
                      ? 'bg-ok-500 text-white'
                      : 'bg-surface text-ink-500 ring-1 ring-line-strong'
                }`}
              >
                {done ? <Check size={13} /> : index + 1}
              </span>
              <span className="leading-tight whitespace-nowrap">
                <span
                  className={`block text-[12px] font-semibold ${
                    active ? 'text-accent-700' : done ? 'text-ink-700' : 'text-ink-500'
                  }`}
                >
                  {step.label}
                </span>
                <span className="block text-[10px] text-ink-400">{step.zh}</span>
              </span>
            </button>
            {index < BUILDER_STEPS.length - 1 && (
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
