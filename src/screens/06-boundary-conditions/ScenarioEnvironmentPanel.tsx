/**
 * Section 1 — Scenario Environment (06 §8.1 Ambient / Wind / Solar tabs, PNG §1).
 *
 * The specification splits these across five left-panel tabs; the mockup shows
 * them as one compact form. The form is what is built — the fields, units and
 * validation are the specification's — because at this column width a tab strip
 * costs more than it saves.
 *
 * Ambient is required here and nowhere else: Screen 05 deliberately left the
 * ambient placeholder without a temperature (06 §2.4).
 */

import { NumberInput, Select, TextArea } from '@/ui/primitives';
import { FieldLabel, biTitle } from '@/ui/FieldLabel';

import type {
  AirflowMode,
  AmbientDefinition,
  BoundaryDataSource,
  ConvectionMethod,
  SiteConditions,
} from '@/thermal/boundary/types';
import type { Confidence } from '@/thermal/types';
import { T06 } from './tooltips';

const AIRFLOW_MODES: Array<{ value: AirflowMode; label: string }> = [
  { value: 'natural', label: 'Natural' },
  { value: 'forced', label: 'Forced' },
  { value: 'external_wind', label: 'External Wind' },
  { value: 'fan_blower', label: 'Fan / Blower' },
];

const CONVECTION_METHODS: Array<{ value: ConvectionMethod; label: string }> = [
  { value: 'manual_h', label: 'Manual h' },
  { value: 'preset', label: 'Preset' },
  { value: 'future_correlation', label: 'Future Correlation' },
];

const DATA_SOURCES: BoundaryDataSource[] = [
  'manual',
  'analytical',
  'datasheet',
  'assumed',
  'measurement',
  'flotherm',
  'vendor',
];

const WIND_DIRECTIONS = [
  { value: '0', label: 'Front to Back (0°)' },
  { value: '90', label: 'Left to Right (90°)' },
  { value: '180', label: 'Back to Front (180°)' },
  { value: '270', label: 'Right to Left (270°)' },
];

export function ScenarioEnvironmentPanel({
  ambient,
  site,
  readOnly,
  onAmbient,
  onSite,
}: {
  ambient: AmbientDefinition;
  site: SiteConditions;
  readOnly: boolean;
  onAmbient: (patch: Partial<AmbientDefinition>) => void;
  onSite: (patch: Partial<SiteConditions>) => void;
}) {
  const number = (value: number | null | undefined) => (value == null ? '' : value);

  return (
    <div className="grid gap-2.5">
      <div>
        <FieldLabel
          label="External Ambient Temperature"
          zh="外部環境溫度"
          inline={false}
          unit="°C"
          htmlFor="bc-ambient"
          tooltip={T06.field.externalAmbient}
          required
        />
        <NumberInput
          id="bc-ambient"
          className="mt-1 h-8 !text-[12px]"
          value={number(ambient.external_ambient_C)}
          disabled={readOnly}
          onChange={(event) =>
            onAmbient({
              external_ambient_C: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
      </div>

      <div>
        <FieldLabel
          label="Internal Air"
          zh="內部空氣溫度"
          unit="°C"
          htmlFor="bc-internal-air"
          tooltip={T06.field.internalAir}
        />
        <NumberInput
          id="bc-internal-air"
          className="mt-1 h-8 !text-[12px]"
          value={number(ambient.internal_air_C)}
          disabled={readOnly}
          onChange={(event) =>
            onAmbient({
              internal_air_C: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
      </div>

      <div>
        <FieldLabel
          label="Radiation Surrounding"
          zh="周圍輻射溫度"
          inline={false}
          unit="°C"
          htmlFor="bc-rad-surround"
          tooltip={T06.field.radiationSurrounding}
        />
        <NumberInput
          id="bc-rad-surround"
          className="mt-1 h-8 !text-[12px]"
          value={number(ambient.radiation_surrounding_C)}
          disabled={readOnly}
          onChange={(event) =>
            onAmbient({
              radiation_surrounding_C:
                event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
      </div>

      <div>
        <FieldLabel
          label="Wind Speed"
          zh="風速"
          unit="m/s"
          htmlFor="bc-wind"
          tooltip={T06.field.windSpeed}
        />
        <NumberInput
          id="bc-wind"
          className="mt-1 h-8 !text-[12px]"
          value={number(site.wind_speed_m_s)}
          disabled={readOnly}
          onChange={(event) =>
            onSite({
              wind_speed_m_s: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
      </div>

      <div>
        <FieldLabel
          label="Wind Direction"
          zh="風向"
          htmlFor="bc-wind-dir"
          tooltip={T06.field.windDirection}
        />
        <Select
          id="bc-wind-dir"
          className="mt-1 h-8 !text-[12px]"
          value={String(site.wind_direction_deg ?? 0)}
          disabled={readOnly}
          items={WIND_DIRECTIONS}
          onChange={(event) => onSite({ wind_direction_deg: Number(event.target.value) })}
        />
      </div>

      <div>
        <FieldLabel
          label="Air Flow Mode"
          zh="氣流模式"
          htmlFor="bc-airflow"
          tooltip={T06.field.airflowMode}
        />
        <Select
          id="bc-airflow"
          className="mt-1 h-8 !text-[12px]"
          value={site.airflow_mode}
          disabled={readOnly}
          items={AIRFLOW_MODES}
          onChange={(event) => onSite({ airflow_mode: event.target.value as AirflowMode })}
        />
      </div>

      <div>
        <FieldLabel
          label="Convection Method"
          zh="對流計算方式"
          inline={false}
          htmlFor="bc-conv-method"
          tooltip={T06.field.convectionMethod}
        />
        <Select
          id="bc-conv-method"
          className="mt-1 h-8 !text-[12px]"
          value={site.convection_method}
          disabled={readOnly}
          items={CONVECTION_METHODS}
          onChange={(event) =>
            onSite({ convection_method: event.target.value as ConvectionMethod })
          }
        />
      </div>

      <div className="flex items-center gap-2 rounded-md border border-line bg-surface-muted px-2.5 py-1.5">
        <input
          id="bc-solar-enabled"
          type="checkbox"
          checked={site.solar_enabled}
          disabled={readOnly}
          onChange={(event) => onSite({ solar_enabled: event.target.checked })}
          className="size-3.5 accent-accent-600"
        />
        <label
          htmlFor="bc-solar-enabled"
          title={biTitle('Enable Solar Load', T06.field.solarEnabled)}
          className="text-[12px] font-semibold text-ink-700"
        >
          Enable Solar Load <span className="font-normal text-ink-400">/ 啟用太陽負載</span>
        </label>
      </div>

      <div>
        <FieldLabel
          label="Solar Irradiance"
          zh="太陽輻照度"
          unit="W/m²"
          htmlFor="bc-solar"
          tooltip={T06.field.solarIrradiance}
        />
        <NumberInput
          id="bc-solar"
          className="mt-1 h-8 !text-[12px]"
          value={number(site.solar_irradiance_W_m2)}
          disabled={readOnly || !site.solar_enabled}
          onChange={(event) =>
            onSite({
              solar_irradiance_W_m2: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
      </div>

      <div>
        <FieldLabel
          label="Solar Incidence Angle"
          zh="太陽入射角"
          inline={false}
          unit="°"
          htmlFor="bc-solar-angle"
          tooltip={T06.field.solarIncidence}
        />
        <NumberInput
          id="bc-solar-angle"
          className="mt-1 h-8 !text-[12px]"
          value={number(site.solar_incidence_deg)}
          disabled={readOnly || !site.solar_enabled}
          onChange={(event) =>
            onSite({
              solar_incidence_deg: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
      </div>

      <div>
        <FieldLabel
          label="Altitude"
          zh="海拔高度"
          unit="m"
          htmlFor="bc-altitude"
          tooltip={T06.field.altitude}
        />
        <NumberInput
          id="bc-altitude"
          className="mt-1 h-8 !text-[12px]"
          value={number(site.altitude_m)}
          disabled={readOnly}
          onChange={(event) =>
            onSite({ altitude_m: event.target.value === '' ? null : Number(event.target.value) })
          }
        />
      </div>

      <div>
        <FieldLabel
          label="Data Source"
          zh="資料來源"
          htmlFor="bc-source"
          tooltip={T06.field.dataSource}
        />
        <Select
          id="bc-source"
          className="mt-1 h-8 !text-[12px]"
          value={ambient.source}
          disabled={readOnly}
          options={DATA_SOURCES}
          onChange={(event) => onAmbient({ source: event.target.value as BoundaryDataSource })}
        />
      </div>

      <div>
        <FieldLabel
          label="Confidence"
          zh="信心度"
          htmlFor="bc-confidence"
          tooltip={T06.field.confidence}
        />
        <Select
          id="bc-confidence"
          className="mt-1 h-8 !text-[12px]"
          value={ambient.confidence}
          disabled={readOnly}
          options={['high', 'medium', 'low']}
          onChange={(event) => onAmbient({ confidence: event.target.value as Confidence })}
        />
      </div>

      <div>
        <FieldLabel label="Notes" zh="備註" htmlFor="bc-notes" />
        <TextArea
          id="bc-notes"
          rows={2}
          className="mt-1 !text-[12px]"
          value={site.notes ?? ''}
          disabled={readOnly}
          onChange={(event) => onSite({ notes: event.target.value })}
        />
      </div>
    </div>
  );
}
