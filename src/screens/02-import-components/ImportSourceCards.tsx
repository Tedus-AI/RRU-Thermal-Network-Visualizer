/**
 * Step 1 — the source and its detail (02 §5, §6, §7).
 */

import { useRef, useState } from 'react';
import { ClipboardPaste, Database, FileSpreadsheet, FolderOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button, SectionCard, Select, TextArea } from '@/ui/primitives';
import { FieldLabel } from '@/ui/FieldLabel';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@/domain/component';
import { useComponentImportStore } from '@/data/componentImportStore';
import { useProjectStore } from '@/data/projectStore';
import { parseCsvFile, parsePastedTable } from '@/importers/component/parseTable';
import { isLegacyXls, parseExcelFile } from '@/importers/component/parseExcel';
import {
  parseExistingProject,
  summarizeSourceProject,
} from '@/importers/component/parseExistingProject';
import { AiThermalSourcePanel } from './AiThermalSourcePanel';

type SourceKind = 'aithermal' | 'project' | 'file' | 'paste';

/**
 * Four sources, one line each. CSV and Excel are one card: both are a file the
 * engineer already has, and the extension says which reader to use.
 */
const SOURCES: Array<{ kind: SourceKind; icon: LucideIcon; title: string; description: string }> = [
  // First: the usual start is a project AI-Thermal already holds.
  { kind: 'aithermal', icon: Database, title: 'AI-Thermal 專案', description: '讀 AI-Thermal 建好的專案（SharePoint 或本機備份檔）' },
  { kind: 'project', icon: FolderOpen, title: '本工具其他專案', description: '從這個工具的另一個專案複製元件' },
  { kind: 'file', icon: FileSpreadsheet, title: 'Excel 或 CSV 檔', description: '.xlsx 或 .csv，第一列是欄位標題' },
  { kind: 'paste', icon: ClipboardPaste, title: '貼上表格', description: '從 Excel 複製後貼上' },
];

const CATEGORY_LABEL: Record<ComponentCategory, string> = {
  RF: 'RF',
  Digital: 'Digital',
  Power: 'Power',
  Filter: 'Filter',
  Other: 'Other',
};

export function ImportSourceCards() {
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [sourceProjectId, setSourceProjectId] = useState('');
  const [scopeCategories, setScopeCategories] = useState<ComponentCategory[]>([
    'RF',
    'Digital',
    'Power',
    'Filter',
    'Other',
  ]);
  const [includeHidden, setIncludeHidden] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);

  const store = useComponentImportStore();
  const projects = useProjectStore((s) => s.projects);
  const currentProjectId = useProjectStore((s) => s.draft?.project_id);

  const candidates = projects.filter(
    (project) => project.project_id !== currentProjectId && project.status === 'active',
  );

  const handleCsv = async (file: File) => {
    store.setLoading(`讀取 ${file.name}…`);
    try {
      const table = await parseCsvFile(file);
      if (table.headers.length === 0) throw new Error('檔案裡沒有資料。');
      store.loadTable(table, {
        source_type: 'CSV',
        source_project_id: null,
        source_project_name: null,
        source_file: file.name,
      });
    } catch (error) {
      store.setError(`讀不到檔案：${(error as Error).message}`);
    }
  };

  const handleExcel = async (file: File, sheet?: string) => {
    if (isLegacyXls(file)) {
      store.setError('不支援舊版 .xls 格式，請另存為 .xlsx 後再匯入。');
      return;
    }
    store.setLoading(`讀取 ${file.name}…`);
    try {
      const table = await parseExcelFile(file, sheet);
      const names = table.sheets ?? [];
      setSheets(names);
      setActiveSheet(table.activeSheet ?? '');
      if (table.headers.length === 0) throw new Error('這個工作表是空的。');
      store.loadTable(table, {
        source_type: 'Excel',
        source_project_id: null,
        source_project_name: null,
        source_file: `${file.name}${names.length > 1 ? ` — ${table.activeSheet}` : ''}`,
      });
    } catch (error) {
      store.setError(`讀不到檔案：${(error as Error).message}`);
    }
  };

  /** One picker for both: the extension decides the reader. */
  const handleFile = (file: File) => {
    if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
      setExcelFile(null);
      setSheets([]);
      void handleCsv(file);
      return;
    }
    setExcelFile(file);
    void handleExcel(file);
  };

  const handlePaste = () => {
    if (!pasteText.trim()) {
      store.setError('沒有可解析的內容，請先貼上 tab 或逗號分隔的資料。');
      return;
    }
    store.setLoading('分析欄位中…');
    try {
      const table = parsePastedTable(pasteText);
      if (table.headers.length === 0) throw new Error('找不到欄位標題列。');
      store.loadTable(table, {
        source_type: 'Paste',
        source_project_id: null,
        source_project_name: null,
        source_file: null,
      });
    } catch (error) {
      store.setError(`無法解析表格：${(error as Error).message}`);
    }
  };

  const handleProject = () => {
    const project = candidates.find((p) => p.project_id === sourceProjectId);
    if (!project) {
      store.setError('請先選擇來源專案。');
      return;
    }
    store.setLoading('讀取來源專案…');
    try {
      const table = parseExistingProject(project.project_id, {
        categories: scopeCategories,
        includeHidden,
      });
      if (table.rows.length === 0) {
        throw new Error('這個專案在所選範圍內沒有元件。');
      }
      store.loadTable(table, {
        source_type: 'ExistingProject',
        source_project_id: project.project_id,
        source_project_name: project.project_name,
        source_file: null,
      });
    } catch (error) {
      store.setError(`無法讀取來源專案：${(error as Error).message}`);
    }
  };

  const summary =
    kind === 'project' && sourceProjectId
      ? summarizeSourceProject(
          sourceProjectId,
          candidates.find((p) => p.project_id === sourceProjectId)?.project_name ?? '',
          candidates.find((p) => p.project_id === sourceProjectId)?.meta.updated_at ?? '',
        )
      : null;

  return (
    <SectionCard title="選擇來源">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SOURCES.map((source) => {
          const Icon = source.icon;
          const selected = kind === source.kind;
          return (
            <button
              key={source.kind}
              type="button"
              aria-pressed={selected}
              onClick={() => setKind(source.kind)}
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                selected
                  ? 'border-accent-600 bg-accent-50 ring-1 ring-accent-600/30'
                  : 'border-line bg-surface hover:border-ink-400'
              }`}
            >
              <Icon size={18} className={`mt-px shrink-0 ${selected ? 'text-accent-600' : 'text-ink-400'}`} />
              <span className="leading-snug">
                <span className="block text-[13px] font-bold text-ink-900">{source.title}</span>
                <span className="block text-[12px] text-ink-500">{source.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Source detail */}
      {kind && (
        <div className="mt-4 rounded-lg border border-line bg-surface-muted p-4">
          {kind === 'aithermal' && <AiThermalSourcePanel />}

          {kind === 'project' && (
            <div className="flex flex-col gap-3">
              <div className="max-w-md">
                <FieldLabel label="Source Project" zh="來源專案" htmlFor="src-project" />
                <select
                  id="src-project"
                  value={sourceProjectId}
                  onChange={(event) => setSourceProjectId(event.target.value)}
                  className="mt-1.5 h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-[13px]"
                >
                  <option value="">— 選擇專案 —</option>
                  {candidates.map((project) => (
                    <option key={project.project_id} value={project.project_id}>
                      {project.project_name}
                    </option>
                  ))}
                </select>
                {candidates.length === 0 && (
                  <p className="mt-1.5 text-[12px] text-warn-600">沒有其他可匯入的專案。</p>
                )}
              </div>

              {summary && (
                <p className="tabular text-[12px] text-ink-500">
                  RF {summary.rf_count}・Digital {summary.digital_count}・Power {summary.power_count}
                  {summary.last_updated && <> ・最後更新 {summary.last_updated.slice(0, 10)}</>}
                </p>
              )}

              <fieldset>
                <legend className="mb-1.5 text-[12px] font-semibold text-ink-700">匯入範圍</legend>
                <div className="flex flex-wrap gap-3">
                  {COMPONENT_CATEGORIES.map((category) => (
                    <label key={category} className="flex items-center gap-1.5 text-[13px] text-ink-700">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-accent-600)]"
                        checked={scopeCategories.includes(category)}
                        onChange={(event) =>
                          setScopeCategories((previous) =>
                            event.target.checked
                              ? [...previous, category]
                              : previous.filter((c) => c !== category),
                          )
                        }
                      />
                      {CATEGORY_LABEL[category]}
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5 text-[13px] text-ink-500">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-accent-600)]"
                      checked={includeHidden}
                      onChange={(event) => setIncludeHidden(event.target.checked)}
                    />
                    包含停用的元件
                  </label>
                </div>
              </fieldset>

              <div>
                <Button variant="primary" disabled={!sourceProjectId} onClick={handleProject}>
                  載入元件
                </Button>
              </div>
            </div>
          )}

          {kind === 'file' && (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-ink-500">
                .xlsx 或 .csv（逗號、分號或 tab 分隔），建議 500 列以內；舊版 .xls 請先另存為 .xlsx。
              </p>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) handleFile(file);
                }}
              />
              <div className="flex flex-wrap items-end gap-3">
                <Button variant="primary" onClick={() => fileInput.current?.click()}>
                  選擇檔案
                </Button>
                {sheets.length > 1 && excelFile && (
                  <div className="w-56">
                    <FieldLabel label="Sheet" zh="工作表" htmlFor="excel-sheet" />
                    <Select
                      id="excel-sheet"
                      className="mt-1.5"
                      options={sheets}
                      value={activeSheet}
                      onChange={(event) => {
                        setActiveSheet(event.target.value);
                        void handleExcel(excelFile, event.target.value);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {kind === 'paste' && (
            <div className="flex flex-col gap-3">
              <FieldLabel
                label="Paste Table"
                zh="貼上表格"
                htmlFor="paste-area"
                tooltip="可貼上 Excel 複製的 tab 分隔資料，或 CSV 格式文字。第一列必須是欄位標題。"
              />
              <TextArea
                id="paste-area"
                rows={6}
                className="font-mono text-[12px]"
                placeholder={'Component\tQty\tPower(W)\tR_jc\nFinal PA\t4\t52.13\t0.35'}
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
              />
              <div>
                <Button variant="primary" onClick={handlePaste}>
                  解析表格
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
