import { Copy, Plus, Trash2 } from 'lucide-react';

import type { Scenario } from '@/domain/project';
import { Badge, Button, SectionCard } from '@/ui/primitives';
import { Bi, ColumnLabel, biTitle } from '@/ui/FieldLabel';

export function ProjectScenarioManagement({
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
  const active = scenarios.find((scenario) => scenario.id === activeScenarioId);

  return (
    <SectionCard
      step={4}
      title="Scenario Management"
      subtitle="情境管理"
      collapsible
      defaultOpen
      summary={active ? `Active / 使用中：${active.name}` : 'No active scenario / 尚無使用中情境'}
      actions={
        <Button
          variant="primary"
          className="h-8"
          disabled={readOnly}
          icon={<Plus size={13} />}
          title={biTitle('New Scenario', '新增情境')}
          onClick={onCreate}
        >
          New Scenario
        </Button>
      }
    >
      <p className="mb-3 text-[12px] leading-relaxed text-ink-500">
        Create, select and manage project scenarios here. Screen 06 edits the boundary set of the
        active scenario.
        <span className="block text-ink-400">
          在此建立、切換與管理專案情境；Screen 06 僅編輯使用中情境的邊界條件。
        </span>
      </p>

      <div className="overflow-auto rounded-md border border-line">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-surface-muted">
            <tr className="text-left text-ink-500">
              <th className="px-2 py-1.5 font-semibold">
                <ColumnLabel label="Scenario Name" zh="情境名稱" />
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
              const isActive = scenario.id === activeScenarioId;
              return (
                <tr
                  key={scenario.id}
                  className={`border-t border-line ${isActive ? 'bg-accent-100/60' : ''}`}
                >
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      onClick={() => onSelect(scenario.id)}
                      className="flex items-center gap-1.5 text-left font-semibold text-ink-900"
                    >
                      <span className="max-w-[16rem] truncate">{scenario.name}</span>
                      {isActive && (
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
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={readOnly || isActive}
                        title={biTitle(
                          `Copy boundary conditions from ${scenario.name}`,
                          '從此情境複製邊界條件到使用中情境',
                        )}
                        aria-label={biTitle(
                          `Copy boundary conditions from ${scenario.name}`,
                          '從此情境複製邊界條件到使用中情境',
                        )}
                        onClick={() => onCopyFrom(scenario.id)}
                        className="text-ink-400 hover:text-accent-600 disabled:opacity-30"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={readOnly || isActive || scenarios.length === 1}
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
      <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
        Copying makes independent boundary data; later edits never change the source scenario.
        <span className="block">複製後為獨立邊界資料，後續編輯不會影響來源情境。</span>
      </p>
    </SectionCard>
  );
}
