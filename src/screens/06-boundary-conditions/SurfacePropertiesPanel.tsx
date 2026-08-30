/**
 * Section 2 — Surface Properties (PNG §2, feeding 06 §9.3 and §9.5).
 *
 * Emissivity and absorptivity are properties of the SURFACE, not of a scenario
 * profile, so they are edited once per surface group and read by every
 * radiation and solar profile that lands on that group.
 *
 * Unknown stays null and renders N/A. A blank emissivity is not 0.
 */

import { NumberInput, Select } from '@/ui/primitives';
import { Bi, ColumnLabel, biTitle } from '@/ui/FieldLabel';
import { dataSourceItemsZh } from '@/ui/dataSourceLabels';

import type { BoundaryDataSource, SurfaceProperty } from '@/thermal/boundary/types';
import { T06 } from './tooltips';

const SOURCE_ITEMS = dataSourceItemsZh<BoundaryDataSource>([
  'manual',
  'datasheet',
  'assumed',
  'measurement',
  'vendor',
]);

export function SurfacePropertiesPanel({
  groups,
  properties,
  solarEnabled,
  solarIrradiance_W_m2,
  readOnly,
  onChange,
}: {
  groups: Array<{ id: string; name: string }>;
  properties: SurfaceProperty[];
  solarEnabled: boolean;
  solarIrradiance_W_m2: number | null;
  readOnly: boolean;
  onChange: (property: SurfaceProperty) => void;
}) {
  const propertyFor = (groupId: string, name: string): SurfaceProperty =>
    properties.find((entry) => entry.surface_group_id === groupId) ?? {
      surface_group_id: groupId,
      name,
      emissivity: null,
      absorptivity: null,
      source: 'assumed',
    };

  if (groups.length === 0) {
    return (
      <p className="py-4 text-center text-[11px] text-ink-400">
        <Bi
          en="No surfaces yet — boundary ports come from the Screen 05 topology."
          zh="尚無表面：邊界端口來自 05 的拓撲。"
          inline
        />
      </p>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-[11px] text-ink-500">
        {groups.length} <Bi en="surfaces" zh="個表面" inline />
      </p>

      <div className="max-h-52 overflow-auto rounded-md border border-line">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-surface-muted">
            <tr className="text-left text-ink-500">
              <th className="px-2 py-1.5 font-semibold">
                <ColumnLabel label="Surface" zh="表面" />
              </th>
              <th className="px-2 py-1.5 font-semibold">
                <ColumnLabel label="Emissivity" zh="發射率" tooltip={T06.field.emissivity} />
              </th>
              <th className="px-2 py-1.5 font-semibold">
                <ColumnLabel
                  label="Absorptivity"
                  zh="吸收率"
                  tooltip={T06.field.absorptivity}
                />
              </th>
              <th className="px-2 py-1.5 font-semibold">
                <ColumnLabel label="Source" zh="來源" tooltip={T06.field.dataSource} />
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const property = propertyFor(group.id, group.name);
              return (
                <tr key={group.id} className="border-t border-line">
                  <td
                    className="px-2 py-1 font-semibold text-ink-900"
                    title={biTitle(group.name, '表面群組')}
                  >
                    <span className="block max-w-[8rem] truncate">{group.name}</span>
                  </td>
                  <td className="px-2 py-1">
                    <NumberInput
                      className="h-7 w-16 !text-[11px]"
                      step="0.01"
                      min="0"
                      max="1"
                      aria-label={biTitle(`Emissivity for ${group.name}`, '發射率')}
                      value={property.emissivity ?? ''}
                      disabled={readOnly}
                      onChange={(event) =>
                        onChange({
                          ...property,
                          emissivity:
                            event.target.value === '' ? null : Number(event.target.value),
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-1">
                    {solarEnabled ? (
                      <NumberInput
                        className="h-7 w-16 !text-[11px]"
                        step="0.01"
                        min="0"
                        max="1"
                        aria-label={biTitle(`Absorptivity for ${group.name}`, '吸收率')}
                        value={property.absorptivity ?? ''}
                        disabled={readOnly}
                        onChange={(event) =>
                          onChange({
                            ...property,
                            absorptivity:
                              event.target.value === '' ? null : Number(event.target.value),
                          })
                        }
                      />
                    ) : (
                      <span
                        className="inline-flex h-7 min-w-16 items-center justify-center rounded border border-line bg-surface-muted px-2 text-[10px] font-semibold text-ink-400"
                        title="SCR01 日照負載為 0 W/m²；保留既有吸收率，但本情境不使用。"
                      >
                        未使用
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <Select
                      className="h-7 !text-[11px]"
                      aria-label={biTitle(`Source for ${group.name}`, '資料來源')}
                      value={property.source}
                      disabled={readOnly}
                      items={SOURCE_ITEMS}
                      onChange={(event) =>
                        onChange({
                          ...property,
                          source: event.target.value as BoundaryDataSource,
                        })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
        Only physical heat-rejection surfaces are listed. Emissivity drives radiation exchange;
        absorptivity drives solar gain. Blank stays N/A and is never treated as 0.
        <span className="block">
          此處只列實體散熱表面；環境參考節點不適用。發射率影響輻射交換，吸收率影響太陽吸熱；留空維持 N/A，不會當成 0。
        </span>
        {!solarEnabled && (
          <span className="mt-1 block font-semibold text-ink-500">
            SCR01 日照負載為 {solarIrradiance_W_m2 ?? 0} W/m²：吸收率與太陽 profile
            暫停使用，既有資料會保留。
          </span>
        )}
      </p>
    </div>
  );
}
