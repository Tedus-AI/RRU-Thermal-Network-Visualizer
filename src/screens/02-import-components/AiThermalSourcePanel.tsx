/**
 * Source detail for an AI-Thermal project (02 §6, extended).
 *
 * Reads the AI-Thermal tool's shared `thermal_db.json` — from SharePoint with the
 * same Microsoft sign-in this tool already uses, or from a local copy (AI-Thermal's
 * offline database or a "💾 備份資料庫" download) — lists its projects, and turns
 * the chosen one into a ParsedTable (`parseAiThermal.ts`). From there it is the
 * ordinary import, straight to the check step (the columns are this tool's own).
 * The project document and a re-parse go along with it: the check step offers
 * 5G-RRU's parameter console to 01, and a material changed there re-reads the
 * rows (`ImportSourceContext`).
 *
 * Read only, always. The database belongs to AI-Thermal and 5G-RRU, which share
 * an edit lock this tool does not take part in.
 */

import { useRef, useState } from 'react';
import { Cloud, FileJson, RefreshCw } from 'lucide-react';

import { Button, Select } from '@/ui/primitives';
import { useComponentImportStore } from '@/data/componentImportStore';
import { useProjectStore } from '@/data/projectStore';
import { readAiThermalFromFile, readAiThermalFromSharePoint, type AiDbRead } from '@/data/aiThermalDb';
import { defaultMaterials } from '@/domain/materials';
import {
  AI_THERMAL_LISTS,
  listAiThermalProjects,
  parseAiThermalProject,
  type AiThermalDb,
  type AiThermalList,
} from '@/importers/component/parseAiThermal';

type Origin = 'sharepoint' | 'file';

interface Loaded {
  db: AiThermalDb;
  /** Where it came from, as the 來源 tab will show it. */
  label: string;
  at: string;
}

const LIST_LABEL: Record<AiThermalList, string> = { RF: 'RF', Digital: 'Digital', PWR: 'PWR' };

/** What arrives and what Screen 04 still asks for — kept in step with `parseAiThermal.ts`. */
const CARRIES = [
  '名稱、分類、數量、功耗、限溫',
  '限溫對象 Tj／Tc（當作已確認；要改請回 AI-Thermal 改，再重新匯入）',
  'Rjc（Rjc = 0 的元件改為本體型熱源）',
  '散熱路徑、元件大小與高度、E-PAD',
  'PCB 板厚（板級導熱孔）',
  'Thermal Via 計算的等效 k（該元件自訂；沒有 via 設計的用 01 通用值）',
  'TIM 材料與壓合厚度、備註',
  '凸台大小（在 04 選「凸台」時自動帶入）',
];
const STILL_04 = ['封裝型式', '接合方式', '擴散範圍', '本體型元件的量測位置'];

export function AiThermalSourcePanel() {
  const [origin, setOrigin] = useState<Origin>('sharepoint');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [projectId, setProjectId] = useState('');
  const [lists, setLists] = useState<AiThermalList[]>(['RF', 'Digital', 'PWR']);
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const store = useComponentImportStore();
  const materials = useProjectStore((s) => s.draft?.materials) ?? defaultMaterials();

  const adopt = (read: AiDbRead) => {
    if (!read.ok) {
      setMessage({ tone: 'error', text: read.message });
      return;
    }
    const projects = listAiThermalProjects(read.db);
    setLoaded({ db: read.db, label: read.label, at: new Date().toLocaleString('zh-TW', { hour12: false }) });
    setProjectId((current) => (projects.some((p) => p.id === current) ? current : ''));
    setMessage(projects.length === 0 ? { tone: 'info', text: '資料庫裡還沒有任何專案。' } : null);
  };

  const read = async (reading: Promise<AiDbRead>) => {
    setBusy(true);
    setMessage(null);
    try {
      adopt(await reading);
    } finally {
      setBusy(false);
    }
  };
  // A popup only from this click, never on its own.
  const readSharePoint = () => read(readAiThermalFromSharePoint(true));
  const readFile = (file: File) => read(readAiThermalFromFile(file));

  const projects = loaded ? listAiThermalProjects(loaded.db) : [];
  const summary = projects.find((p) => p.id === projectId) ?? null;
  const inScope = summary
    ? lists.reduce((sum, key) => sum + summary.counts[key] - (includeExcluded ? 0 : summary.excludedBy[key]), 0)
    : 0;

  const load = () => {
    if (!loaded || !summary) return;
    store.setLoading('讀取 AI-Thermal 專案…');
    try {
      const { db } = loaded;
      const scope = { lists, includeExcluded };
      const table = parseAiThermalProject(db, summary.id, scope, materials);
      if (table.rows.length === 0) throw new Error('這個專案在所選範圍內沒有元件。');
      store.loadTable(
        table,
        {
          source_type: 'AIThermal',
          source_project_id: summary.id,
          source_project_name: summary.name,
          source_file: loaded.label,
          source_saved_at: summary.updated || null,
        },
        {
          aiThermalProject: db.projects[summary.id],
          reparse: (next) => parseAiThermalProject(db, summary.id, scope, next),
        },
      );
    } catch (error) {
      store.setError(`無法載入 AI-Thermal 專案：${(error as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Where the database is read from. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-md border border-line-strong bg-surface" role="radiogroup" aria-label="資料庫來源">
          {(
            [
              ['sharepoint', 'SharePoint 共用資料庫'],
              ['file', '本機檔案'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={origin === value}
              onClick={() => setOrigin(value)}
              className={`h-8 px-3 text-[12.5px] ${
                origin === value ? 'bg-accent-600 font-semibold text-white' : 'text-ink-700 hover:bg-surface-muted'
              } ${value === 'file' ? 'border-l border-line' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
        {origin === 'sharepoint' ? (
          <Button
            variant={loaded ? 'secondary' : 'primary'}
            icon={loaded ? <RefreshCw size={14} /> : <Cloud size={14} />}
            disabled={busy}
            onClick={() => void readSharePoint()}
          >
            {busy ? '讀取中…' : loaded ? '重新讀取' : '從 SharePoint 讀取'}
          </Button>
        ) : (
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void readFile(file);
              }}
            />
            <Button
              variant={loaded ? 'secondary' : 'primary'}
              icon={<FileJson size={14} />}
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {busy ? '讀取中…' : '選擇 thermal_db.json'}
            </Button>
          </>
        )}
      </div>
      <p className="-mt-2 text-[12px] text-ink-500">
        {origin === 'sharepoint'
          ? '用本工具的 Microsoft 登入，唯讀 AI-Thermal 的共用資料庫，不會改到 AI-Thermal 或 5G-RRU 的資料。'
          : '可選 AI-Thermal 的離線資料庫，或「💾 備份資料庫」下載的檔案。'}
      </p>

      {message && (
        <p className={`text-[12.5px] ${message.tone === 'error' ? 'text-danger-600' : 'text-ink-500'}`}>
          {message.text}
        </p>
      )}

      {loaded && projects.length > 0 && (
        <>
          <p className="text-[12px] text-ink-400">
            已讀取 {loaded.label}・{projects.length} 個專案・{loaded.at}
          </p>

          <div className="max-w-md">
            <label htmlFor="ait-project" className="text-[12px] font-semibold text-ink-700">
              AI-Thermal 專案
            </label>
            <Select
              id="ait-project"
              className="mt-1.5"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              items={[
                { value: '', label: '— 選擇專案 —' },
                ...projects.map((p) => ({
                  value: p.id,
                  label: `${p.name}（RF ${p.counts.RF}・Digital ${p.counts.Digital}・PWR ${p.counts.PWR}）`,
                })),
              ]}
            />
          </div>

          {summary && (
            <dl className="tabular flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-500">
              <div>
                <dt className="inline">PCB 板厚：</dt>
                <dd className="inline font-semibold text-ink-700">
                  {AI_THERMAL_LISTS.map(({ key }) => `${LIST_LABEL[key]} ${summary.pcb[key] != null ? `${summary.pcb[key]} mm` : '未設定'}`).join('・')}
                </dd>
              </div>
              {summary.excluded > 0 && (
                <div>
                  <dt className="inline">5G-RRU 已排除：</dt>
                  <dd className="inline font-semibold text-ink-700">{summary.excluded} 顆</dd>
                </div>
              )}
              {summary.updated && (
                <div>
                  <dt className="inline">最後儲存：</dt>
                  <dd className="inline font-semibold text-ink-700">{summary.updated.slice(0, 10)}</dd>
                </div>
              )}
            </dl>
          )}

          <fieldset>
            <legend className="mb-1.5 text-[12px] font-semibold text-ink-700">匯入範圍</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {AI_THERMAL_LISTS.map(({ key }) => (
                <label key={key} className="flex items-center gap-1.5 text-[13px] text-ink-700">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-accent-600)]"
                    checked={lists.includes(key)}
                    onChange={(event) =>
                      setLists((previous) =>
                        event.target.checked ? [...previous, key] : previous.filter((k) => k !== key),
                      )
                    }
                  />
                  {LIST_LABEL[key]}
                  {summary && <span className="tabular text-ink-400">{summary.counts[key]}</span>}
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-[13px] text-ink-500">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent-600)]"
                  checked={includeExcluded}
                  onChange={(event) => setIncludeExcluded(event.target.checked)}
                />
                包含 5G-RRU 已排除的元件（匯入後為停用）
              </label>
            </div>
          </fieldset>

          {/* One line; the lists only on request. */}
          <details className="group text-[12px] text-ink-500">
            <summary className="w-fit cursor-pointer list-none text-ink-600 hover:text-accent-700">
              會帶入 {CARRIES.length} 項・04 還要補 {STILL_04.length} 項
              <span className="ml-1 text-ink-400 group-open:hidden">（展開）</span>
            </summary>
            <div className="mt-2 grid gap-3 rounded-md border border-line bg-surface p-3 leading-relaxed sm:grid-cols-2">
              <div>
                <p className="font-semibold text-ink-700">會帶入</p>
                <ul className="mt-1 list-disc pl-4">
                  {CARRIES.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-ink-700">還要在 04 補</p>
                <p className="mt-1">{STILL_04.join('、')}，以及 AI-Thermal 沒有指定的散熱路徑。</p>
                <p className="mt-2 text-ink-400">
                  AI-Thermal 管的欄位在 04 顯示成參照值、要改回 AI-Thermal 改；04 的「從 AI-Thermal 更新」會帶回之後的修改。
                  元件類型、限溫對象的判定、常溫功耗、TIM 型號、Thermal Via 孔徑、數量與等效 k 的說明保留在「來源」分頁。
                </p>
              </div>
            </div>
          </details>

          <div>
            <Button variant="primary" disabled={!summary || lists.length === 0 || inScope === 0} onClick={load}>
              載入{summary ? ` ${inScope} 種` : ''}元件
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
