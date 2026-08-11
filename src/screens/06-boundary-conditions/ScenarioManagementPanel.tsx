/**
 * Section 5 — Scenario Management (06 §5 step 1, §14.3, PNG §5).
 *
 * Boundary conditions are stored per scenario. Switching scenario loads that
 * scenario's set; copying creates INDEPENDENT data so editing the copy can
 * never reach back into the scenario it came from (06 §14.3).
 */

import { Copy, Plus, Trash2 } from 'lucide-react';

import { Badge, Button } from '@/ui/primitives';
import { Bi, ColumnLabel, biTitle } from '@/ui/FieldLabel';

import type { Scenario } from '@/domain/project';
import { T06 } from './tooltips';

export function ScenarioManagementPanel({
  scenarios,
  activeScenarioId,
  readOnly,
  onSelect,
  onCreate,
  onCopyFrom,
  onDelete,
}: {
  scenarios: Scenario[];
  activeScenarioId: string | null;
  readOnly: boolean;
  onSelect: (scenarioId: string) => void;
  onCreate: () => void;
  onCopyFrom: (scenarioId: string) => void;
  onDelete: (scenarioId: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-ink-500">
          Create, duplicate or manage boundary condition scenarios.
          <span className="block text-ink-400">建立、複製或管理邊界條件情境。</span>
        </p>
        <Button
          variant="primary"
          className="h-8 shrink-0"
          disabled={readOnly}
          icon={<Plus size={13} />}
          title={biTitle('New Scenario', '新增情境')}
          onClick={onCreate}
        >
          New Scenario
        </Button>
      </div>

      <div className="max-h-44 overflow-auto rounded-md border border-line">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-surface-muted">
            <tr className="text-left text-ink-500">
              <th className="px-2 py-1.5 font-semibold">
                <ColumnLabel label="Scenario Name" zh="情境名稱" tooltip={T06.field.scenarioName} />
              </th>
              <th className="px-2 py-1.5 text-right font-semibold">
                <ColumnLabel label="Ambient" zh="環境溫度" unit="°C" />
              </th>
              <th className="px-2 py-1.5 text-right font-semibold">
                <ColumnLabel label="Wind" zh="風速" unit="m/s" />
              </th>
              <th className="px-2 py-1.5 text-right font-semibold">
                <ColumnLabel label="Solar" zh="太陽" unit="W/m²" />
              </th>
              <th className="px-2 py-1.5 font-semibold">
                <ColumnLabel label="Actions" zh="操作" />
              </th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((scenario) => {
              const active = scenario.id === activeScenarioId;
              return (
                <tr
                  key={scenario.id}
                  className={`border-t border-line ${active ? 'bg-accent-100/60' : ''}`}
                >
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      onClick={() => onSelect(scenario.id)}
                      title={biTitle(`Switch to ${scenario.name}`, '切換至此情境')}
                      className="flex items-center gap-1.5 text-left font-semibold text-ink-900"
                    >
                      <span className="max-w-[9rem] truncate">{scenario.name}</span>
                      {active && (
                        <Badge tone="ok">
                          <Bi en="Active" zh="使用中" inline />
                        </Badge>
                      )}
                    </button>
                  </td>
                  <td className="px-2 py-1 text-right tabular text-ink-700">
                    {scenario.ambient_C.toFixed(1)}
                  </td>
                  <td className="px-2 py-1 text-right tabular text-ink-700">
                    {scenario.wind_mps.toFixed(1)}
                  </td>
                  <td className="px-2 py-1 text-right tabular text-ink-700">
                    {scenario.solar_W_m2.toFixed(0)}
                  </td>
                  <td className="px-2 py-1">
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={readOnly || active}
                        title={biTitle(
                          `Copy boundary conditions from ${scenario.name}`,
                          T06.field.copyFromScenario,
                        )}
                        aria-label={biTitle(
                          `Copy boundary conditions from ${scenario.name}`,
                          '從此情境複製邊界條件',
                        )}
                        onClick={() => onCopyFrom(scenario.id)}
                        className="text-ink-400 hover:text-accent-600 disabled:opacity-30"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={readOnly || scenario.is_default}
                        title={biTitle(`Delete ${scenario.name}`, '刪除此情境')}
                        aria-label={biTitle(`Delete ${scenario.name}`, '刪除此情境')}
                        onClick={() => onDelete(scenario.id)}
                        className="text-ink-400 hover:text-danger-600 disabled:opacity-30"
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
        Copying makes independent data — editing the copy never changes the scenario it came from.
        <span className="block">複製後為獨立資料，編輯副本不會影響來源情境。</span>
      </p>
    </div>
  );
}
