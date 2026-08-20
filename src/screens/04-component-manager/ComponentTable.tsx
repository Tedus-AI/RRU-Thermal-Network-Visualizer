/**
 * Main component table — 04 §10, §12.
 *
 * Inline editing is limited to the fields 04 §12 allows; everything else lives in
 * the inspector so a mis-click cannot silently change a thermal spec.
 */

import { AlertTriangle, CircleCheck, CircleSlash, XCircle } from 'lucide-react';
import { ColumnLabel } from '@/ui/FieldLabel';
import {
  BOARD_TYPES,
  COMPONENT_CATEGORIES,
  LIMIT_TYPES,
  componentTotalPowerW,
  TIM_TYPES,
  type BoardType,
  type Component,
  type ComponentCategory,
  type LimitType,
  type TimType,
} from '@/domain/component';
import { withValue } from '@/domain/sourcedValue';
import { statusOf, type ComponentStatus } from '@/domain/componentReadiness';
import { tip, ZH } from '@/i18n/componentManagerCopy';

const STATUS_META: Record<
  ComponentStatus,
  { label: string; zh: string; icon: typeof CircleCheck; className: string }
> = {
  READY: { label: 'Ready', zh: '就緒', icon: CircleCheck, className: 'text-ok-600' },
  WARNING: { label: 'Warning', zh: '警告', icon: AlertTriangle, className: 'text-warn-600' },
  ERROR: { label: 'Error', zh: '錯誤', icon: XCircle, className: 'text-danger-600' },
  DISABLED: { label: 'Disabled', zh: '停用', icon: CircleSlash, className: 'text-ink-400' },
};

const CELL =
  'tabular h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-[12px] hover:border-line-strong focus:border-accent-500 focus:bg-surface focus:outline-none disabled:hover:border-transparent';

function num(value: number | null | undefined, digits = 2): string {
  return value == null ? '—' : value.toFixed(digits);
}

export function ComponentTable({
  components,
  selectedId,
  onSelect,
  onPatch,
  readOnly,
}: {
  components: Component[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<Component>, fields: string[]) => void;
  readOnly: boolean;
}) {
  const patchSpec = (
    component: Component,
    spec: Partial<Component['thermal_spec']>,
    fields: string[],
  ) => onPatch(component.id, { thermal_spec: { ...component.thermal_spec, ...spec } }, fields);

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[1250px] border-collapse text-left">
        <thead className="bg-surface-muted">
          <tr className="border-b border-line text-[11px] font-semibold text-ink-700">
            <th scope="col" className="px-2 py-2">
              <ColumnLabel label="On" zh={ZH.Enabled} />
            </th>
            <th scope="col" className="px-2 py-2">
              <ColumnLabel label="Status" zh={ZH.Status} />
            </th>
            <th scope="col" className="px-2 py-2">
              <ColumnLabel label="Category" zh={ZH.Category} />
            </th>
            <th scope="col" className="px-2 py-2">
              <ColumnLabel label="Component" zh={ZH.Component} />
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              <ColumnLabel label="Qty" zh={ZH.Qty} tooltip={tip('Qty')} />
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              <ColumnLabel label="Power" unit="W" zh={ZH.Power} tooltip={tip('Power')} />
            </th>
            <th scope="col" className="bg-accent-50 px-2 py-2 text-right">
              <ColumnLabel
                label="Total Power"
                unit="W"
                zh={ZH['Total Power']}
                tooltip={tip('Total Power')}
              />
            </th>
            <th scope="col" className="px-2 py-2">
              <ColumnLabel label="Limit Type" zh={ZH['Limit Type']} tooltip={tip('Limit Type')} />
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              <ColumnLabel label="Limit" unit="°C" zh={ZH.Limit} tooltip={tip('Limit')} />
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              <ColumnLabel label="Rjc" unit="°C/W" zh={ZH.Rjc} tooltip={tip('Rjc')} />
            </th>
            <th scope="col" className="px-2 py-2">
              <ColumnLabel label="Package" zh={ZH.Package} tooltip={tip('Package')} />
            </th>
            <th scope="col" className="px-2 py-2">
              <ColumnLabel label="Board Type" zh={ZH['Board Type']} tooltip={tip('Board Type')} />
            </th>
            <th scope="col" className="px-2 py-2">
              <ColumnLabel label="TIM" zh={ZH.TIM} tooltip={tip('TIM')} />
            </th>
            <th scope="col" className="px-2 py-2">
              <ColumnLabel
                label="Thermal Profile"
                zh={ZH['Thermal Profile']}
                tooltip={tip('Thermal Profile')}
              />
            </th>
            <th scope="col" className="px-2 py-2">
              <ColumnLabel label="Source" zh={ZH.Source} tooltip={tip('Source')} />
            </th>
          </tr>
        </thead>
        <tbody>
          {components.length === 0 && (
            <tr>
              <td colSpan={15} className="px-3 py-6 text-center text-[13px] text-ink-400">
                No components match the current filters. / 沒有符合篩選條件的元件。
              </td>
            </tr>
          )}
          {components.map((component) => {
            const status = statusOf(component);
            const meta = STATUS_META[status];
            const Icon = meta.icon;
            const spec = component.thermal_spec;
            const selected = component.id === selectedId;

            return (
              <tr
                key={component.id}
                onClick={() => onSelect(component.id)}
                className={`cursor-pointer border-b border-line text-[12px] last:border-b-0 ${
                  selected
                    ? 'bg-accent-50'
                    : status === 'ERROR'
                      ? 'bg-danger-100/40'
                      : !component.enabled
                        ? 'bg-surface-muted text-ink-400'
                        : 'bg-surface hover:bg-surface-muted'
                }`}
              >
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    aria-label={`Enable ${component.name}`}
                    className="size-4 accent-[var(--color-accent-600)]"
                    checked={component.enabled}
                    disabled={readOnly}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) =>
                      onPatch(component.id, { enabled: event.target.checked }, ['enabled'])
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  {/* Icon + text, never colour alone. */}
                  <span className={`inline-flex items-center gap-1.5 ${meta.className}`}>
                    <Icon size={14} aria-hidden />
                    <span className="text-[12px] font-medium whitespace-nowrap">
                      {meta.label}
                      <span className="ml-1 font-normal text-ink-400">{meta.zh}</span>
                    </span>
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <select
                    aria-label={`Category for ${component.name}`}
                    className={`${CELL} w-24`}
                    onClick={(event) => event.stopPropagation()}
                    value={component.category}
                    disabled={readOnly}
                    onChange={(event) =>
                      onPatch(component.id, { category: event.target.value as ComponentCategory }, [
                        'category',
                      ])
                    }
                  >
                    {COMPONENT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    className="font-medium hover:text-accent-700 hover:underline"
                    onClick={() => onSelect(component.id)}
                  >
                    {component.name}
                  </button>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <input
                    type="number"
                    aria-label={`Qty for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    className={`${CELL} w-14 text-right`}
                    value={component.qty}
                    disabled={readOnly}
                    onChange={(event) =>
                      onPatch(component.id, { qty: Number(event.target.value) }, ['qty'])
                    }
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <input
                    type="number"
                    step="0.01"
                    aria-label={`Power for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    className={`${CELL} w-20 text-right`}
                    value={component.power_W.value ?? ''}
                    placeholder="—"
                    disabled={readOnly}
                    onChange={(event) =>
                      onPatch(
                        component.id,
                        {
                          power_W: withValue(
                            component.power_W,
                            event.target.value === '' ? null : Number(event.target.value),
                          ),
                        },
                        ['power_W'],
                      )
                    }
                  />
                </td>
                {/* Qty × Power — a dissipation summary, never edge heat flow Q. */}
                <td className="tabular bg-accent-50/60 px-2 py-1.5 text-right font-semibold">
                  {componentTotalPowerW(component).toFixed(2)}
                </td>
                <td className="px-2 py-1.5">
                  <select
                    aria-label={`Limit type for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    // Amber while the type is still this tool's guess.
                    className={`${CELL} w-24 ${spec.limit_type_confirmed ? '' : 'text-warn-600'}`}
                    title={
                      spec.limit_type_confirmed
                        ? undefined
                        : `推定值（${spec.limit_type}），請對照規格書確認。`
                    }
                    value={spec.limit_type}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchSpec(
                        component,
                        {
                          limit_type: event.target.value as LimitType,
                          // Picking it IS the confirmation.
                          limit_type_confirmed: true,
                        },
                        ['limit_type'],
                      )
                    }
                  >
                    {LIMIT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <input
                    type="number"
                    aria-label={`Limit for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    className={`${CELL} w-16 text-right`}
                    value={spec.limit_C?.value ?? ''}
                    placeholder="—"
                    disabled={readOnly}
                    onChange={(event) =>
                      patchSpec(
                        component,
                        {
                          limit_C: withValue(
                            spec.limit_C,
                            event.target.value === '' ? null : Number(event.target.value),
                          ),
                        },
                        ['limit_C'],
                      )
                    }
                  />
                </td>
                {/* Unknown Rjc shows N/A, never 0 (04 §11, AC-04-06). */}
                <td className="px-2 py-1.5 text-right">
                  <input
                    type="number"
                    step="0.01"
                    aria-label={`Rjc for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    className={`${CELL} w-16 text-right`}
                    value={spec.r_jc_C_per_W?.value ?? ''}
                    placeholder="N/A"
                    disabled={readOnly}
                    onChange={(event) =>
                      patchSpec(
                        component,
                        {
                          r_jc_C_per_W: withValue(
                            spec.r_jc_C_per_W,
                            event.target.value === '' ? null : Number(event.target.value),
                          ),
                        },
                        ['r_jc_C_per_W'],
                      )
                    }
                  />
                </td>
                <td className="tabular px-2 py-1.5 whitespace-nowrap">
                  {spec.package_type ?? <span className="text-warn-600">—</span>}
                </td>
                <td className="px-2 py-1.5">
                  <select
                    aria-label={`Board type for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    className={`${CELL} w-28`}
                    value={spec.board_path.type}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchSpec(
                        component,
                        {
                          board_path: {
                            ...spec.board_path,
                            type: event.target.value as BoardType,
                          },
                        },
                        ['board_path.type'],
                      )
                    }
                  >
                    {BOARD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select
                    aria-label={`TIM for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    className={`${CELL} w-24`}
                    value={spec.tim.type}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchSpec(
                        component,
                        { tim: { ...spec.tim, type: event.target.value as TimType } },
                        ['tim.type'],
                      )
                    }
                  >
                    {TIM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <span
                    className={
                      component.architecture_prep.thermal_profile_status === 'Not Assigned'
                        ? 'text-ink-400'
                        : 'text-accent-700'
                    }
                  >
                    {component.architecture_prep.thermal_profile_status}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-[11px] whitespace-nowrap text-ink-400">
                  {component.provenance.source_type}
                  {component.provenance.source_project_name
                    ? ` · ${component.provenance.source_project_name}`
                    : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { num };
