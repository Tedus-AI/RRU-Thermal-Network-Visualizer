/**
 * Bottom status bar — part of the Master App Shell (00 §49).
 * Always shows project context plus solver/save state so no screen can present
 * numbers without their status (00 §13).
 */

import {
  Boxes,
  CircleCheck,
  FileText,
  FolderSync,
  PencilLine,
  Share2,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useProjectStore } from '@/data/projectStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useSolverStore } from '@/data/solverStore';
import { useProjectHealth } from '@/project/projectHealth';
import { SOLVER_TONE } from './TopHeader';
import { useFolderStore } from '@/data/folderStore';

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
  const isNew = useProjectStore((s) => s.isNew);
  const readOnly = useProjectStore((s) => s.isReadOnly());

  const activeScenario = useScenarioStore((s) => s.activeScenario());
  const componentCount = useComponentStore((s) => s.componentCount());
  const nodeCount = useNetworkStore((s) => s.nodeCount());
  const solverState = useSolverStore((s) => s.state);

  const folderStatus = useFolderStore((s) => s.status);
  const lastSyncAt = useFolderStore((s) => s.lastSyncAt);
  const syncing = useFolderStore((s) => s.syncing);

  const health = useProjectHealth();

  return (
    <footer className="flex h-14 shrink-0 items-center bg-shell-900 text-white">
      <StatusItem
        icon={<FileText size={16} />}
        label="Project ID / 專案代號"
        value={draft?.project_id || (isNew ? '— New —' : '—')}
      />
      <StatusItem
        icon={<Share2 size={16} />}
        label="Active Scenario / 使用情境"
        value={activeScenario?.name ?? '—'}
      />
      <StatusItem
        icon={<PencilLine size={16} />}
        label="Project State / 專案狀態"
        value={readOnly ? 'Read Only / 唯讀' : isNew ? 'Not Created / 尚未建立' : 'Active / 使用中'}
        tone={readOnly ? 'text-accent-500' : isNew ? 'text-warn-500' : 'text-white/80'}
      />
      <StatusItem
        icon={<Boxes size={16} />}
        label="Component Count / 元件數"
        value={String(componentCount)}
      />
      <StatusItem icon={<Share2 size={16} />} label="Node Count / 節點數" value={String(nodeCount)} />
      {/* Same wording as the header, so one solver state never reads as two
          different things depending on where you look. */}
      <StatusItem
        icon={<CircleCheck size={16} />}
        label="Solver / 求解器"
        value={SOLVER_TONE[solverState].label}
        tone={
          solverState === 'DIRTY' || solverState === 'WARNING'
            ? 'text-warn-500'
            : solverState === 'FAILED'
              ? 'text-danger-500'
              : solverState === 'READY'
                ? 'text-white/60'
                : 'text-white/80'
        }
      />

      {/* Only once a folder is bound — an always-on cell would just be noise
          for the browsers and users that never use this. */}
      {folderStatus !== 'unsupported' && folderStatus !== 'unbound' && (
        <StatusItem
          icon={<FolderSync size={16} />}
          label="Local Folder / 本機資料夾"
          value={
            syncing
              ? 'Syncing… / 同步中'
              : folderStatus === 'connected'
                ? lastSyncAt
                  ? `Synced ${new Date(lastSyncAt).toLocaleTimeString()}`
                  : 'Connected / 已連線'
                : folderStatus === 'needs_permission'
                  ? 'Permission needed / 需授權'
                  : 'Write failed / 寫入失敗'
          }
          tone={
            folderStatus === 'connected'
              ? 'text-ok-500'
              : folderStatus === 'needs_permission'
                ? 'text-warn-500'
                : 'text-danger-500'
          }
        />
      )}

      <div className="ml-auto flex items-center gap-2 px-5 text-[13px] font-semibold">
        {health.projectIdentity ? (
          <>
            <CircleCheck size={17} className="text-ok-500" />
            <span className="text-ok-500">Ready for next step / 可進入下一步</span>
          </>
        ) : (
          <>
            <TriangleAlert size={17} className="text-warn-500" />
            <span className="text-warn-500">Complete project info / 請補齊專案資料</span>
          </>
        )}
      </div>
    </footer>
  );
}
