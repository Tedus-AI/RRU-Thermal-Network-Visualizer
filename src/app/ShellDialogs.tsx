/**
 * The header's Settings, Help and Import dialogs.
 *
 * Everything shown here is real and wired. Nothing in Settings is a toggle that
 * does not yet do something — a preference that silently has no effect is worse
 * than an absent one, because it looks like it was applied.
 */

import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Database,
  FileDown,
  FileUp,
  HardDrive,
  Info,
  RotateCcw,
} from 'lucide-react';

import { Badge, Button, Modal } from '@/ui/primitives';
import { toast } from '@/ui/toast';
import { SCREENS } from './navigation';
import { BUILD_ID, resetProjectStorage } from '@/data/bootstrapStorage';
import { storageUsage } from '@/data/buildStamp';
import { SCHEMA_VERSION } from '@/domain/project';
import {
  PROJECT_FILE_VERSION,
  applyProjectFile,
  availableProjectId,
  type ImportMode,
  type ProjectFile,
  type ProjectFileSummary,
} from '@/data/projectFile';

/** Characters as an engineer reads them. Storage is charged in UTF-16 units. */
function size(characters: number): string {
  if (characters < 1024) return `${characters} chars`;
  if (characters < 1024 * 1024) return `${(characters / 1024).toFixed(1)} KB`;
  return `${(characters / (1024 * 1024)).toFixed(2)} MB`;
}

function Section({
  icon: Icon,
  title,
  zh,
  children,
}: {
  icon: typeof Database;
  title: string;
  zh: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-[12px] font-bold text-ink-900">
        <Icon className="size-3.5 text-ink-400" aria-hidden />
        {title}
        <span className="font-normal text-ink-400">/ {zh}</span>
      </h3>
      {children}
    </section>
  );
}

function Row({ label, zh, value }: { label: string; zh: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1 last:border-b-0">
      <span className="text-[11.5px] text-ink-500">
        {label} <span className="text-ink-400">{zh}</span>
      </span>
      <span className="text-right font-mono text-[11.5px] text-ink-900">{value}</span>
    </div>
  );
}

// --- Settings --------------------------------------------------------------

export function SettingsDialog({
  onClose,
  onExportProject,
  onImportProject,
  canExport,
}: {
  onClose: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  canExport: boolean;
}) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  // Read once per open: this is a snapshot of storage, not a live subscription.
  const usage = useMemo(
    () => (typeof localStorage === 'undefined' ? null : storageUsage(localStorage)),
    [],
  );

  if (confirmingReset) {
    return (
      <Modal
        title="Reset all local data? / 重置所有本機資料？"
        description="Every project in this browser is deleted and the Golden Demo is rebuilt. Project files you already exported are not affected."
        onClose={() => setConfirmingReset(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingReset(false)}>
              Cancel / 取消
            </Button>
            <Button variant="danger" onClick={() => void resetProjectStorage()}>
              Reset Everything / 全部重置
            </Button>
          </>
        }
      >
        <p className="text-[12px] leading-relaxed text-danger-600">
          此動作無法復原。若尚未匯出專案檔，請先取消並執行 Export Project。
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Settings / 設定"
      description="Application and data settings. Report and export options live on Screen 12."
      width="max-w-lg"
      onClose={onClose}
      footer={<Button onClick={onClose}>Close / 關閉</Button>}
    >
      <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto">
        <Section icon={HardDrive} title="Where your data is stored" zh="資料儲存位置">
          <p className="text-[11.5px] leading-relaxed text-ink-500">
            Projects live in this browser&apos;s local storage on this machine. They are not
            uploaded anywhere, and they do not follow you to another browser or computer.
            <span className="mt-0.5 block text-ink-400">
              專案儲存在本機瀏覽器，不會上傳，也不會跟著你換到其他瀏覽器或電腦。
            </span>
          </p>
          <div className="rounded border border-warn-500/40 bg-warn-100/50 px-2.5 py-2">
            <p className="text-[11.5px] leading-relaxed text-warn-700">
              Clearing site data, or a new build being deployed, removes them. Export a project
              file for anything you need to keep.
              <span className="mt-0.5 block">
                清除瀏覽器資料或部署新版本都會清空；需要保留的請匯出專案檔。
              </span>
            </p>
          </div>
        </Section>

        <Section icon={FileDown} title="Project file" zh="專案檔">
          <p className="text-[11.5px] leading-relaxed text-ink-500">
            A project file is one project as a single document — components, network, boundaries,
            solutions, analyses and report configuration.
            <span className="mt-0.5 block text-ink-400">
              專案檔把單一專案的元件、網路、邊界、求解結果、分析與報告設定存成一個檔案。
            </span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              icon={<FileDown className="size-3.5" aria-hidden />}
              onClick={onExportProject}
              disabled={!canExport}
            >
              Export Project / 匯出專案
            </Button>
            <Button
              variant="secondary"
              icon={<FileUp className="size-3.5" aria-hidden />}
              onClick={onImportProject}
            >
              Import Project / 匯入專案
            </Button>
          </div>
          {!canExport && (
            <p className="text-[11px] text-ink-400">
              Open a saved project first. 請先開啟一個已儲存的專案。
            </p>
          )}
        </Section>

        <Section icon={Database} title="Storage usage" zh="儲存用量">
          {usage == null || usage.entries.length === 0 ? (
            <p className="text-[11.5px] text-ink-400">
              Nothing stored yet. 尚無資料。
            </p>
          ) : (
            <div className="flex flex-col">
              {usage.entries.map((entry) => (
                <Row
                  key={entry.key}
                  label={entry.key.replace('tnv.', '')}
                  zh=""
                  value={size(entry.characters)}
                />
              ))}
              <Row label="Total" zh="合計" value={size(usage.total_characters)} />
            </div>
          )}
        </Section>

        <Section icon={Info} title="Build" zh="版本資訊">
          <div className="flex flex-col">
            <Row label="Build id" zh="建置代號" value={BUILD_ID} />
            <Row label="Project schema" zh="專案結構版本" value={SCHEMA_VERSION} />
            <Row label="Project file format" zh="專案檔格式" value={`v${PROJECT_FILE_VERSION}`} />
          </div>
          <p className="text-[11px] leading-relaxed text-ink-400">
            The build id is what decides whether stored data belongs to the running code. When it
            changes, local data is rebuilt automatically.
            <span className="block">
              建置代號用來判斷本機資料是否屬於目前版本；版本變更時會自動重建。
            </span>
          </p>
        </Section>

        <Section icon={AlertTriangle} title="Reset" zh="重置">
          <Button
            variant="danger"
            icon={<RotateCcw className="size-3.5" aria-hidden />}
            onClick={() => setConfirmingReset(true)}
          >
            Reset All Local Data / 重置所有本機資料
          </Button>
        </Section>
      </div>
    </Modal>
  );
}

// --- Help ------------------------------------------------------------------

const SOLVER_HELP: Array<[string, string, string]> = [
  ['Not Solved', '尚未求解', 'No result exists yet for this network and scenario.'],
  ['Solving', '求解中', 'The nodal solve is running.'],
  ['Solved', '已求解', 'A current result exists with no warnings.'],
  ['Warning', '有警告', 'A result exists, but energy balance or validation raised a warning.'],
  [
    'Stale Results',
    '結果已過期',
    'A result exists but an input changed after it was produced — re-solve before reading the numbers.',
  ],
  ['Solve Failed', '求解失敗', 'The solve could not complete; no usable result.'],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Help / 說明"
      description="What this tool does, what the screens are, and what the status words mean."
      width="max-w-2xl"
      onClose={onClose}
      footer={<Button onClick={onClose}>Close / 關閉</Button>}
    >
      <div className="flex max-h-[62vh] flex-col gap-5 overflow-y-auto">
        <Section icon={Info} title="What this tool is" zh="這個工具是什麼">
          <p className="text-[11.5px] leading-relaxed text-ink-500">
            A thermal path and bottleneck analyser for 5G FR1 RRU hardware. It builds a resistance
            network from your components, solves it as a nodal problem, and shows where the heat
            actually piles up — so a design decision can be argued from a number rather than a
            guess.
            <span className="mt-1 block text-ink-400">
              針對 5G FR1 RRU 硬體的熱路徑與瓶頸分析工具：由元件建立熱阻網路，以節點法求解，
              找出熱量實際累積的位置，讓設計決策有數據依據。
            </span>
          </p>
        </Section>

        <Section icon={Info} title="Solver status" zh="求解器狀態">
          <p className="text-[11.5px] text-ink-500">
            Shown at the top right and in the status bar.
            <span className="text-ink-400"> 顯示於右上角與底部狀態列。</span>
          </p>
          <dl className="flex flex-col gap-1">
            {SOLVER_HELP.map(([label, zh, meaning]) => (
              <div key={label} className="grid grid-cols-[9rem_1fr] gap-2 border-b border-line py-1">
                <dt className="text-[11.5px] font-semibold text-ink-900">
                  {label}
                  <span className="block font-normal text-ink-400">{zh}</span>
                </dt>
                <dd className="text-[11.5px] leading-relaxed text-ink-500">{meaning}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section icon={Info} title="Screens" zh="畫面導覽">
          <ol className="grid grid-cols-2 gap-x-4">
            {SCREENS.map((screen) => (
              <li
                key={screen.code}
                className="flex items-baseline gap-1.5 border-b border-line py-0.5 text-[11.5px]"
              >
                <span className="font-mono text-ink-400">{screen.code}</span>
                <span className="font-semibold text-ink-900">{screen.labelEn}</span>
                <span className="truncate text-ink-400">{screen.label}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section icon={Info} title="Two rules worth knowing" zh="兩條重要規則">
          <ul className="flex flex-col gap-1.5 text-[11.5px] leading-relaxed text-ink-500">
            <li>
              <span className="font-semibold text-ink-900">Unknown stays unknown.</span> A value
              that was never supplied shows as N/A. It is never quietly treated as zero, because a
              zero resistance and an unknown resistance lead to opposite conclusions.
              <span className="block text-ink-400">
                未知值一律顯示 N/A，不會被當成 0——零熱阻與未知熱阻會導出完全相反的結論。
              </span>
            </li>
            <li>
              <span className="font-semibold text-ink-900">
                Resistance is never derived from ΔT alone.
              </span>{' '}
              A segment&apos;s Rth is only computed when the heat flow through that segment is
              known.
              <span className="block text-ink-400">
                除非已知該段的熱流量，否則不會由溫差反推熱阻。
              </span>
            </li>
          </ul>
        </Section>
      </div>
    </Modal>
  );
}

// --- Import ----------------------------------------------------------------

export function ImportProjectDialog({
  file,
  summary,
  onCancel,
  onImported,
}: {
  file: ProjectFile;
  summary: ProjectFileSummary;
  onCancel: () => void;
  onImported: (projectId: string) => void;
}) {
  const [mode, setMode] = useState<ImportMode>(summary.collides ? 'copy' : 'overwrite');
  const targetId = mode === 'copy' ? availableProjectId(summary.project_id) : summary.project_id;

  const run = () => {
    try {
      const outcome = applyProjectFile(file, mode);
      onImported(outcome.project_id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed.');
    }
  };

  return (
    <Modal
      title="Import Project / 匯入專案"
      description="Review what the file contains before it is written into this browser."
      width="max-w-lg"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel / 取消
          </Button>
          <Button variant={mode === 'overwrite' && summary.collides ? 'danger' : 'primary'} onClick={run}>
            Import / 匯入
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col">
          <Row label="Project" zh="專案" value={summary.project_name} />
          <Row label="Project ID" zh="專案代號" value={summary.project_id} />
          <Row
            label="Exported"
            zh="匯出時間"
            value={summary.exported_at ? new Date(summary.exported_at).toLocaleString() : 'N/A'}
          />
          <Row label="Written by build" zh="建立版本" value={summary.app_build} />
          <Row label="Scenarios" zh="情境" value={String(summary.scenarios)} />
          <Row label="Components" zh="元件" value={String(summary.components)} />
          <Row
            label="Network"
            zh="網路"
            value={
              summary.nodes === 0 ? 'None' : `${summary.nodes} nodes · ${summary.edges} edges`
            }
          />
          <Row label="Solutions" zh="求解結果" value={String(summary.solutions)} />
          <Row label="Analyses" zh="瓶頸分析" value={String(summary.analyses)} />
        </div>

        {summary.app_build !== BUILD_ID && (
          <p className="rounded border border-warn-500/40 bg-warn-100/50 px-2.5 py-2 text-[11.5px] leading-relaxed text-warn-700">
            This file was written by a different build. It will still load, but re-solve before
            trusting any stored result.
            <span className="block">
              此檔案由不同版本建立，仍可載入，但請重新求解後再採信既有結果。
            </span>
          </p>
        )}

        {summary.collides ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 flex items-center gap-2 text-[11.5px] font-bold text-ink-900">
              A project with this id already exists
              <Badge tone="warn">Conflict / 代號衝突</Badge>
            </legend>
            <label className="flex cursor-pointer items-start gap-2 text-[11.5px] text-ink-700">
              <input
                type="radio"
                name="import-mode"
                className="mt-0.5"
                checked={mode === 'copy'}
                onChange={() => setMode('copy')}
              />
              <span>
                Import as a copy — <span className="font-mono">{targetId}</span>
                <span className="block text-ink-400">
                  匯入為副本，保留現有專案不動。
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-[11.5px] text-ink-700">
              <input
                type="radio"
                name="import-mode"
                className="mt-0.5"
                checked={mode === 'overwrite'}
                onChange={() => setMode('overwrite')}
              />
              <span>
                Overwrite <span className="font-mono">{summary.project_id}</span>
                <span className="block text-danger-600">
                  覆寫現有同代號專案，原資料將無法復原。
                </span>
              </span>
            </label>
          </fieldset>
        ) : (
          <p className="text-[11.5px] text-ink-500">
            No existing project uses this id — it will be added alongside your others.
            <span className="block text-ink-400">目前沒有相同代號的專案，將直接新增。</span>
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Hidden `<input type="file">` driving the Import action. */
export function useProjectFilePicker(onText: (text: string, filename: string) => void) {
  const ref = useRef<HTMLInputElement | null>(null);

  const input = (
    <input
      ref={ref}
      type="file"
      accept=".json,application/json"
      className="hidden"
      onChange={async (event) => {
        const file = event.target.files?.[0];
        // Reset first: picking the same file twice must still fire a change.
        event.target.value = '';
        if (!file) return;
        onText(await file.text(), file.name);
      }}
    />
  );

  return { input, open: () => ref.current?.click() };
}
