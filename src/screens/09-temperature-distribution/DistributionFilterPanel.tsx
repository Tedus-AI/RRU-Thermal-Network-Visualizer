/**
 * Scope, Group By, Filters and Histogram Settings — 09 §7, §8, §9, §11, §13.
 * Laid out after the PNG's left column, top to bottom.
 *
 * Every compact engineering label carries an `EngineeringInfo` affordance, not
 * a bare `title`: 09 §3.3 and AC-09-34 do not accept the native attribute for
 * these fields.
 */

import { NumberInput, Select } from '@/ui/primitives';
import { EngineeringInfo } from '@/ui/FieldLabel';
import { BIN_PRESETS, type BinMode } from '@/thermal/analysis/temperatureStatistics';
import {
  GROUP_BYS,
  GROUP_BY_LABELS,
  SCOPES,
  SCOPE_LABELS,
  type DistributionFilters,
  type DistributionScope,
  type GroupBy,
} from '@/thermal/analysis/temperatureDataset';

import { T09 } from './tooltips';

/** A label with its Chinese name inline and an engineering explanation icon. */
function ControlLabel({
  label,
  zh,
  htmlFor,
  explanation,
}: {
  label: string;
  zh: string;
  htmlFor: string;
  /** Engineering explanation. Falls back to the Chinese name when none is given. */
  explanation?: string;
}) {
  // 09 §3.1 — this column is narrow, so English stays visible and the Chinese
  // rides on the hover explanation rather than being truncated into nonsense.
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-center gap-1 text-[11px] font-semibold text-ink-700"
    >
      <span className="truncate">{label}</span>
      <EngineeringInfo zh={explanation ?? zh} label={label} align="left" />
    </label>
  );
}

function withAll(values: string[]): Array<{ value: string; label: string }> {
  return [{ value: 'All', label: 'All' }, ...values.map((value) => ({ value, label: value }))];
}

export function ScopePanel({
  scope,
  groupBy,
  disabled,
  onScope,
  onGroupBy,
}: {
  scope: DistributionScope;
  groupBy: GroupBy;
  disabled: boolean;
  onScope: (scope: DistributionScope) => void;
  onGroupBy: (groupBy: GroupBy) => void;
}) {
  // "Scope" and "Group By" are short, so this panel gives the label column less
  // room than the filter rows below and hands the difference to the select — the
  // widest option the specification names is "Components With Limits" and it has
  // to read in full, not clipped.
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[5rem_1fr] items-center gap-2">
        <ControlLabel label="Scope" zh="範圍" htmlFor="td-scope" explanation={T09.scope} />
        <Select
          id="td-scope"
          className="h-8 !text-[11px]"
          value={scope}
          disabled={disabled}
          items={SCOPES.map((entry) => ({ value: entry, label: SCOPE_LABELS[entry].label }))}
          onChange={(event) => onScope(event.target.value as DistributionScope)}
        />
      </div>
      <div className="grid grid-cols-[5rem_1fr] items-center gap-2">
        <ControlLabel label="Group By" zh="分組" htmlFor="td-group" explanation={T09.groupBy} />
        <Select
          id="td-group"
          className="h-8 !text-[11px]"
          value={groupBy}
          disabled={disabled}
          items={GROUP_BYS.map((entry) => ({ value: entry, label: GROUP_BY_LABELS[entry].label }))}
          onChange={(event) => onGroupBy(event.target.value as GroupBy)}
        />
      </div>
    </div>
  );
}

export function DistributionFilterPanel({
  filters,
  options,
  disabled,
  onChange,
}: {
  filters: DistributionFilters;
  options: { categories: string[]; nodeTypes: string[]; zones: string[]; limitTypes: string[] };
  disabled: boolean;
  onChange: (patch: Partial<DistributionFilters>) => void;
}) {
  const row = (
    label: string,
    zh: string,
    id: string,
    value: string,
    items: Array<{ value: string; label: string }>,
    onSelect: (value: string) => void,
    explanation?: string,
  ) => (
    <div className="grid grid-cols-[5.75rem_1fr] items-center gap-2">
      <ControlLabel label={label} zh={zh} htmlFor={id} explanation={explanation} />
      <Select
        id={id}
        className="h-8 !text-[11px]"
        value={value}
        disabled={disabled}
        items={items}
        onChange={(event) => onSelect(event.target.value)}
      />
    </div>
  );

  return (
    <div className="grid gap-2">
      {row('Category', '類別', 'td-f-cat', filters.category, withAll(options.categories), (value) =>
        onChange({ category: value }), '依元件類別篩選，例如 RF、Digital、Power。類別來自 02 匯入的元件資料。',
      )}
      {row('Node Type', '節點類型', 'td-f-type', filters.node_type, withAll(options.nodeTypes), (value) =>
        onChange({ node_type: value }), '依 05 定義的節點類型篩選，例如 junction、case、heat_sink_base。',
      )}
      {row('Zone', '區域', 'td-f-zone', filters.zone, withAll(options.zones), (value) =>
        onChange({ zone: value }), '依節點所屬的基座區域篩選。',
      )}
      {row('Limit Type', '限制類型', 'td-f-limit', filters.limit_type, withAll(options.limitTypes), (value) =>
        onChange({ limit_type: value }), T09.limitType,
      )}
      {row(
        'Heat Source',
        '熱源 / 被動',
        'td-f-source-kind',
        filters.source_kind,
        [
          { value: 'all', label: 'All' },
          { value: 'heat_source', label: 'Heat Sources' },
          { value: 'passive', label: 'Passive' },
        ],
        (value) => onChange({ source_kind: value as DistributionFilters['source_kind'] }),
        '區分有功耗的熱源節點與純被動節點。',
      )}
      {row(
        'Result Source',
        '結果來源',
        'td-f-result',
        filters.result_source,
        // 09 §46, AC-09-23/24 — only datasets that actually exist are offered.
        // FloTHERM and measurement appear when Screen 03 lands, never before.
        [{ value: 'analytical', label: 'Analytical' }],
        (value) => onChange({ result_source: value as DistributionFilters['result_source'] }),
        T09.resultSource,
      )}

      <div className="grid grid-cols-[5.75rem_1fr_1fr] items-center gap-2">
        <ControlLabel
          label="Temp Range"
          zh="溫度範圍"
          htmlFor="td-f-tmin"
          explanation="只納入溫度落在此範圍內的節點；留空表示不設限。"
        />
        <NumberInput
          id="td-f-tmin"
          className="h-8 !text-[11px]"
          placeholder="Min °C"
          value={filters.temperature_min_C ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              temperature_min_C: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
        <NumberInput
          className="h-8 !text-[11px]"
          placeholder="Max °C"
          aria-label="Maximum temperature"
          value={filters.temperature_max_C ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              temperature_max_C: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
      </div>

      <div className="grid grid-cols-[5.75rem_1fr_1fr] items-center gap-2">
        <ControlLabel
          label="Margin Range"
          zh="餘裕範圍"
          htmlFor="td-f-mmin"
          explanation={T09.marginRange}
        />
        <NumberInput
          id="td-f-mmin"
          className="h-8 !text-[11px]"
          placeholder="Min °C"
          value={filters.margin_min_C ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({ margin_min_C: event.target.value === '' ? null : Number(event.target.value) })
          }
        />
        <NumberInput
          className="h-8 !text-[11px]"
          placeholder="Max °C"
          aria-label="Maximum margin"
          value={filters.margin_max_C ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({ margin_max_C: event.target.value === '' ? null : Number(event.target.value) })
          }
        />
      </div>
    </div>
  );
}

export function HistogramSettingsPanel({
  binMode,
  customBin,
  warningThreshold,
  disabled,
  onBinMode,
  onCustomBin,
  onWarningThreshold,
}: {
  binMode: BinMode;
  customBin: number;
  warningThreshold: number;
  disabled: boolean;
  onBinMode: (mode: BinMode) => void;
  onCustomBin: (value: number) => void;
  onWarningThreshold: (value: number) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
        <ControlLabel
          label="Histogram Bin"
          zh="區間寬度"
          htmlFor="td-bin"
          explanation={T09.histogramBin}
        />
        <Select
          id="td-bin"
          className="h-8 !text-[11px]"
          value={binMode}
          disabled={disabled}
          items={BIN_PRESETS.map((mode) => ({
            value: mode,
            label: mode === 'auto' ? 'Auto' : mode === 'custom' ? 'Custom' : `${mode} °C`,
          }))}
          onChange={(event) => onBinMode(event.target.value as BinMode)}
        />
      </div>

      {binMode === 'custom' && (
        <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
          <ControlLabel
            label="Custom Bin"
            zh="自訂寬度"
            htmlFor="td-bin-custom"
            explanation="自訂直方圖的區間寬度（°C）。"
          />
          <NumberInput
            id="td-bin-custom"
            className="h-8 !text-[11px]"
            min={0.5}
            step={0.5}
            value={customBin}
            disabled={disabled}
            onChange={(event) => onCustomBin(Number(event.target.value))}
          />
        </div>
      )}

      <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
        <ControlLabel
          label="Warning Threshold"
          zh="警示溫度"
          htmlFor="td-warning"
          explanation={T09.warningThreshold}
        />
        <NumberInput
          id="td-warning"
          className="h-8 !text-[11px]"
          step={5}
          value={warningThreshold}
          disabled={disabled}
          onChange={(event) => onWarningThreshold(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
