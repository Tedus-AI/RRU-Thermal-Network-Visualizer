/**
 * Section A/B — Import Source and Source Detail (02 §5, §6, §7).
 */

import { useRef, useState } from 'react';
import { ClipboardPaste, FileSpreadsheet, FileText, FolderOpen } from 'lucide-react';
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
import { tip } from '@/i18n/componentImportCopy';

type SourceKind = 'project' | 'csv' | 'excel' | 'paste';

const SOURCES: Array<{
  kind: SourceKind;
  icon: LucideIcon;
  title: string;
  zh: string;
  description: string;
  descriptionZh: string;
  cta: string;
}> = [
  {
    kind: 'project',
    icon: FolderOpen,
    title: 'Existing Project',
    zh: '從現有專案匯入',
    description: 'Import components from another project in this tool.',
    descriptionZh: '從本工具的其他專案匯入元件。',
    cta: 'Select Project',
  },
  {
    kind: 'csv',
    icon: FileText,
    title: 'CSV File',
    zh: 'CSV 檔案',
    description: 'Import from a .csv file.',
    descriptionZh: '從 CSV 檔案匯入。',
    cta: 'Choose File',
  },
  {
    kind: 'excel',
    icon: FileSpreadsheet,
    title: 'Excel File',
    zh: 'Excel 檔案',
    description: 'Import from an .xlsx workbook.',
    descriptionZh: '從 Excel 檔案匯入。',
    cta: 'Choose File',
  },
  {
    kind: 'paste',
    icon: ClipboardPaste,
    title: 'Paste Table',
    zh: '貼上表格資料',
    description: 'Paste data from Excel or the clipboard.',
    descriptionZh: '從 Excel 或剪貼簿貼上資料。',
    cta: 'Paste Data',
  },
];

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

  const csvInput = useRef<HTMLInputElement>(null);
  const excelInput = useRef<HTMLInputElement>(null);

  const store = useComponentImportStore();
  const projects = useProjectStore((s) => s.projects);
  const currentProjectId = useProjectStore((s) => s.draft?.project_id);

  const candidates = projects.filter(
    (project) => project.project_id !== currentProjectId && project.status === 'active',
  );

  const handleCsv = async (file: File) => {
    store.setLoading(`Reading ${file.name}…`);
    try {
      const table = await parseCsvFile(file);
      if (table.headers.length === 0) throw new Error('The file contains no rows.');
      store.loadTable(table, {
        source_type: 'CSV',
        source_project_id: null,
        source_project_name: null,
        source_file: file.name,
      });
    } catch (error) {
      store.setError(`Unable to read file: ${(error as Error).message}`);
    }
  };

  const handleExcel = async (file: File, sheet?: string) => {
    if (isLegacyXls(file)) {
      store.setError(
        'Legacy .xls workbooks are not supported. Save the file as .xlsx and try again. / ' +
          '不支援舊版 .xls 格式，請另存為 .xlsx 後再匯入。',
      );
      return;
    }
    store.setLoading(`Reading ${file.name}…`);
    try {
      const table = await parseExcelFile(file, sheet);
      const names = table.sheets ?? [];
      setSheets(names);
      setActiveSheet(table.activeSheet ?? '');
      if (table.headers.length === 0) throw new Error('The selected sheet is empty.');
      store.loadTable(table, {
        source_type: 'Excel',
        source_project_id: null,
        source_project_name: null,
        source_file: `${file.name}${names.length > 1 ? ` — ${table.activeSheet}` : ''}`,
      });
    } catch (error) {
      store.setError(`Unable to read file: ${(error as Error).message}`);
    }
  };

  const handlePaste = () => {
    if (!pasteText.trim()) {
      store.setError('Nothing to parse. Paste tab-separated or CSV-style data first.');
      return;
    }
    store.setLoading('Analyzing columns…');
    try {
      const table = parsePastedTable(pasteText);
      if (table.headers.length === 0) throw new Error('No header row detected.');
      store.loadTable(table, {
        source_type: 'Paste',
        source_project_id: null,
        source_project_name: null,
        source_file: null,
      });
    } catch (error) {
      store.setError(`Unable to parse table: ${(error as Error).message}`);
    }
  };

  const handleProject = () => {
    const project = candidates.find((p) => p.project_id === sourceProjectId);
    if (!project) {
      store.setError('Select a source project first.');
      return;
    }
    store.setLoading('Loading source project…');
    try {
      const table = parseExistingProject(project.project_id, {
        categories: scopeCategories,
        includeHidden,
      });
      if (table.rows.length === 0) {
        throw new Error('The selected project has no components in the chosen scope.');
      }
      store.loadTable(table, {
        source_type: 'ExistingProject',
        source_project_id: project.project_id,
        source_project_name: project.project_name,
        source_file: null,
      });
    } catch (error) {
      store.setError(`Unable to load source project: ${(error as Error).message}`);
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
    <SectionCard step={1} title="Import Source" subtitle="匯入來源">
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
              className={`flex flex-col items-start gap-2 rounded-lg border p-3.5 text-left transition-colors ${
                selected
                  ? 'border-accent-600 bg-accent-50 ring-1 ring-accent-600/30'
                  : 'border-line bg-surface hover:border-ink-400'
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon size={18} className={selected ? 'text-accent-600' : 'text-ink-400'} />
                <span className="leading-tight">
                  <span className="block text-[13px] font-bold text-ink-900">{source.title}</span>
                  <span className="block text-[11px] text-ink-400">{source.zh}</span>
                </span>
              </span>
              <span className="text-[12px] leading-relaxed text-ink-500">
                {source.description}
                <span className="block text-ink-400">{source.descriptionZh}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Section B — Source Detail */}
      {kind && (
        <div className="mt-4 rounded-lg border border-line bg-surface-muted p-4">
          {kind === 'project' && (
            <div className="flex flex-col gap-3">
              <div className="max-w-md">
                <FieldLabel
                  label="Source Project"
                  zh="來源專案"
                  htmlFor="src-project"
                  tooltip={tip('Import Source')}
                />
                <select
                  id="src-project"
                  value={sourceProjectId}
                  onChange={(event) => setSourceProjectId(event.target.value)}
                  className="mt-1.5 h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-[13px]"
                >
                  <option value="">— Select a project —</option>
                  {candidates.map((project) => (
                    <option key={project.project_id} value={project.project_id}>
                      {project.project_name}
                    </option>
                  ))}
                </select>
                {candidates.length === 0 && (
                  <p className="mt-1.5 text-[12px] text-warn-600">
                    No other projects available to import from. / 沒有其他可匯入的專案。
                  </p>
                )}
              </div>

              {summary && (
                <dl className="tabular flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-500">
                  <span>
                    <dt className="inline">Last Updated / 最後更新: </dt>
                    <dd className="inline font-semibold text-ink-700">
                      {summary.last_updated.slice(0, 10)}
                    </dd>
                  </span>
                  <span>
                    <dt className="inline">RF: </dt>
                    <dd className="inline font-semibold text-ink-700">{summary.rf_count}</dd>
                  </span>
                  <span>
                    <dt className="inline">Digital: </dt>
                    <dd className="inline font-semibold text-ink-700">{summary.digital_count}</dd>
                  </span>
                  <span>
                    <dt className="inline">Power: </dt>
                    <dd className="inline font-semibold text-ink-700">{summary.power_count}</dd>
                  </span>
                </dl>
              )}

              <fieldset>
                <legend className="mb-1.5 text-[12px] font-semibold text-ink-700">
                  Import Scope / 匯入範圍
                </legend>
                <div className="flex flex-wrap gap-3">
                  {COMPONENT_CATEGORIES.map((category) => (
                    <label
                      key={category}
                      className="flex items-center gap-1.5 text-[13px] text-ink-700"
                    >
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
                      {category}
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5 text-[13px] text-ink-500">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-accent-600)]"
                      checked={includeHidden}
                      onChange={(event) => setIncludeHidden(event.target.checked)}
                    />
                    Hidden / Excluded
                  </label>
                </div>
              </fieldset>

              <div>
                <Button variant="primary" disabled={!sourceProjectId} onClick={handleProject}>
                  Load Components / 載入元件
                </Button>
              </div>
            </div>
          )}

          {kind === 'csv' && (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-ink-500">
                Supported: .csv — comma, semicolon or tab separated. Max 500 rows recommended.
                <span className="block text-ink-400">支援 .csv，建議 500 列以內。</span>
              </p>
              <input
                ref={csvInput}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleCsv(file);
                }}
              />
              <div>
                <Button variant="primary" onClick={() => csvInput.current?.click()}>
                  Choose File / 選擇檔案
                </Button>
              </div>
            </div>
          )}

          {kind === 'excel' && (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-ink-500">
                Supported: .xlsx. Legacy .xls must be re-saved as .xlsx.
                <span className="block text-ink-400">支援 .xlsx；舊版 .xls 請另存新檔。</span>
              </p>
              <input
                ref={excelInput}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setExcelFile(file);
                  void handleExcel(file);
                }}
              />
              <div className="flex flex-wrap items-end gap-3">
                <Button variant="primary" onClick={() => excelInput.current?.click()}>
                  Choose File / 選擇檔案
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
                  Parse Table / 解析表格
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
