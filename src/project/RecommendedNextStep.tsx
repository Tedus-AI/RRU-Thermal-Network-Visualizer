/** Right Panel G — Recommended Next Step (01 §12, §34, AC-08). */

import { ArrowRight, Lightbulb } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button, Skeleton } from '@/ui/primitives';
import { nextStepFor, useProjectHealth } from './projectHealth';
import { projectPath } from '@/app/navigation';
import { useGuardedNavigate } from '@/app/useGuardedNavigate';

export function RecommendedNextStep({ loading }: { loading?: boolean }) {
  const health = useProjectHealth();
  const { projectId } = useParams();
  const navigate = useGuardedNavigate();
  const step = nextStepFor(health);

  if (loading) {
    return (
      <section className="rounded-lg border border-accent-600/30 bg-accent-50 p-3.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-16" />
      </section>
    );
  }

  const canNavigate = Boolean(projectId) && projectId !== 'new' && !step.blockedHere;

  return (
    <section className="rounded-lg border border-accent-600/30 bg-accent-50">
      <header className="flex items-center gap-2 px-3.5 py-2.5 text-ink-700">
        <Lightbulb size={15} className="text-accent-600" />
        <h3 className="text-[13px] font-bold">Recommended Next Step</h3>
      </header>
      <div className="mx-2.5 mb-2.5 rounded-md border border-accent-600/25 bg-surface p-3.5">
        <h4 className="text-[15px] font-bold text-accent-700">{step.label}</h4>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-500">{step.description}</p>
        <Button
          variant="secondary"
          className="mt-3 w-full border-accent-600/40 text-accent-700 hover:bg-accent-100"
          disabled={!canNavigate}
          trailingIcon={<ArrowRight size={15} />}
          onClick={() => projectId && navigate(projectPath(projectId, step.screenPath))}
        >
          {step.cta}
        </Button>
        {step.blockedHere && (
          <p className="mt-2 text-[12px] text-warn-600">
            Fill in Project Name and Project ID to continue.
          </p>
        )}
        {!step.blockedHere && projectId === 'new' && (
          <p className="mt-2 text-[12px] text-ink-400">Save the project first to continue.</p>
        )}
      </div>
    </section>
  );
}
