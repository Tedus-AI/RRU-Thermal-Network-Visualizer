/**
 * Section 4 — Fixed Temperature (optional) — 06 §9.6, PNG §4.
 *
 * A fixed temperature is a Dirichlet boundary that Screen 07 applies. It is NOT
 * a resistance and never gets an Rth preview (06 §13.5).
 */

import { Thermometer, Trash2 } from 'lucide-react';

import { Badge, Button, NumberInput, Select } from '@/ui/primitives';
import { Bi, ColumnLabel, biTitle } from '@/ui/FieldLabel';

import type {
  BoundaryConditionProfile,
  BoundaryDataSource,
  BoundaryPort,
} from '@/thermal/boundary/types';
import { T06 } from './tooltips';

const SOURCES: BoundaryDataSource[] = ['manual', 'measurement', 'assumed', 'vendor'];

export interface FixedTemperatureRow {
  port: BoundaryPort;
  profile: BoundaryConditionProfile;
}

export function FixedTemperaturePanel({
  rows,
  candidatePorts,
  readOnly,
  onAdd,
  onPatch,
  onRemove,
}: {
  rows: FixedTemperatureRow[];
  /** Ports that allow a fixed-temperature boundary and have none yet. */
  candidatePorts: BoundaryPort[];
  readOnly: boolean;
  onAdd: (portId: string) => void;
  onPatch: (profile: BoundaryConditionProfile) => void;
  onRemove: (profileId: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] leading-relaxed text-ink-500">
        Apply a fixed temperature to a boundary port — a chamber plate or a controlled cold plate.
        <span className="block text-ink-400">
          對特定邊界端口套用固定溫度（例如恆溫槽或受控冷板）。
        </span>
      </p>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong px-3 py-6 text-center">
          <Thermometer size={20} className="mx-auto mb-2 text-ink-400" />
          <p className="text-[12px] font-semibold text-ink-700">No fixed temperature defined.</p>
          <p className="text-[11px] text-ink-400">尚未設定任何固定溫度。</p>
        </div>
      ) : (
        <div className="overflow-auto rounded-md border border-line">
          <table className="w-full border-collapse text-[11px]">
            <thead className="bg-surface-muted">
              <tr className="text-left text-ink-500">
                <th className="px-2 py-1.5 font-semibold">
                  <ColumnLabel label="Boundary Port" zh="邊界端口" />
                </th>
                <th className="px-2 py-1.5 font-semibold">
                  <ColumnLabel
                    label="Fixed Temp."
                    zh="固定溫度"
                    unit="°C"
                    tooltip={T06.field.fixedTemperature}
                  />
                </th>
                <th className="px-2 py-1.5 font-semibold">
                  <ColumnLabel label="Source" zh="來源" tooltip={T06.field.dataSource} />
                </th>
                <th className="px-2 py-1.5 font-semibold">
                  <ColumnLabel label="Actions" zh="操作" />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ port, profile }) => (
                <tr key={profile.id} className="border-t border-line">
                  <td className="max-w-[10rem] truncate px-2 py-1 font-semibold text-ink-900">
                    {port.name}
                  </td>
                  <td className="px-2 py-1">
                    <NumberInput
                      className="h-7 w-20 !text-[11px]"
                      step="any"
                      aria-label={biTitle(`Fixed temperature for ${port.name}`, '固定溫度')}
                      value={
                        typeof profile.parameters.fixedTemperature_C === 'number'
                          ? profile.parameters.fixedTemperature_C
                          : ''
                      }
                      disabled={readOnly}
                      onChange={(event) =>
                        onPatch({
                          ...profile,
                          parameters: {
                            ...profile.parameters,
                            fixedTemperature_C:
                              event.target.value === '' ? null : Number(event.target.value),
                          },
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Select
                      className="h-7 !text-[11px]"
                      aria-label={biTitle(`Source for ${port.name}`, '資料來源')}
                      value={profile.source}
                      disabled={readOnly}
                      options={SOURCES}
                      onChange={(event) =>
                        onPatch({ ...profile, source: event.target.value as BoundaryDataSource })
                      }
                    />
                  </td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      disabled={readOnly}
                      title={biTitle('Remove', '移除')}
                      aria-label={biTitle(`Remove fixed temperature on ${port.name}`, '移除固定溫度')}
                      onClick={() => onRemove(profile.id)}
                      className="text-ink-400 hover:text-danger-600 disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <Select
          className="h-8 min-w-0 flex-1 !text-[12px]"
          aria-label={biTitle('Add fixed temperature to a boundary port', '為邊界端口新增固定溫度')}
          value=""
          disabled={readOnly || candidatePorts.length === 0}
          items={[
            { value: '', label: '— Add to boundary port —' },
            ...candidatePorts.map((port) => ({ value: port.id, label: port.name })),
          ]}
          onChange={(event) => {
            if (event.target.value) onAdd(event.target.value);
          }}
        />
        {candidatePorts.length === 0 && (
          <Badge tone="neutral">
            <Bi en="No eligible port" zh="無可用端口" inline />
          </Badge>
        )}
      </div>

      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
        A fixed temperature is applied by the Screen 07 solver as a boundary, not converted into a
        thermal resistance.
        <span className="block">固定溫度由 07 求解器作為邊界套用，不會被轉成熱阻。</span>
      </p>
    </div>
  );
}

export function ResetButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <Button
      variant="danger"
      className="h-8"
      disabled={disabled}
      title={biTitle('Reset scenario conditions', '重設此情境的邊界條件')}
      onClick={onClick}
    >
      Reset
    </Button>
  );
}
