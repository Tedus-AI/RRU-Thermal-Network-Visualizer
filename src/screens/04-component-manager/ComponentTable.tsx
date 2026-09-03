/**
 * Main component table — 04 §10, §12.
 *
 * Inline editing is limited to the fields 04 §12 allows; everything else lives in
 * the inspector so a mis-click cannot silently change a thermal spec.
 */

import { AlertTriangle, CircleCheck, CircleSlash, Copy, Trash2, XCircle } from 'lucide-react';
import { ColumnLabel } from '@/ui/FieldLabel';
import { ColumnResizer, useColumnWidths } from '@/ui/ResizableColumns';
import {
  HEAT_PATH_LABELS,
  HEAT_PATH_PATCH_FIELDS,
  HEAT_PATH_TYPES,
  COMPONENT_CATEGORIES,
  LIMIT_TYPES,
  componentTotalPowerW,
  heatPathPatch,
  isBodySourced,
  type HeatPathType,
  type Component,
  type ComponentCategory,
  type LimitType,
} from '@/domain/component';
import { withValue } from '@/domain/sourcedValue';
import { DIRECT_CONTACT_TIM_ID, defaultMaterials } from '@/domain/materials';
import { useProjectStore } from '@/data/projectStore';
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

const CELL_BASE =
  'tabular h-7 w-full rounded border border-transparent bg-transparent text-[12px] hover:border-line-strong focus:border-accent-500 focus:bg-surface focus:outline-none disabled:hover:border-transparent';

/**
 * A number editor: centred, and without the spin-button gutter that would
 * otherwise pull the value 8px off the column's centre line.
 */
export const NUMBER_CELL = `${CELL_BASE} px-1.5 cell-number text-center`;

/**
 * A dropdown: centred for real. `.cell-select` supplies the arrow and the
 * symmetric padding, so it must not be given `px-*` as well.
 */
export const SELECT_CELL = `${CELL_BASE} cell-select text-center`;

/**
 * The columns, in render order, with the width each starts at.
 *
 * `tbody` still writes its cells by hand — they are fifteen different editors,
 * not one repeated cell — so this list's ORDER has to match theirs. It exists
 * so the header, the colgroup and the remembered widths cannot drift apart.
 */
const COLUMNS: ReadonlyArray<{
  id: string;
  label: string;
  zh: string;
  unit?: string;
  tooltip?: Parameters<typeof tip>[0];
  highlight?: boolean;
  width: number;
}> = [
  // Per-row Duplicate and Delete. They used to sit under the table and act on
  // "the selected row", but selecting a row is what opens the inspector, so
  // reaching them meant a floating panel over the thing being worked on. On the
  // row itself they need no selection at all.
  { id: 'actions', label: '', zh: '', width: 62 },
  { id: 'on', label: 'On', zh: ZH.Enabled, width: 56 },
  { id: 'status', label: 'Status', zh: ZH.Status, width: 96 },
  { id: 'category', label: 'Category', zh: ZH.Category, width: 96 },
  { id: 'component', label: 'Component', zh: ZH.Component, width: 210 },
  { id: 'qty', label: 'Qty', zh: ZH.Qty, tooltip: 'Qty', width: 64 },
  { id: 'power', label: 'Power', unit: 'W', zh: ZH.Power, tooltip: 'Power', width: 84 },
  {
    id: 'total_power',
    label: 'Total Power',
    unit: 'W',
    zh: ZH['Total Power'],
    tooltip: 'Total Power',
    highlight: true,
    width: 96,
  },
  { id: 'limit_type', label: 'Limit Type', zh: ZH['Limit Type'], tooltip: 'Limit Type', width: 96 },
  { id: 'limit', label: 'Limit', unit: '°C', zh: ZH.Limit, tooltip: 'Limit', width: 80 },
  { id: 'rjc', label: 'Rjc', unit: '°C/W', zh: ZH.Rjc, tooltip: 'Rjc', width: 84 },
  { id: 'package', label: 'Package', zh: ZH.Package, tooltip: 'Package', width: 150 },
  // Wide enough for the two nine-character path labels plus the arrow well on
  // either side. The sixteen-character one fits no sane column, so that one is
  // read from the hover title or the open dropdown.
  { id: 'heat_path', label: 'Heat Path', zh: ZH['Heat Path'], tooltip: 'Heat Path', width: 172 },
  { id: 'tim', label: 'TIM', zh: ZH.TIM, tooltip: 'TIM', width: 110 },
  {
    id: 'thermal_profile',
    label: 'Thermal Profile',
    zh: ZH['Thermal Profile'],
    tooltip: 'Thermal Profile',
    width: 110,
  },
  { id: 'source', label: 'Source', zh: ZH.Source, tooltip: 'Source', width: 160 },
];

const COLUMN_DEFAULTS = Object.fromEntries(
  COLUMNS.map((column) => [column.id, column.width]),
);

function num(value: number | null | undefined, digits = 2): string {
  return value == null ? '—' : value.toFixed(digits);
}

/**
 * One of the two icons at the head of every row.
 *
 * Icon-only, with the name of the part in the tooltip so the row it acts on is
 * never in doubt — a bare "Delete" on fifty identical-looking rows is exactly
 * the tooltip that does not help.
 */
function RowAction({
  icon: Icon,
  label,
  zh,
  disabled,
  danger,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  zh: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={`${label} / ${zh}`}
      aria-label={`${label} / ${zh}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex size-6 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        danger
          ? 'text-ink-400 hover:bg-danger-100 hover:text-danger-600'
          : 'text-ink-400 hover:bg-surface-muted hover:text-accent-700'
      }`}
    >
      <Icon size={13} />
    </button>
  );
}

export function ComponentTable({
  components,
  selectedId,
  onSelect,
  onPatch,
  onDuplicate,
  onDelete,
  readOnly,
}: {
  components: Component[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<Component>, fields: string[]) => void;
  onDuplicate: (component: Component) => void;
  onDelete: (component: Component) => void;
  readOnly: boolean;
}) {
  // The TIM column offers the project's own materials, so it has to read them.
  const materials = useProjectStore((s) => s.draft?.materials) ?? defaultMaterials();
  const patchSpec = (
    component: Component,
    spec: Partial<Component['thermal_spec']>,
    fields: string[],
  ) => onPatch(component.id, { thermal_spec: { ...component.thermal_spec, ...spec } }, fields);

  const { widths, startResize } = useColumnWidths('04.components', COLUMN_DEFAULTS);

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      {/* `table-fixed` so the colgroup widths are authoritative: under the
          default auto layout a width is only a suggestion and a dragged column
          springs back the moment the content disagrees. */}
      <table
        className="table-fixed border-collapse text-center"
        style={{ width: COLUMNS.reduce((total, column) => total + (widths[column.id] ?? 0), 0) }}
      >
        <colgroup>
          {COLUMNS.map((column) => (
            <col key={column.id} style={{ width: widths[column.id] }} />
          ))}
        </colgroup>
        <thead className="bg-surface-muted">
          <tr className="border-b border-line text-[11px] font-semibold text-ink-700">
            {COLUMNS.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={`relative px-2 py-2 ${column.highlight ? 'bg-accent-50' : ''}`}
              >
                <div className="flex justify-center">
                  <ColumnLabel
                    label={column.label}
                    unit={column.unit}
                    zh={column.zh}
                    tooltip={column.tooltip ? tip(column.tooltip) : undefined}
                  />
                </div>
                <ColumnResizer
                  id={column.id}
                  labelEn={column.label}
                  labelZh={column.zh}
                  onResize={startResize}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {components.length === 0 && (
            <tr>
              <td colSpan={16} className="px-3 py-6 text-center text-[13px] text-ink-400">
                No components match the current filters. / 沒有符合篩選條件的元件。
              </td>
            </tr>
          )}
          {components.map((component) => {
            const status = statusOf(component);
            const meta = STATUS_META[status];
            const Icon = meta.icon;
            const spec = component.thermal_spec;
            // Rjc has no meaning when the dissipation is referenced to the exit
            // face itself rather than to a junction behind it — on any heat path.
            const surfaceReferenced = isBodySourced(spec);
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
                {/* Both stop the click reaching the row, which would open the
                    inspector over the table the reader is working down. */}
                <td className="px-1 py-1.5">
                  <div className="flex items-center justify-center gap-0.5">
                    <RowAction
                      icon={Copy}
                      label={`Duplicate ${component.name}`}
                      zh={`複製 ${component.name}`}
                      disabled={readOnly}
                      onClick={() => onDuplicate(component)}
                    />
                    <RowAction
                      icon={Trash2}
                      label={`Delete ${component.name}`}
                      zh={`刪除 ${component.name}`}
                      disabled={readOnly}
                      danger
                      onClick={() => onDelete(component)}
                    />
                  </div>
                </td>
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
                    </span>
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <select
                    aria-label={`Category for ${component.name}`}
                    className={SELECT_CELL}
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
                {/* A wrapped name turns one row into two and breaks the scan
                    down the column, so it stays on one line and elides. */}
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    title={component.name}
                    className="mx-auto block max-w-full truncate font-medium hover:text-accent-700 hover:underline"
                    onClick={() => onSelect(component.id)}
                  >
                    {component.name}
                  </button>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    aria-label={`Qty for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    className={NUMBER_CELL}
                    value={component.qty}
                    disabled={readOnly}
                    onChange={(event) =>
                      onPatch(component.id, { qty: Number(event.target.value) }, ['qty'])
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    aria-label={`Power for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    className={NUMBER_CELL}
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
                <td className="tabular bg-accent-50/60 px-2 py-1.5 font-semibold">
                  {componentTotalPowerW(component).toFixed(2)}
                </td>
                <td className="px-2 py-1.5">
                  <select
                    aria-label={`Limit type for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    // Amber while the type is still this tool's guess.
                    className={`${SELECT_CELL} ${spec.limit_type_confirmed ? '' : 'text-warn-600'}`}
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
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    aria-label={`Limit for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    className={NUMBER_CELL}
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
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    aria-label={`Rjc for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    className={NUMBER_CELL}
                    value={surfaceReferenced ? '' : (spec.r_jc_C_per_W?.value ?? '')}
                    placeholder="N/A"
                    disabled={readOnly || surfaceReferenced}
                    title={
                      surfaceReferenced
                        ? 'Rjc does not apply to the Module Surface / Baseplate model.'
                        : undefined
                    }
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
                    aria-label={`Heat path for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    // Amber while the path is still this tool's guess.
                    className={`${SELECT_CELL} ${spec.heat_path_confirmed ? '' : 'text-warn-600'}`}
                    // The longest path label is sixteen characters wide and no
                    // sane column fits it, so hovering spells it out.
                    title={
                      spec.heat_path_confirmed
                        ? HEAT_PATH_LABELS[spec.heat_path.type].zh
                        : `推定值（${spec.heat_path.type}），它決定整條熱阻鏈，請確認。`
                    }
                    value={spec.heat_path.type}
                    disabled={readOnly}
                    onChange={(event) =>
                      // Also rewrites the architecture template the path implies,
                      // so the two can never disagree.
                      onPatch(
                        component.id,
                        heatPathPatch(component, event.target.value as HeatPathType),
                        HEAT_PATH_PATCH_FIELDS,
                      )
                    }
                  >
                    {HEAT_PATH_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {HEAT_PATH_LABELS[type].zh}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select
                    aria-label={`TIM for ${component.name}`}
                    onClick={(event) => event.stopPropagation()}
                    className={SELECT_CELL}
                    value={spec.tim.tim_id ?? ''}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchSpec(
                        component,
                        { tim: { ...spec.tim, tim_id: event.target.value || null } },
                        ['tim.tim_id'],
                      )
                    }
                  >
                    <option value="">—</option>
                    <option value={DIRECT_CONTACT_TIM_ID}>直接接觸</option>
                    {materials.tim.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.name}
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
                {/* The project name is long and rarely the thing being read,
                    so the column is capped and the full text is on hover. */}
                <td
                  className="max-w-[11rem] truncate px-2 py-1.5 text-[11px] text-ink-400"
                  title={`${component.provenance.source_type}${
                    component.provenance.source_project_name
                      ? ` · ${component.provenance.source_project_name}`
                      : ''
                  }`}
                >
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
