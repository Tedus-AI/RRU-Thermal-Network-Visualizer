/**
 * Source detail for an AI-Thermal project (02 §6, extended).
 *
 * Reads the AI-Thermal tool's shared `thermal_db.json` — from SharePoint with the
 * same Microsoft sign-in this tool already uses, or from a local copy (AI-Thermal's
 * offline database or a "💾 備份資料庫" download) — lists its projects, and turns
 * the chosen one into a ParsedTable (`parseAiThermal.ts`). From there it is the
 * ordinary import: mapping, review, duplicates, apply.
 *
 * Read only, always. The database belongs to AI-Thermal and 5G-RRU, which share
 * an edit lock this tool does not take part in.
 */

import { useRef, useState } from 'react';
import { Cloud, FileJson, RefreshCw } from 'lucide-react';

import { Button, Select } from '@/ui/primitives';
import { useComponentImportStore } from '@/data/componentImportStore';
import { useProjectStore } from '@/data/projectStore';
import { readAiThermalDb, sharePoint } from '@/data/sharepoint';
import { defaultMaterials } from '@/domain/materials';
import {
  AI_THERMAL_DB_PATH,
  AI_THERMAL_LISTS,
  listAiThermalProjects,
  parseAiThermalDb,
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
  '名稱、分類、數量、功耗、限溫與限溫對象',
  'Rjc（Rjc = 0 的元件改為本體型熱源）',
  '散熱路徑、元件大小與高度、E-PAD',
  'PCB 板厚（板級導熱孔）',
  'TIM 材料與壓合厚度、備註',
  '凸台大小（在 04 選「凸台」時自動帶入）',
];
const STILL_04 = '封裝型式、接合方式、擴散範圍、本體型元件的量測位置，以及 AI-Thermal 沒有指定的限溫對象與散熱路徑。';

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

  const adopt = (raw: unknown, label: string) => {
    const db = parseAiThermalDb(raw);
    if (!db) throw new Error('這不是 AI-Thermal 的資料庫檔（找不到 projects）。');
    const projects = listAiThermalProjects(db);
    setLoaded({ db, label, at: new Date().toLocaleString('zh-TW', { hour12: false }) });
    setProjectId((current) => (projects.some((p) => p.id === current) ? current : ''));
    setMessage(projects.length === 0 ? { tone: 'info', text: '資料庫裡還沒有任何專案。' } : null);
  };

  const readSharePoint = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // A popup only from this click, never on its own.
      if (!(await sharePoint.canUseSilently())) {
        const signed = await sharePoint.signIn();
        if (!signed.ok) {
          setMessage({
            tone: 'error',
            text:
              signed.reason === 'cancelled'
                ? '已取消登入。'
                : signed.reason === 'popup'
                  ? '瀏覽器擋下了登入視窗，請允許此網站的彈出視窗後再試一次。'
                  : `無法登入 Microsoft：${signed.error ?? ''}`,
          });
          return;
        }
      }
      const raw = await readAiThermalDb(AI_THERMAL_DB_PATH);
      if (raw == null) {
        setMessage({ tone: 'error', text: `SharePoint 上找不到 AI-Thermal 的資料庫（${AI_THERMAL_DB_PATH}）。` });
        return;
      }
      adopt(raw, `SharePoint：${AI_THERMAL_DB_PATH}`);
    } catch (error) {
      setMessage({ tone: 'error', text: `讀不到 AI-Thermal 的資料庫：${(error as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      adopt(JSON.parse(await file.text()) as unknown, `本機檔案：${file.name}`);
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof SyntaxError
            ? `「${file.name}」不是有效的 JSON 檔。`
            : (error as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  const projects = loaded ? listAiThermalProjects(loaded.db) : [];
  const summary = projects.find((p) => p.id === projectId) ?? null;
  const inScope = summary
    ? lists.reduce((sum, key) => sum + summary.counts[key] - (includeExcluded ? 0 : summary.excludedBy[key]), 0)
    : 0;

  const load = () => {
    if (!loaded || !summary) return;
    store.setLoading('讀取 AI-Thermal 專案…');
    try {
      const table = parseAiThermalProject(loaded.db, summary.id, { lists, includeExcluded }, materials);
      if (table.rows.length === 0) throw new Error('這個專案在所選範圍內沒有元件。');
      store.loadTable(table, {
        source_type: 'AIThermal',
        source_project_id: summary.id,
        source_project_name: summary.name,
        source_file: loaded.label,
      });
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

          <div className="grid gap-3 rounded-md border border-line bg-surface p-3 text-[12px] leading-relaxed sm:grid-cols-2">
            <div>
              <p className="font-semibold text-ink-700">會帶入</p>
              <ul className="mt-1 list-disc pl-4 text-ink-500">
                {CARRIES.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-ink-700">還要在 04 補</p>
              <p className="mt-1 text-ink-500">{STILL_04}</p>
              <p className="mt-2 text-ink-400">
                AI-Thermal 的元件類型、常溫功耗、TIM 型號、Thermal Via 孔徑與數量保留在元件的「來源」分頁。
              </p>
            </div>
          </div>

          <div>
            <Button variant="primary" disabled={!summary || lists.length === 0 || inScope === 0} onClick={load}>
              載入元件{summary ? `（${inScope} 顆）` : ''}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
