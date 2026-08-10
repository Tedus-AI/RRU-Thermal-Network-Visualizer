/**
 * Right Panel F — Project Health (01 §11, §33).
 *
 * Three states per row: complete, optional-and-missing, required-and-missing.
 * FloTHERM is optional and must never render as an error (AC-12).
 */

import { CircleCheck, CircleMinus, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { PanelCard, Skeleton } from '@/ui/primitives';
import { useProjectHealth } from './projectHealth';
import { projectPath } from '@/app/navigation';
import { useGuardedNavigate } from '@/app/useGuardedNavigate';

type RowState = 'done' | 'optional' | 'todo';

function HealthRow({
  state,
  label,
  targetPath,
}: {
  state: RowState;
  label: string;
  targetPath?: string;
}) {
  const { projectId } = useParams();
  const navigate = useGuardedNavigate();

  const icon =
    state === 'done' ? (
      <CircleCheck size={16} className="text-ok-600" />
    ) : state === 'todo' ? (
      <TriangleAlert size={16} className="text-warn-600" />
    ) : (
      <CircleMinus size={16} className="text-ink-400" />
    );

  const dot =
    state === 'done' ? 'bg-ok-500' : state === 'todo' ? 'bg-warn-500' : 'bg-ink-400';

  const clickable = Boolean(targetPath && projectId && state !== 'done');

  const content = (
    <>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${dot}`} />
      <span
        className={`flex-1 text-[13px] ${state === 'done' ? 'text-ink-700' : 'text-ink-500'}`}
      >
        {label}
      </span>
      {icon}
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={() => navigate(projectPath(projectId!, targetPath!))}
        className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2.5 rounded px-1.5 py-[7px] text-left hover:bg-surface-muted"
      >
        {content}
      </button>
    );
  }

  return <div className="flex items-center gap-2.5 py-[7px]">{content}</div>;
}

export function ProjectHealthPanel({ loading }: { loading?: boolean }) {
  const health = useProjectHealth();

  if (loading) {
    return (
      <PanelCard title="Project Health / 專案健檢" icon={<ShieldCheck size={15} />}>
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-4" />
          ))}
        </div>
      </PanelCard>
    );
  }

  return (
    <PanelCard title="Project Health / 專案健檢" icon={<ShieldCheck size={15} />}>
      <HealthRow
        state={health.projectIdentity ? 'done' : 'todo'}
        label={
          health.projectIdentity
            ? 'Project metadata complete / 專案基本資料完整'
            : 'Missing project identity / 缺少專案識別資料'
        }
      />
      <HealthRow
        state={health.components ? 'done' : 'todo'}
        label={
          health.components
            ? 'Hardware components imported / 已匯入硬體元件'
            : 'Components not imported / 尚未匯入元件'
        }
        targetPath="import-components"
      />
      <HealthRow
        state={health.thermalNetwork ? 'done' : 'todo'}
        label={
          health.thermalNetwork
            ? 'Thermal network created / 熱網路已建立'
            : 'Thermal network not created / 熱網路尚未建立'
        }
        targetPath="thermal-path"
      />
      <HealthRow
        state={health.baselineScenario ? 'done' : 'todo'}
        label={
          health.baselineScenario
            ? 'Baseline scenario created / 已建立基準情境'
            : 'Missing boundary condition / 缺少邊界條件'
        }
        targetPath="boundary"
      />
      {/* Optional — grey, never a warning. */}
      <HealthRow
        state={health.flotherm ? 'done' : 'optional'}
        label={
          health.flotherm
            ? 'FloTHERM data imported / 已匯入 FloTHERM 資料'
            : 'FloTHERM data not imported (optional) / 尚未匯入 FloTHERM（選用）'
        }
        targetPath="import-flotherm"
      />
      <HealthRow
        state={health.solved ? 'done' : 'todo'}
        label={
          health.solved ? 'Network solved / 已完成求解' : 'Network not solved / 尚未求解'
        }
        targetPath="network"
      />
    </PanelCard>
  );
}
