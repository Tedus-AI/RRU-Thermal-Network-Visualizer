/**
 * Artifact catalog and package presets — 12 §8, §21, §22, §23, §59.
 *
 * Laid out after `12.png`'s "2. Export Options" table: Export Item, Format,
 * Description, Prerequisite, Status, Select — with Select All / Clear All and
 * an "n / m items selected" counter underneath.
 *
 * §22 is the behaviour that matters: a BLOCKED or NOT_AVAILABLE artifact is
 * DISABLED WITH ITS REASON rather than hidden. An engineer who cannot export the
 * bottleneck CSV needs to be told that Screen 08 is stale — removing the row
 * would just leave them wondering where it went.
 */

import { AlertTriangle, Ban, CheckCircle2, CircleSlash } from 'lucide-react';

import { Badge, Button, Select } from '@/ui/primitives';
import { ColumnLabel, EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import {
  ARTIFACT_DEFINITIONS,
  ARTIFACT_STATUS_ZH,
  PRESET_LABELS,
  PRESETS,
  isSelectable,
  type ArtifactStatus,
  type ArtifactType,
  type ExportPreset,
} from '@/export/exportTypes';
import type { ArtifactReadiness } from '@/export/exportValidator';

import { ARTIFACT_TONE } from './exportViewModel';
import { T12 } from './tooltips';

const STATUS_ICON: Record<ArtifactStatus, typeof CheckCircle2> = {
  READY: CheckCircle2,
  WARNING: AlertTriangle,
  BLOCKED: Ban,
  NOT_AVAILABLE: CircleSlash,
  EXPORTING: CheckCircle2,
  EXPORTED: CheckCircle2,
  FAILED: Ban,
};

export function PackagePresetPanel({
  preset,
  onPreset,
  onSavePreset,
}: {
  preset: ExportPreset;
  onPreset: (preset: ExportPreset) => void;
  onSavePreset: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="ex-preset"
        className="flex items-center gap-1 text-[11px] font-semibold text-ink-700"
      >
        Package Preset
        <span className="font-normal text-ink-400">/ 封裝組合</span>
        <EngineeringInfo zh={T12.packagePreset} label="Package Preset" align="left" />
      </label>
      <Select
        id="ex-preset"
        className="h-8 !text-[11.5px]"
        value={preset}
        items={PRESETS.map((entry) => ({ value: entry, label: PRESET_LABELS[entry].label }))}
        onChange={(event) => onPreset(event.target.value as ExportPreset)}
      />
      <p className="text-[10.5px] leading-relaxed text-ink-500">
        {PRESET_LABELS[preset].note}
        <span className="block text-ink-400">{PRESET_LABELS[preset].zh}</span>
      </p>
      {/* 12 §23 — a preset only ever picks artifacts that pass their own
          prerequisites, so choosing one can never queue something BLOCKED. */}
      <p className="text-[10px] text-ink-400">
        A preset selects only artifacts that currently pass their prerequisites.
        <span className="block">組合僅會選取目前符合前置條件的項目。</span>
      </p>
      <Button className="!h-7 !text-[11px]" onClick={onSavePreset}>
        Save Export Preset / 儲存匯出組合
      </Button>
    </div>
  );
}

export function ArtifactSelectionPanel({
  readiness,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
  disabled,
}: {
  readiness: Record<ArtifactType, ArtifactReadiness>;
  selected: ArtifactType[];
  onToggle: (type: ArtifactType) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  disabled: boolean;
}) {
  const selectable = ARTIFACT_DEFINITIONS.filter((definition) =>
    isSelectable(readiness[definition.type]?.status ?? 'NOT_AVAILABLE'),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-[10.5px] text-ink-500">
              <th className="py-1.5 pr-2 font-semibold">
                <span className="flex items-center gap-1">
                  <ColumnLabel label="Export Item" zh="匯出項目" />
                  <EngineeringInfo zh={T12.artifact} label="Artifact" align="left" />
                </span>
              </th>
              <th className="py-1.5 pr-2 font-semibold">
                <ColumnLabel label="Format" zh="格式" />
              </th>
              <th className="py-1.5 pr-2 font-semibold">
                <ColumnLabel label="Description" zh="說明" />
              </th>
              <th className="py-1.5 pr-2 font-semibold">
                <ColumnLabel label="Prerequisite" zh="前置條件" />
              </th>
              <th className="py-1.5 pr-2 font-semibold">
                <ColumnLabel label="Status" zh="狀態" />
              </th>
              <th className="py-1.5 text-right font-semibold">
                <ColumnLabel label="Select" zh="選取" />
              </th>
            </tr>
          </thead>
          <tbody>
            {ARTIFACT_DEFINITIONS.map((definition) => {
              const entry = readiness[definition.type];
              const status = entry?.status ?? 'NOT_AVAILABLE';
              const Icon = STATUS_ICON[status];
              const canSelect = isSelectable(status);
              const checked = selected.includes(definition.type);

              return (
                <tr
                  key={definition.type}
                  data-artifact={definition.type}
                  className={`border-b border-line/60 align-top text-[11px] ${
                    canSelect ? '' : 'opacity-60'
                  }`}
                >
                  <td className="py-2 pr-2">
                    <span className="flex items-center gap-1.5 font-semibold text-ink-900">
                      <Icon
                        className={`size-3.5 shrink-0 ${
                          status === 'READY'
                            ? 'text-ok-600'
                            : status === 'WARNING'
                              ? 'text-warn-600'
                              : status === 'BLOCKED'
                                ? 'text-danger-600'
                                : 'text-ink-400'
                        }`}
                        aria-hidden
                      />
                      {definition.label}
                    </span>
                    <span className="block pl-5 text-[10px] text-ink-400">{definition.zh}</span>
                  </td>
                  <td className="py-2 pr-2">
                    <Badge tone="neutral">{definition.format}</Badge>
                  </td>
                  <td className="py-2 pr-2 text-ink-700">
                    {definition.description}
                    <span className="block text-[10px] text-ink-400">
                      {definition.description_zh}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-ink-500">
                    {definition.prerequisite}
                    <span className="block text-[10px] text-ink-400">
                      {definition.prerequisite_zh}
                    </span>
                  </td>
                  <td className="py-2 pr-2">
                    <Badge tone={ARTIFACT_TONE[status]}>{status}</Badge>
                    <span className="block text-[10px] text-ink-400">
                      {ARTIFACT_STATUS_ZH[status]}
                    </span>
                    {/* 12 §22 — the reason travels with the disabled state. */}
                    {entry?.reason && (
                      <span className="mt-0.5 block max-w-[15rem] text-[10px] leading-relaxed text-ink-500">
                        {entry.reason}
                        <span className="block text-ink-400">{entry.reason_zh}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-accent-600"
                      checked={checked}
                      disabled={!canSelect || disabled}
                      aria-label={`Select ${definition.label}`}
                      title={
                        canSelect
                          ? biTitle(`Select ${definition.label}`, `選取 ${definition.zh}`)
                          : biTitle(entry?.reason ?? 'Unavailable', entry?.reason_zh ?? '不可用')
                      }
                      onChange={() => onToggle(definition.type)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button className="!h-7 !px-2 !text-[11px]" disabled={disabled} onClick={onSelectAll}>
          Select All / 全選
        </Button>
        <Button className="!h-7 !px-2 !text-[11px]" disabled={disabled} onClick={onClearAll}>
          Clear All / 全不選
        </Button>
        <span className="ml-auto text-[11px] font-semibold text-accent-700 tabular">
          {selected.length} / {selectable.length} items selected
          <span className="ml-1 font-normal text-ink-400">已選取</span>
        </span>
      </div>
    </div>
  );
}
