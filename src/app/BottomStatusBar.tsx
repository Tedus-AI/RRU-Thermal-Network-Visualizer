/**
 * Bottom status bar — part of the Master App Shell (00 §49).
 * Always shows project context plus solver/save state so no screen can present
 * numbers without their status (00 §13).
 */

import { Boxes, CircleCheck, CloudUpload, FileText, PencilLine, Share2, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useProjectStore } from '@/data/projectStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useSolverStore } from '@/data/solverStore';
import { useProjectHealth } from '@/project/projectHealth';

function StatusItem({
  icon,
  label,
  value,
  tone = 'text-white',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 border-r border-shell-line px-5">
      <span className="text-white/40">{icon}</span>
      <div className="leading-tight">
        <div className="text-[11px] text-white/50">{label}</div>
        <div className={`text-[12px] font-semibold ${tone}`}>{value}</div>
      </div>
    </div>
  );
}

export function BottomStatusBar() {
  const draft = useProjectStore((s) => s.draft);
  const dirty = useProjectStore((s) => s.dirty);
  const isNew = useProjectStore((s) => s.isNew);
  const readOnly = useProjectStore((s) => s.isReadOnly());

  const activeScenario = useScenarioStore((s) => s.activeScenario());
  const componentCount = useComponentStore((s) => s.componentCount());
  const nodeCount = useNetworkStore((s) => s.nodeCount());
  const solverState = useSolverStore((s) => s.state);

  const health = useProjectHealth();

  return (
    <footer className="flex h-14 shrink-0 items-center bg-shell-900 text-white">
      <StatusItem
        icon={<FileText size={16} />}
        label="Project ID"
        value={draft?.project_id || (isNew ? '— New —' : '—')}
      />
      <StatusItem
        icon={<Share2 size={16} />}
        label="Active Scenario"
        value={activeScenario?.name ?? '—'}
      />
      <StatusItem
        icon={<PencilLine size={16} />}
        label="Dirty State"
        value={dirty ? 'Unsaved Changes' : 'Clean'}
        tone={dirty ? 'text-warn-500' : 'text-white/80'}
      />
      <StatusItem
        icon={<CloudUpload size={16} />}
        label="Save Status"
        value={readOnly ? 'Read Only' : isNew || dirty ? 'Not Saved' : 'Saved'}
        tone={readOnly ? 'text-accent-500' : isNew || dirty ? 'text-warn-500' : 'text-ok-500'}
      />
      <StatusItem
        icon={<Boxes size={16} />}
        label="Component Count"
        value={String(componentCount)}
      />
      <StatusItem icon={<Share2 size={16} />} label="Node Count" value={String(nodeCount)} />
      <StatusItem
        icon={<CircleCheck size={16} />}
        label="Solver"
        value={solverState}
        tone={
          solverState === 'DIRTY' || solverState === 'WARNING'
            ? 'text-warn-500'
            : solverState === 'FAILED'
              ? 'text-danger-500'
              : 'text-white/80'
        }
      />

      <div className="ml-auto flex items-center gap-2 px-5 text-[13px] font-semibold">
        {health.projectIdentity ? (
          <>
            <CircleCheck size={17} className="text-ok-500" />
            <span className="text-ok-500">Ready for next step</span>
          </>
        ) : (
          <>
            <TriangleAlert size={17} className="text-warn-500" />
            <span className="text-warn-500">Complete project information</span>
          </>
        )}
      </div>
    </footer>
  );
}
