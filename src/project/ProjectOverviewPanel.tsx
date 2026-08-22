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
  zh,
  value,
  tone = 'text-ink-900',
}: {
  label: string;
  zh: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px]">
      <dt className="text-[13px] text-ink-500">
        {label}
        <span className="ml-1 text-[12px] text-ink-400">/ {zh}</span>
      </dt>
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
      <PanelCard title="Project Overview / 專案總覽" icon={<BarChart3 size={15} />}>
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-4" />
          ))}
        </div>
      </PanelCard>
    );
  }

  return (
    <PanelCard title="Project Overview / 專案總覽" icon={<BarChart3 size={15} />}>
      <dl>
        <Row label="Components" zh="元件數" value={String(kpi.componentCount)} />
        {/*
          A count of components says how much was imported, not how much of it
          is usable. This row is the difference, and it is the one that decides
          whether a solve is worth running.
        */}
        <Row
          label="Complete Data"
          zh="資料齊全"
          value={
            kpi.componentTypeCount === 0
              ? '—'
              : `${kpi.componentsReady} / ${kpi.componentTypeCount}`
          }
          tone={
            kpi.componentsWithErrors > 0
              ? 'text-danger-600'
              : kpi.componentTypeCount > 0 && kpi.componentsReady < kpi.componentTypeCount
                ? 'text-warn-600'
                : 'text-ink-900'
          }
        />
        <Row label="Heat Sources" zh="熱源數" value={String(kpi.heatSourceCount)} />
        <Row label="Total Power" zh="總功耗" value={`${kpi.totalPowerW.toFixed(1)} W`} />
        <Row label="Thermal Nodes" zh="熱節點" value={String(kpi.nodeCount)} />
        <Row label="Thermal Edges" zh="熱路徑" value={String(kpi.edgeCount)} />
        <Row label="Scenarios" zh="情境數" value={String(kpi.scenarioCount)} />
        <Row
          label="FloTHERM Mapping"
          zh="FloTHERM 映射"
          value={kpi.flothermMappingCount > 0 ? String(kpi.flothermMappingCount) : 'Not Imported'}
          tone={kpi.flothermMappingCount > 0 ? 'text-ink-900' : 'text-warn-600'}
        />
        <Row
          label="Last Solve"
          zh="上次求解"
          value={lastSolveLabel(solverState, lastSolvedAt)}
          tone={solverState === 'DIRTY' ? 'text-warn-600' : 'text-ink-900'}
        />
      </dl>
    </PanelCard>
  );
}
