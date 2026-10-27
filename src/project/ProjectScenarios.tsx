/**
 * Section B — 情境 (01 §8 Default Scenario + scenario management).
 *
 * One table instead of two cards: the scenario list, with the active row's
 * cells as the inputs. They used to be a separate form above the list that
 * edited the same row, so every value was on screen twice.
 *
 * Screen 01 owns project scenarios. Screen 06 owns the active scenario's
 * boundary-condition set and mirrors the shared environmental defaults typed
 * here (ambient, wind, solar) — the sync below is unchanged.
 */

import { Copy, Plus, Trash2 } from 'lucide-react';

import { windRecordedOnly } from '@/thermal/boundary/wind';
import { Button, NumberInput, SectionCard, Select, TextInput } from '@/ui/primitives';
import { SCENARIO_LIMITS, type Scenario } from '@/domain/project';
import { POWER_BASES, POWER_BASIS_LABEL, powerBasisOf, type PowerBasis } from '@/domain/powerBasis';
import { patchScenarioValues } from './scenarioEnvironment';
import { AI_KEY, baselineOf, rruAmbientMismatch } from '@/domain/projectAiLink';
import { useProjectStore } from '@/data/projectStore';
import { ProjectAiBox, ProjectAiUnlockedNote, useProjectAiLock } from './ProjectAiLocked';
import { useFormTouch, useSectionAlert, useVisibleError } from './formTouch';

/** The fields this section can fail validation on — see `useSectionAlert`. */
const SCENARIO_FIELDS = [
  'scenario_name',
  'ambient_C',
  'wind_mps',
  'solar_W_m2',
  'power_scale',
] as const;

type NumericField = 'ambient_C' | 'wind_mps' | 'solar_W_m2' | 'power_scale';

// Input widths are `!`: the control base carries `w-full`, which otherwise wins.
const COLUMNS: Array<{ field: NumericField; label: string; unit?: string; step: number; input: string }> = [
  { field: 'ambient_C', label: '環境溫度', unit: '°C', step: 0.1, input: '!w-24' },
  { field: 'wind_mps', label: '風速', unit: 'm/s', step: 0.1, input: '!w-16' },
  { field: 'solar_W_m2', label: '日照', unit: 'W/m²', step: 10, input: '!w-16' },
  { field: 'power_scale', label: '功耗倍率', step: 0.05, input: '!w-14' },
];

/** Column width; the power scale shares one column with the power basis it multiplies. */
function columnWidth(field: NumericField, ambientLocked: boolean): string {
  if (field === 'ambient_C') return ambientLocked ? 'w-40' : 'w-28';
  if (field === 'power_scale') return 'w-[11rem]';
  return 'w-20';
}

function format(field: NumericField, value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (field === 'solar_W_m2') return value.toFixed(0);
  if (field === 'power_scale') return value.toFixed(2);
  return value.toFixed(1);
}

const WIND_NOTE = '風速僅記錄：目前都是自然對流，求解不套用風速。';

const BASIS_TITLE =
  '每顆元件用哪一個功耗求解：高溫 Pd＝04 的單顆功耗（AI-Thermal 的高溫條件）；常溫 Pd＝04 的常溫功耗（AI-Thermal 的 Pd@25°C），沒填的元件暫用高溫 Pd。';
const BASIS_ITEMS = POWER_BASES.map((basis) => ({ value: basis, label: POWER_BASIS_LABEL[basis] }));

/**
 * Marks a wind speed the solve will not apply (see `windRecordedOnly`); the
 * line under the table says what the mark means. A mark rather than a word, so
 * the cell does not change width while the value is being typed.
 */
function WindMark({ wind, reserve = false }: { wind: number; reserve?: boolean }) {
  const shown = windRecordedOnly(wind);
  // Beside an input the space is kept either way, so typing a first non-zero
  // digit does not shift the cell under the cursor.
  if (!shown && !reserve) return null;
  return (
    <span
      className="inline-block w-3 shrink-0 text-center text-[12px] font-bold text-warn-600"
      title={shown ? WIND_NOTE : undefined}
      aria-label={shown ? WIND_NOTE : undefined}
    >
      {shown ? '※' : ''}
    </span>
  );
}

export function ProjectScenarios({
  scenarios,
  scenario,
  errors,
  readOnly,
  onSelect,
  onCreate,
  onCopyFrom,
  onDelete,
}: {
  scenarios: Scenario[];
  /** The scenario being edited: the active one, or the first. */
  scenario: Scenario | null;
  errors: Record<string, string>;
  readOnly: boolean;
  onSelect: (scenarioId: string) => void;
  onCreate: () => void;
  onCopyFrom: (scenarioId: string) => void;
  onDelete: (scenarioId: string) => void;
}) {
  const touch = useFormTouch((s) => s.touch);
  const visibleError = useVisibleError(errors);
  const alert = useSectionAlert(errors, SCENARIO_FIELDS);
  // The Baseline's ambient follows the linked AI-Thermal project (`projectAiLink.ts`).
  const ambientLock = useProjectAiLock(AI_KEY.ambient);
  const baselineId = baselineOf(scenarios)?.id ?? null;
  const mismatch = useProjectStore((s) => (s.draft ? rruAmbientMismatch(s.draft) : null));

  const patch = (values: Partial<Scenario>) => {
    if (!scenario) return;
    for (const field of Object.keys(values)) touch(field === 'name' ? 'scenario_name' : field);
    patchScenarioValues(scenario.id, values);
  };

  // Empty input must not silently become 0 — keep NaN so validation can report it.
  const numeric = (value: string) => (value === '' ? Number.NaN : Number(value));

  const visible = SCENARIO_FIELDS.map((field) => visibleError(field)).filter(
    (message): message is string => Boolean(message),
  );

  return (
    <div id="scenario-settings" className="scroll-mt-4">
      <SectionCard
        title="情境"
        collapsible
        alert={alert}
        summary={
          scenario
            ? `目前：${scenario.name} · ${format('ambient_C', scenario.ambient_C)} °C${powerBasisOf(scenario) === 'rt' ? ` · ${POWER_BASIS_LABEL.rt}` : ''} · 共 ${scenarios.length} 個`
            : '首次建立專案時自動建立'
        }
        actions={
          <Button
            variant="secondary"
            className="h-8"
            disabled={readOnly || !scenario}
            icon={<Plus size={13} />}
            title="以目前情境為底新增一個情境"
            onClick={onCreate}
          >
            新增情境
          </Button>
        }
      >
        {!scenario ? (
          <p className="text-[13px] text-ink-500">首次建立專案時會自動建立基準情境。</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[700px] border-collapse text-[13px]">
                <thead className="bg-surface-muted">
                  <tr className="text-left text-[12px] text-ink-500">
                    <th className="px-2.5 py-2 font-semibold">名稱</th>
                    {COLUMNS.map((column) => (
                      <th
                        key={column.field}
                        className={`${columnWidth(column.field, !!ambientLock?.locked)} px-2.5 py-2 text-right font-semibold`}
                        title={column.field === 'power_scale' ? BASIS_TITLE : undefined}
                      >
                        {column.field === 'power_scale' ? (
                          <>
                            功耗 <span className="font-normal text-ink-400">× 倍率</span>
                          </>
                        ) : (
                          <>
                            {column.label}
                            {column.unit && (
                              <span className="ml-0.5 font-normal text-ink-400">({column.unit})</span>
                            )}
                          </>
                        )}
                      </th>
                    ))}
                    <th className="w-14 px-2.5 py-2">
                      <span className="sr-only">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((row) => {
                    const isActive = row.id === scenario.id;
                    const editable = isActive && !readOnly;
                    return (
                      <tr
                        key={row.id}
                        className={`border-t border-line ${isActive ? 'bg-accent-50' : 'hover:bg-surface-muted'}`}
                      >
                        <td className="px-2.5 py-1.5">
                          {isActive ? (
                            <div className="flex items-center gap-2">
                              <span
                                aria-hidden
                                className="size-2 shrink-0 rounded-full bg-accent-600"
                              />
                              {editable ? (
                                <TextInput
                                  id="scenario_name"
                                  aria-label="情境名稱"
                                  className="h-8"
                                  value={row.name}
                                  invalid={Boolean(visibleError('scenario_name'))}
                                  placeholder="例：55C_0mps"
                                  onChange={(event) => patch({ name: event.target.value })}
                                />
                              ) : (
                                <span className="font-semibold text-ink-900">{row.name}</span>
                              )}
                              {/* The dot and the row tint say it too; the word goes where the name needs the room. */}
                              <span className="sr-only min-[1440px]:not-sr-only min-[1440px]:shrink-0 min-[1440px]:text-[11px] min-[1440px]:font-semibold min-[1440px]:text-accent-700">
                                使用中
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSelect(row.id)}
                              title="切換成目前情境"
                              className="flex max-w-full items-center gap-2 pl-4 text-left text-ink-700 hover:text-accent-700"
                            >
                              <span className="truncate">{row.name}</span>
                            </button>
                          )}
                        </td>
                        {COLUMNS.map((column) => {
                          const value = row[column.field];
                          const linked =
                            column.field === 'ambient_C' && row.id === baselineId && ambientLock?.locked
                              ? ambientLock
                              : null;
                          const input = (
                            <NumberInput
                              id={column.field}
                              aria-label={column.label}
                              className={`h-8 ${column.input} shrink-0 !px-2 text-right`}
                              value={Number.isNaN(value) ? '' : value}
                              min={SCENARIO_LIMITS[column.field].min}
                              max={SCENARIO_LIMITS[column.field].max}
                              step={column.step}
                              invalid={Boolean(visibleError(column.field))}
                              onChange={(event) => patch({ [column.field]: numeric(event.target.value) })}
                            />
                          );
                          if (column.field === 'power_scale') {
                            // The basis says which power each part solves with; the scale multiplies it.
                            const basis = powerBasisOf(row);
                            return (
                              <td key={column.field} className="px-2.5 py-1.5 text-right">
                                {editable ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <Select
                                      id="power_basis"
                                      aria-label="功耗"
                                      title={BASIS_TITLE}
                                      className="h-8 !w-[5.75rem] shrink-0 text-[13px]"
                                      items={BASIS_ITEMS}
                                      value={basis}
                                      onChange={(event) => {
                                        const next = event.target.value as PowerBasis;
                                        // Hot is the default and is stored as no key.
                                        patch({ power_basis: next === 'rt' ? 'rt' : undefined });
                                      }}
                                    />
                                    <span aria-hidden className="text-ink-400">×</span>
                                    {input}
                                  </div>
                                ) : (
                                  <span className="tabular whitespace-nowrap text-ink-700" title={BASIS_TITLE}>
                                    <span className={basis === 'rt' ? 'font-semibold text-accent-700' : undefined}>
                                      {POWER_BASIS_LABEL[basis]}
                                    </span>{' '}
                                    × {format(column.field, value)}
                                  </span>
                                )}
                              </td>
                            );
                          }
                          return (
                            <td key={column.field} className="px-2.5 py-1.5 text-right">
                              {linked ? (
                                <ProjectAiBox
                                  aiKey={AI_KEY.ambient}
                                  lock={linked}
                                  id={editable ? column.field : undefined}
                                  label="Baseline 環境溫度"
                                  text={format(column.field, value)}
                                  readOnly={readOnly}
                                  compact
                                />
                              ) : editable ? (
                                <div className="flex items-center justify-end gap-1">
                                  {column.field === 'wind_mps' && <WindMark wind={value} reserve />}
                                  {input}
                                </div>
                              ) : (
                                <span className="tabular text-ink-700">
                                  {column.field === 'wind_mps' && <WindMark wind={value} />}
                                  {format(column.field, value)}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2.5 py-1.5">
                          <span className="flex items-center justify-end gap-2.5">
                            <button
                              type="button"
                              disabled={readOnly || isActive}
                              title={`把「${row.name}」的邊界條件複製到目前情境`}
                              aria-label={`把「${row.name}」的邊界條件複製到目前情境`}
                              onClick={() => onCopyFrom(row.id)}
                              className="text-ink-400 hover:text-accent-600 disabled:opacity-30"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              type="button"
                              disabled={readOnly || isActive || scenarios.length === 1}
                              title={`刪除「${row.name}」`}
                              aria-label={`刪除「${row.name}」`}
                              onClick={() => onDelete(row.id)}
                              className="text-ink-400 hover:text-danger-600 disabled:opacity-30"
                            >
                              <Trash2 size={14} />
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {ambientLock?.unlocked && (
              <div className="mt-2">
                <ProjectAiUnlockedNote aiKey={AI_KEY.ambient} lock={ambientLock} readOnly={readOnly} />
              </div>
            )}
            {mismatch && (
              <p className="mt-2 text-[12px] text-warn-600">
                Baseline 環境溫度取 AI-Thermal 的 {mismatch.ai} °C；5G-RRU 參數控制台的環境溫度是 {mismatch.rru} °C，兩邊不一致，請確認。
              </p>
            )}
            {scenarios.some((row) => windRecordedOnly(row.wind_mps)) && (
              <p className="mt-2 text-[12px] text-warn-600">※ {WIND_NOTE}</p>
            )}
            {/* Errors are text + icon, never colour alone (01 §31). */}
            {visible.length > 0 && (
              <ul className="mt-2 flex flex-col gap-0.5 text-[12px] font-medium text-danger-600">
                {visible.map((message) => (
                  <li key={message} className="flex items-start gap-1">
                    <span aria-hidden>⚠</span>
                    {message}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}
