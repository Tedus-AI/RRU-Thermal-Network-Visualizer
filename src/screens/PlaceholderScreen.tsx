/** Explicit Deferred screen for contracts reserved ahead of implementation. */

import { useEffect } from 'react';
import { FileClock, ShieldCheck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { SCREENS, projectPath } from '@/app/navigation';
import { Badge, Button } from '@/ui/primitives';
import { useProjectStore } from '@/data/projectStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useSolutionStore } from '@/data/solutionStore';

export function PlaceholderScreen({ code }: { code: string }) {
  const screen = SCREENS.find((candidate) => candidate.code === code)!;
  const { projectId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!projectId) return;
    const projectStore = useProjectStore.getState();
    projectStore.refreshProjects();
    if (projectStore.draft?.project_id !== projectId) projectStore.openProject(projectId);
    useScenarioStore.getState().loadFor(projectId);
    useComponentStore.getState().loadFor(projectId);
    useNetworkStore.getState().loadFor(projectId);
    const scenarioId = useScenarioStore.getState().activeScenarioId;
    useBoundaryStore.getState().loadFor(projectId, scenarioId);
    useSolutionStore.getState().loadFor(projectId, scenarioId);
  }, [projectId]);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-2xl rounded-lg border border-line bg-surface p-8">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-500">
            <FileClock size={23} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-bold text-ink-900">
                {screen.code} {screen.labelEn}
                <span className="ml-2 font-semibold text-ink-400">/ {screen.label}</span>
              </h1>
              <Badge tone="neutral">Deferred</Badge>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
              FloTHERM import is intentionally deferred until a real export schema is validated.
              The analytical Golden Flow continues through Screens 04-12 without CFD data.
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
              FloTHERM 匯入將在真實匯出格式完成驗證後實作；目前的分析 Golden Flow 不依賴 CFD
              資料，仍可完整執行 04-12。
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-md border border-line bg-canvas p-4">
          <div className="flex items-center gap-2 text-[13px] font-bold text-ink-800">
            <ShieldCheck size={16} className="text-success-600" />
            Reserved integration contracts / 已保留整合契約
          </div>
          <ul className="mt-3 space-y-2 text-[12px] text-ink-600">
            <li>• Route and data hooks remain available for future Screen 03 integration.</li>
            <li>• External object/surface mapping fields remain metadata-only.</li>
            <li>• Analytical, FloTHERM and measurement result slots remain separate.</li>
            <li>• No parser, guessed column mapping or fabricated CFD result is included.</li>
          </ul>
        </div>

        {projectId && (
          <div className="mt-6 flex justify-end">
            <Button variant="primary" onClick={() => navigate(projectPath(projectId, 'components'))}>
              Continue Analytical Flow to 04
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
