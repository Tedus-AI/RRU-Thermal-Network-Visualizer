/**
 * Screen-specific workflow stepper — 06 §6.5. Not part of the App Shell
 * (docs/APP_SHELL_CONTRACT.md).
 *
 * Scenario → Ambient & Site → Surface Mapping → Convection → Radiation & Solar
 * → Validate
 */

import { Check } from 'lucide-react';

import { T06 } from './tooltips';

export const BOUNDARY_STEPS = [
  { id: 'scenario', label: 'Scenario', zh: '情境', tip: T06.step.scenario },
  { id: 'ambient', label: 'Ambient & Site', zh: '環境與場址', tip: T06.step.ambientSite },
  { id: 'surfaces', label: 'Surface Mapping', zh: '表面對應', tip: T06.step.surfaceMapping },
  { id: 'convection', label: 'Convection', zh: '對流', tip: T06.step.convection },
  { id: 'radiation', label: 'Radiation & Solar', zh: '輻射與太陽', tip: T06.step.radiationSolar },
  { id: 'validate', label: 'Validate', zh: '驗證', tip: T06.step.validate },
] as const;

export type BoundaryStep = (typeof BOUNDARY_STEPS)[number]['id'];

export function BoundaryStepper({
  current,
  completed,
  onSelect,
}: {
  current: BoundaryStep;
  completed: BoundaryStep[];
  onSelect: (step: BoundaryStep) => void;
}) {
  const currentIndex = BOUNDARY_STEPS.findIndex((step) => step.id === current);

  return (
    <ol className="flex items-center gap-1" aria-label="Boundary conditions workflow / 邊界條件流程">
      {BOUNDARY_STEPS.map((step, index) => {
        const active = index === currentIndex;
        const done = completed.includes(step.id) && !active;

        return (
          <li key={step.id} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              aria-current={active ? 'step' : undefined}
              title={`${step.label} / ${step.zh} — ${step.tip}`}
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
            {index < BOUNDARY_STEPS.length - 1 && (
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
