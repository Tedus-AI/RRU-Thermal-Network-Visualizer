/**
 * Right panel — 專案進度 (01 §10 Project Overview, §11 Project Health, §12 Next Step).
 *
 * The three used to be separate cards that said the same things three times:
 * the overview counted components, nodes and scenarios; the health list said
 * whether each existed; the next-step card named the first one missing. Each
 * row here is one workflow stage with its state and the number that proves it,
 * and the next step is the row it points at plus one link under the list.
 *
 * Everything is DERIVED on read (01 §26, AC-06). The done / to-do judgement is
 * `useProjectHealth` and `nextStepFor`, unchanged.
 *
 * FloTHERM has no row: Screen 03 is deferred and hidden from the sidebar, and an
 * optional feature that does not exist yet must not read as something missing
 * (AC-12).
 */

import { ArrowRight, CircleCheck, CircleMinus, ListChecks, TriangleAlert } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PanelCard } from '@/ui/primitives';
import { projectPath } from '@/app/navigation';
import { lastSolveLabel, useSolverStore } from '@/data/solverStore';
import { nextStepFor, useProjectHealth, useProjectOverview } from './projectHealth';

type RowState = 'done' | 'optional' | 'todo';

interface Row {
  key: string;
  label: string;
  state: RowState;
  detail?: string;
  /** Screen code whose step this row is — matched against the next step. */
  code: string;
  targetPath?: string;
}

function StateIcon({ state }: { state: RowState }) {
  if (state === 'done') return <CircleCheck size={16} className="shrink-0 text-ok-600" aria-label="完成" />;
  if (state === 'todo') return <TriangleAlert size={16} className="shrink-0 text-warn-600" aria-label="待處理" />;
  return <CircleMinus size={16} className="shrink-0 text-ink-400" aria-label="未齊全" />;
}

export function ProjectProgressPanel() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const health = useProjectHealth();
  const kpi = useProjectOverview();
  const solverState = useSolverStore((s) => s.state);
  const lastSolvedAt = useSolverStore((s) => s.lastSolvedAt);
  const next = nextStepFor(health);
  const created = Boolean(projectId) && projectId !== 'new';

  const componentDetail =
    health.componentData === 'none'
      ? undefined
      : health.componentData === 'errors'
        ? `${kpi.componentsWithErrors} 項有錯誤`
        : `${kpi.componentsReady} / ${kpi.componentTypeCount} 齊全`;

  const rows: Row[] = [
    {
      key: 'identity',
      label: '基本資料',
      state: health.projectIdentity ? 'done' : 'todo',
      detail: health.projectIdentity ? undefined : '請填名稱與代號',
      code: '01',
    },
    {
      key: 'components',
      label: '匯入元件',
      state: health.components ? 'done' : 'todo',
      detail: health.components
        ? `${kpi.componentCount} 顆 · ${kpi.totalPowerW.toFixed(1)} W`
        : undefined,
      code: '02',
      targetPath: 'import-components',
    },
    {
      // Importing is not the same as being ready. Errors block the network
      // build, so they are a to-do; a component that is merely incomplete is
      // grey — 04 §7 carries it forward rather than blocking on it — but it is
      // still said out loud.
      key: 'componentData',
      label: '元件熱資料',
      state:
        health.componentData === 'ready'
          ? 'done'
          : health.componentData === 'errors'
            ? 'todo'
            : 'optional',
      detail: componentDetail,
      code: '04',
      targetPath: 'components',
    },
    {
      key: 'network',
      label: '熱路徑',
      state: health.thermalNetwork ? 'done' : 'todo',
      detail: health.thermalNetwork ? `${kpi.nodeCount} 節點 · ${kpi.edgeCount} 段` : undefined,
      code: '05',
      targetPath: 'thermal-path',
    },
    {
      key: 'scenario',
      label: '情境',
      state: health.baselineScenario ? 'done' : 'todo',
      detail: `${kpi.scenarioCount} 個`,
      code: '06',
      targetPath: 'boundary',
    },
    {
      key: 'solve',
      label: '求解',
      state: health.solved ? 'done' : 'todo',
      detail: lastSolveLabel(solverState, lastSolvedAt),
      code: '07',
      targetPath: 'network',
    },
  ];

  return (
    <PanelCard title="專案進度" icon={<ListChecks size={15} />}>
      <ul className="flex flex-col">
        {rows.map((row) => {
          const isNext = row.code === next.screenCode;
          const clickable = Boolean(row.targetPath && created && row.state !== 'done');
          const content = (
            <>
              <StateIcon state={row.state} />
              <span
                className={`flex-1 text-[13px] ${
                  isNext ? 'font-bold text-ink-900' : row.state === 'done' ? 'text-ink-700' : 'text-ink-500'
                }`}
              >
                {row.label}
              </span>
              {row.detail && (
                <span
                  className={`tabular text-[12px] ${
                    row.state === 'todo' ? 'text-warn-600' : 'text-ink-500'
                  }`}
                >
                  {row.detail}
                </span>
              )}
            </>
          );
          return (
            <li key={row.key}>
              {clickable ? (
                <button
                  type="button"
                  onClick={() => navigate(projectPath(projectId!, row.targetPath!))}
                  title={`前往 ${row.code}`}
                  className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2.5 rounded px-1.5 py-[7px] text-left hover:bg-surface-muted"
                >
                  {content}
                </button>
              ) : (
                <div className="flex items-center gap-2.5 py-[7px]">{content}</div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-2.5 border-t border-line pt-2.5">
        {next.blockedHere ? (
          <p className="text-[12px] text-warn-600">{next.description}</p>
        ) : !created ? (
          <p className="text-[12px] text-ink-400">建立專案後才能繼續。</p>
        ) : (
          <button
            type="button"
            onClick={() => navigate(projectPath(projectId!, next.screenPath))}
            title={next.description}
            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[13px] font-semibold text-accent-700 hover:bg-accent-50"
          >
            <span className="font-normal text-ink-500">下一步：</span>
            {next.cta}
            <ArrowRight size={14} className="ml-auto" />
          </button>
        )}
      </div>
    </PanelCard>
  );
}
