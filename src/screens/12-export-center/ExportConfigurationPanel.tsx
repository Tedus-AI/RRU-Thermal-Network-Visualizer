/**
 * Export configuration and filename preview — 12 §19, §20, §24, §25, §26, §27.
 *
 * Laid out after `12.png`'s sections 3–4: the global settings on the left, the
 * filename template and its preview list on the right.
 *
 * Two rules are visible in the UI rather than only in the code:
 *   §19 — overriding the base filename changes the FILE, never project or
 *         scenario master data, and the panel says so.
 *   §20 — `Choose Folder` appears only when the browser really has the File
 *         System Access API. When it does not, the option is absent instead of
 *         being offered and then failing.
 */

import { FolderOpen, Info } from 'lucide-react';

import { Button, Select, TextInput } from '@/ui/primitives';
import { EngineeringInfo } from '@/ui/FieldLabel';
import {
  CSV_ENCODINGS,
  CSV_ENCODING_LABELS,
  DECIMAL_PRECISIONS,
  DESTINATIONS,
  DESTINATION_LABELS,
  JSON_FORMATS,
  OVERWRITE_LABELS,
  OVERWRITE_MODES,
  PNG_SCALES,
  type ArtifactType,
  type CsvEncoding,
  type DecimalPrecision,
  type Destination,
  type ExportConfiguration,
  type JsonFormat,
  type OverwriteMode,
  type PngScale,
} from '@/export/exportTypes';

import { T12 } from './tooltips';

function Row({
  label,
  zh,
  htmlFor,
  explanation,
  explanationLabel,
  children,
}: {
  label: string;
  zh: string;
  htmlFor?: string;
  explanation?: string;
  /**
   * 12 §56 names the tooltip labels that must exist, and two of them
   * (`UTF-8 BOM`, `Overwrite Handling`) do not match the field's own caption.
   * The tooltip is announced under the specification's name, not the caption's.
   */
  explanationLabel?: string;
  children: React.ReactNode;
}) {
  return (
    // The English caption and the Chinese one stack rather than sharing a line:
    // this panel sits in a half-width column, and side by side the English half
    // was the one getting truncated ("Overwrite …").
    <div className="flex items-center justify-between gap-2 py-0.5">
      <label htmlFor={htmlFor} className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1 text-[11px] text-ink-700">
          <span className="truncate">{label}</span>
          {explanation && (
            <EngineeringInfo zh={explanation} label={explanationLabel ?? label} align="left" />
          )}
        </span>
        <span className="truncate text-[10px] text-ink-400">{zh}</span>
      </label>
      <span className="w-[9.5rem] shrink-0 text-right">{children}</span>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-4 w-8 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-accent-600' : 'bg-ink-200'
      }`}
    >
      <span
        className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${
          checked ? 'left-4' : 'left-0.5'
        }`}
      />
    </button>
  );
}

export function ExportConfigurationPanel({
  config,
  onChange,
  folderSupported,
  folderName,
  onPickFolder,
  disabled,
}: {
  config: ExportConfiguration;
  onChange: (patch: Partial<ExportConfiguration>) => void;
  folderSupported: boolean;
  folderName: string | null;
  onPickFolder: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Row label="Base Filename" zh="基本檔名" htmlFor="ex-base" explanation={T12.filenamePreview}>
        <TextInput
          id="ex-base"
          className="h-8 !text-[11px]"
          value={config.base_filename}
          invalid={config.base_filename.trim().length === 0}
          disabled={disabled}
          onChange={(event) => onChange({ base_filename: event.target.value })}
        />
      </Row>

      <Row label="Include Project ID" zh="含專案代號">
        <Toggle
          label="Include Project ID"
          checked={config.include_project_id}
          disabled={disabled}
          onChange={(value) => onChange({ include_project_id: value })}
        />
      </Row>
      <Row label="Include Scenario ID" zh="含情境名稱">
        <Toggle
          label="Include Scenario ID"
          checked={config.include_scenario_id}
          disabled={disabled}
          onChange={(value) => onChange({ include_scenario_id: value })}
        />
      </Row>
      <Row label="Timestamp" zh="時間戳記">
        <Toggle
          label="Timestamp"
          checked={config.timestamp}
          disabled={disabled}
          onChange={(value) => onChange({ timestamp: value })}
        />
      </Row>

      <Row
        label="Overwrite Handling"
        zh="重複檔名"
        htmlFor="ex-overwrite"
        explanation={T12.overwriteHandling}
      >
        <Select
          id="ex-overwrite"
          className="h-8 !text-[11px]"
          value={config.overwrite}
          disabled={disabled}
          items={OVERWRITE_MODES.map((mode) => ({
            value: mode,
            label: OVERWRITE_LABELS[mode].label,
          }))}
          onChange={(event) => onChange({ overwrite: event.target.value as OverwriteMode })}
        />
      </Row>

      <Row
        label="CSV Encoding"
        zh="CSV 編碼"
        htmlFor="ex-encoding"
        explanation={T12.utf8Bom}
        explanationLabel="UTF-8 BOM"
      >
        <Select
          id="ex-encoding"
          className="h-8 !text-[11px]"
          value={config.csv_encoding}
          disabled={disabled}
          items={CSV_ENCODINGS.map((encoding) => ({
            value: encoding,
            label: CSV_ENCODING_LABELS[encoding].label,
          }))}
          onChange={(event) => onChange({ csv_encoding: event.target.value as CsvEncoding })}
        />
      </Row>

      <Row
        label="Decimal Precision"
        zh="小數位數"
        htmlFor="ex-precision"
        explanation={T12.decimalPrecision}
      >
        <Select
          id="ex-precision"
          className="h-8 !text-[11px]"
          value={String(config.decimal_precision)}
          disabled={disabled}
          items={DECIMAL_PRECISIONS.map((precision) => ({
            value: String(precision),
            label: `${precision} decimals`,
          }))}
          onChange={(event) =>
            onChange({ decimal_precision: Number(event.target.value) as DecimalPrecision })
          }
        />
      </Row>

      <Row label="CSV Units In Header" zh="欄名含單位">
        <Toggle
          label="CSV units in header"
          checked={config.csv_include_units}
          disabled={disabled}
          onChange={(value) => onChange({ csv_include_units: value })}
        />
      </Row>

      <Row label="JSON Format" zh="JSON 格式" htmlFor="ex-json" explanation={T12.jsonFormat}>
        <Select
          id="ex-json"
          className="h-8 !text-[11px]"
          value={config.json_format}
          disabled={disabled}
          items={JSON_FORMATS.map((format) => ({
            value: format,
            label: format === 'pretty' ? 'Pretty' : 'Compact',
          }))}
          onChange={(event) => onChange({ json_format: event.target.value as JsonFormat })}
        />
      </Row>

      <Row label="PNG Scale" zh="PNG 倍率" htmlFor="ex-png" explanation={T12.pngScale}>
        <Select
          id="ex-png"
          className="h-8 !text-[11px]"
          value={config.png_scale}
          disabled={disabled}
          items={PNG_SCALES.map((scale) => ({ value: scale, label: scale }))}
          onChange={(event) => onChange({ png_scale: event.target.value as PngScale })}
        />
      </Row>

      <Row label="ZIP Compression" zh="ZIP 壓縮" explanation={T12.zipCompression}>
        <Toggle
          label="ZIP compression"
          checked={config.zip_compression}
          disabled={disabled}
          onChange={(value) => onChange({ zip_compression: value })}
        />
      </Row>

      <Row label="Checksum" zh="檔案摘要" explanation={T12.checksum}>
        <Toggle
          label="SHA-256 checksum"
          checked={config.checksum}
          disabled={disabled}
          onChange={(value) => onChange({ checksum: value })}
        />
      </Row>

      <Row label="Destination" zh="匯出目的地" htmlFor="ex-dest" explanation={T12.destination}>
        <Select
          id="ex-dest"
          className="h-8 !text-[11px]"
          value={config.destination}
          disabled={disabled}
          // 12 §20 — the folder option only exists when the API does.
          items={DESTINATIONS.filter(
            (destination) => destination === 'browser_download' || folderSupported,
          ).map((destination) => ({
            value: destination,
            label: DESTINATION_LABELS[destination].label,
          }))}
          onChange={(event) => onChange({ destination: event.target.value as Destination })}
        />
      </Row>

      {config.destination === 'folder' && (
        <div className="flex items-center justify-between gap-2 py-0.5">
          <span className="flex min-w-0 flex-col text-[11px] text-ink-700">
            Output Folder <span className="text-[10px] text-ink-400">輸出資料夾</span>
          </span>
          <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <span className="min-w-0 flex-1 truncate rounded border border-line bg-surface-muted px-2 py-1 text-[11px] text-ink-700">
              {folderName ?? 'No folder chosen / 尚未選擇'}
            </span>
            <Button
              className="!h-7 !px-2 !text-[11px]"
              icon={<FolderOpen className="size-3.5" />}
              disabled={disabled}
              onClick={onPickFolder}
            >
              Browse
            </Button>
          </span>
        </div>
      )}

      {!folderSupported && (
        <p className="mt-1 flex items-start gap-1.5 rounded border border-line bg-surface-muted px-2 py-1.5 text-[10px] leading-relaxed text-ink-500">
          <Info className="mt-px size-3 shrink-0" aria-hidden />
          <span>
            This browser has no File System Access API, so Browser Download is the only
            destination. Files are still generated locally.
            <span className="block text-ink-400">
              此瀏覽器不支援 File System Access API，僅提供瀏覽器下載；檔案仍在本機產生。
            </span>
          </span>
        </p>
      )}

      <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
        12 §19 — overriding the base filename changes the exported file only. No project or
        scenario master data is modified.
        <span className="block">覆寫檔名只影響輸出檔案，不會修改專案或情境主檔。</span>
      </p>
    </div>
  );
}

/** 12 §19 — the filename preview list, as `12.png` shows it. */
export function FilenamePreview({
  entries,
}: {
  entries: Array<{ type: ArtifactType; label: string; filename: string }>;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-[11px] text-ink-400">
        Select an artifact to see its filename.
        <span className="block">選取匯出項目後會顯示檔名。</span>
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1" data-testid="filename-preview">
      {entries.map((entry) => (
        <li key={`${entry.type}-${entry.filename}`} className="min-w-0">
          <span className="block truncate font-mono text-[10.5px] text-ink-900" title={entry.filename}>
            {entry.filename}
          </span>
          <span className="block truncate text-[10px] text-ink-400">{entry.label}</span>
        </li>
      ))}
    </ul>
  );
}
