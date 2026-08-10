/**
 * Right Panel E — Project Overview (01 §10).
 * Every row is derived from the shared stores on render (01 §26, AC-06).
 */

import { BarChart3 } from 'lucide-react';
import { PanelCard, Skeleton } from '@/ui/primitives';
import { useProjectOverview } from './projectHealth';
import { useSolverStore, lastSolveLabel } from '@/data/solverStore';

function Row({
  label,
  value,
  tone = 'text-ink-900',
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px]">
      <dt className="text-[13px] text-ink-500">{label}</dt>
      <dd className={`tabular text-[13px] font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

export function ProjectOverviewPanel({ loading }: { loading?: boolean }) {
  const kpi = useProjectOverview();
  const solverState = useSolverStore((s) => s.state);
  const lastSolvedAt = useSolverStore((s) => s.lastSolvedAt);

  if (loading) {
    return (
      <PanelCard title="Project Overview" icon={<BarChart3 size={15} />}>
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-4" />
          ))}
        </div>
      </PanelCard>
    );
  }

  return (
    <PanelCard title="Project Overview" icon={<BarChart3 size={15} />}>
      <dl>
        <Row label="Components" value={String(kpi.componentCount)} />
        <Row label="Heat Sources" value={String(kpi.heatSourceCount)} />
        <Row label="Total Power" value={`${kpi.totalPowerW.toFixed(1)} W`} />
        <Row label="Thermal Nodes" value={String(kpi.nodeCount)} />
        <Row label="Thermal Edges" value={String(kpi.edgeCount)} />
        <Row label="Scenarios" value={String(kpi.scenarioCount)} />
        <Row
          label="FloTHERM Mapping"
          value={kpi.flothermMappingCount > 0 ? String(kpi.flothermMappingCount) : 'Not Imported'}
          tone={kpi.flothermMappingCount > 0 ? 'text-ink-900' : 'text-warn-600'}
        />
        <Row
          label="Last Solve"
          value={lastSolveLabel(solverState, lastSolvedAt)}
          tone={solverState === 'DIRTY' ? 'text-warn-600' : 'text-ink-900'}
        />
      </dl>
    </PanelCard>
  );
}
