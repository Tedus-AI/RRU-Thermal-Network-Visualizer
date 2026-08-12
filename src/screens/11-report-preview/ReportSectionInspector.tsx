/**
 * Section Inspector — 11 §23, §24, §25, §26, §27.
 *
 * Four tabs, in the specification's order: Content, Display, Data, Notes.
 * Content and Display change LAYOUT; Data is strictly read-only and says where
 * the section's numbers came from; Notes stores report-only text that never
 * touches an engineering result (§27).
 */

import { useState } from 'react';

import { Badge, Select, TextArea, TextInput } from '@/ui/primitives';
import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import type {
  ReportCoverConfig,
  ReportSectionConfig,
  SectionContentOptions,
  SectionDisplayOptions,
  SectionId,
  SnapshotSummary,
} from '@/report/reportTypes';
import { sectionDefinition } from '@/report/sectionRegistry';

import { SNAPSHOT_TONE, timeOf } from './reportViewModel';
import { T11 } from './tooltips';

export const INSPECTOR_TABS = ['content', 'display', 'data', 'notes'] as const;
export type InspectorTab = (typeof INSPECTOR_TABS)[number];

const TAB_LABELS: Record<InspectorTab, { label: string; zh: string }> = {
  content: { label: 'Content', zh: '內容' },
  display: { label: 'Display', zh: '顯示' },
  data: { label: 'Data', zh: '資料' },
  notes: { label: 'Notes', zh: '備註' },
};

const NOTE_LIMIT = 500;

function Row({
  label,
  zh,
  explanation,
  children,
}: {
  label: string;
  zh: string;
  explanation?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="flex min-w-0 items-center gap-1 text-[11px] text-ink-700">
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-[10px] text-ink-400">{zh}</span>
        {explanation && <EngineeringInfo zh={explanation} label={label} align="left" />}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

function TextRow({
  label,
  zh,
  value,
  readOnly,
  invalid,
  placeholder,
  type,
  onChange,
}: {
  label: string;
  zh: string;
  value: string;
  readOnly: boolean;
  invalid?: boolean;
  placeholder?: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="flex min-w-0 items-center gap-1 text-[11px] text-ink-700">
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-[10px] text-ink-400">{zh}</span>
      </span>
      <TextInput
        className="h-7 !w-[10rem] shrink-0 !text-[11px]"
        type={type}
        value={value}
        disabled={readOnly}
        invalid={invalid}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (value: boolean) => void;
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

/** 11 §7 — everything the Cover section's Content tab needs. */
export interface CoverInput {
  title: string;
  subtitle?: string;
  config: ReportCoverConfig;
  project_name: string;
  project_id: string;
  scenario_name: string;
}

export function ReportSectionInspector({
  sections,
  selectedId,
  snapshot,
  unavailable,
  readOnly,
  cover,
  onSelect,
  onContent,
  onDisplay,
  onNote,
  onCover,
}: {
  sections: ReportSectionConfig[];
  selectedId: SectionId;
  snapshot: SnapshotSummary;
  unavailable: SectionId[];
  readOnly: boolean;
  cover: CoverInput;
  onSelect: (id: SectionId) => void;
  onContent: (id: SectionId, patch: Partial<SectionContentOptions>) => void;
  onDisplay: (id: SectionId, patch: Partial<SectionDisplayOptions>) => void;
  onNote: (id: SectionId, note: string) => void;
  onCover: (patch: {
    title?: string;
    subtitle?: string;
    cover?: Partial<ReportCoverConfig>;
  }) => void;
}) {
  const [tab, setTab] = useState<InspectorTab>('content');

  const section = sections.find((entry) => entry.id === selectedId) ?? sections[0];
  if (!section) return null;
  const definition = sectionDefinition(section.id);
  const content = section.content;

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {/* --- selected section --------------------------------------------- */}
      <div>
        <label
          htmlFor="rp-section"
          className="text-[11px] font-semibold text-ink-700"
        >
          Selected Section <span className="font-normal text-ink-400">/ 已選章節</span>
        </label>
        <Select
          id="rp-section"
          className="mt-1 h-8 !text-[11.5px]"
          value={section.id}
          items={sections.map((entry, index) => ({
            value: entry.id,
            label: `${index + 1} ${sectionDefinition(entry.id).title}`,
          }))}
          onChange={(event) => onSelect(event.target.value as SectionId)}
        />
      </div>

      {/* --- tabs (11 §23) ------------------------------------------------ */}
      <div
        role="tablist"
        aria-label={biTitle('Section inspector', '章節檢視器')}
        className="flex border-b border-line"
      >
        {INSPECTOR_TABS.map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={tab === entry}
            onClick={() => setTab(entry)}
            className={`-mb-px flex-1 border-b-2 px-1 py-1.5 text-[11px] font-semibold transition-colors ${
              tab === entry
                ? 'border-accent-600 text-accent-700'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {TAB_LABELS[entry].label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {/* --- Content (11 §24) ------------------------------------------ */}
        {tab === 'content' && (
          <div className="flex flex-col">
            {/* --- Cover fields (11 §7) --------------------------------- */}
            {section.id === 'cover' && (
              <>
                <TextRow
                  label="Report Title"
                  zh="報告標題"
                  value={cover.title}
                  readOnly={readOnly}
                  invalid={cover.title.trim().length === 0}
                  onChange={(value) => onCover({ title: value })}
                />
                <TextRow
                  label="Subtitle"
                  zh="副標題"
                  value={cover.subtitle ?? ''}
                  readOnly={readOnly}
                  onChange={(value) => onCover({ subtitle: value })}
                />
                <TextRow
                  label="Project Name"
                  zh="專案名稱"
                  value={cover.config.project_name_override ?? ''}
                  readOnly={readOnly}
                  placeholder={cover.project_name}
                  onChange={(value) => onCover({ cover: { project_name_override: value } })}
                />
                {/* Identity, not a display override: 11 §7 keeps these read-only
                    so a report can never disagree with the project it cites. */}
                <Row label="Project ID" zh="專案代號">
                  <span className="text-[11px] font-semibold text-ink-900">{cover.project_id}</span>
                </Row>
                <TextRow
                  label="Customer / Program"
                  zh="客戶 / 專案"
                  value={cover.config.customer_program ?? ''}
                  readOnly={readOnly}
                  onChange={(value) => onCover({ cover: { customer_program: value } })}
                />
                <Row label="Scenario" zh="情境">
                  <span className="text-[11px] font-semibold text-ink-900">
                    {cover.scenario_name}
                  </span>
                </Row>
                <TextRow
                  label="Prepared By"
                  zh="製作者"
                  value={cover.config.prepared_by}
                  readOnly={readOnly}
                  onChange={(value) => onCover({ cover: { prepared_by: value } })}
                />
                <TextRow
                  label="Prepared Date"
                  zh="製作日期"
                  type="date"
                  value={cover.config.prepared_date}
                  readOnly={readOnly}
                  onChange={(value) => onCover({ cover: { prepared_date: value } })}
                />
                <TextRow
                  label="Company / Team"
                  zh="公司 / 團隊"
                  value={cover.config.company_team}
                  readOnly={readOnly}
                  onChange={(value) => onCover({ cover: { company_team: value } })}
                />
                <TextRow
                  label="Confidentiality"
                  zh="機密等級"
                  value={cover.config.confidentiality}
                  readOnly={readOnly}
                  onChange={(value) => onCover({ cover: { confidentiality: value } })}
                />
                <Row label="Show Logo" zh="顯示標誌">
                  <Toggle
                    label="Show Logo"
                    checked={cover.config.show_logo}
                    disabled={readOnly}
                    onChange={(value) => onCover({ cover: { show_logo: value } })}
                  />
                </Row>
                <p className="pt-2 text-[10px] leading-relaxed text-ink-400">
                  Report display overrides only. 11 §7 — none of these edit the project master data
                  in Screen 01.
                  <span className="block">僅為報告顯示用，不會修改 01 的專案主檔。</span>
                </p>
              </>
            )}

            {section.id === 'critical' && (
              <>
                <Row label="Row Count" zh="列數" explanation={T11.criticalRowCount}>
                  <Select
                    className="h-7 !w-[7.5rem] !text-[11px]"
                    aria-label="Row count"
                    value={String(content.row_count ?? 5)}
                    disabled={readOnly}
                    items={[
                      { value: '5', label: 'Top 5' },
                      { value: '10', label: 'Top 10' },
                      { value: '0', label: 'All' },
                    ]}
                    onChange={(event) =>
                      onContent(section.id, { row_count: Number(event.target.value) })
                    }
                  />
                </Row>
                <Row label="Sort Mode" zh="排序方式">
                  <Select
                    className="h-7 !w-[9.5rem] !text-[11px]"
                    aria-label="Sort mode"
                    value={content.sort_mode ?? 'lowest_margin'}
                    disabled={readOnly}
                    items={[
                      { value: 'lowest_margin', label: 'Lowest Margin' },
                      { value: 'highest_temperature', label: 'Highest Temperature' },
                    ]}
                    onChange={(event) =>
                      onContent(section.id, {
                        sort_mode: event.target.value as 'lowest_margin' | 'highest_temperature',
                      })
                    }
                  />
                </Row>
                <Row label="Show Limit Type" zh="顯示限制類型">
                  <Toggle
                    label="Show Limit Type"
                    checked={content.show_limit_type !== false}
                    disabled={readOnly}
                    onChange={(value) => onContent(section.id, { show_limit_type: value })}
                  />
                </Row>
                <Row label="Show Margin" zh="顯示餘裕">
                  <Toggle
                    label="Show Margin"
                    checked={content.show_margin !== false}
                    disabled={readOnly}
                    onChange={(value) => onContent(section.id, { show_margin: value })}
                  />
                </Row>
                <Row label="Show Status" zh="顯示狀態">
                  <Toggle
                    label="Show Status"
                    checked={content.show_status !== false}
                    disabled={readOnly}
                    onChange={(value) => onContent(section.id, { show_status: value })}
                  />
                </Row>
              </>
            )}

            {section.id === 'bottleneck' && (
              <>
                <Row label="Top N" zh="列出筆數" explanation={T11.bottleneckTopN}>
                  <Select
                    className="h-7 !w-[7.5rem] !text-[11px]"
                    aria-label="Top N"
                    value={String(content.top_n ?? 3)}
                    disabled={readOnly}
                    items={[
                      { value: '3', label: 'Top 3' },
                      { value: '5', label: 'Top 5' },
                      { value: '10', label: 'Top 10' },
                    ]}
                    onChange={(event) =>
                      onContent(section.id, { top_n: Number(event.target.value) })
                    }
                  />
                </Row>
                <Row label="Show Score" zh="顯示分數">
                  <Toggle
                    label="Show Score"
                    checked={content.show_score !== false}
                    disabled={readOnly}
                    onChange={(value) => onContent(section.id, { show_score: value })}
                  />
                </Row>
                <Row label="Show Sensitivity" zh="顯示敏感度">
                  <Toggle
                    label="Show Sensitivity"
                    checked={content.show_sensitivity !== false}
                    disabled={readOnly}
                    onChange={(value) => onContent(section.id, { show_sensitivity: value })}
                  />
                </Row>
                <Row label="Show Confidence" zh="顯示可信度">
                  <Toggle
                    label="Show Confidence"
                    checked={content.show_confidence !== false}
                    disabled={readOnly}
                    onChange={(value) => onContent(section.id, { show_confidence: value })}
                  />
                </Row>
              </>
            )}

            {section.id === 'distribution' && (
              <>
                <Row label="Show Range Summary" zh="顯示範圍摘要">
                  <Toggle
                    label="Show Range Summary"
                    checked={content.show_range_summary !== false}
                    disabled={readOnly}
                    onChange={(value) => onContent(section.id, { show_range_summary: value })}
                  />
                </Row>
                <Row
                  label="Include Histogram Snapshot"
                  zh="嵌入直方圖快照"
                  explanation={T11.includeHistogram}
                >
                  <Toggle
                    label="Include Histogram Snapshot"
                    checked={content.include_histogram_snapshot === true}
                    disabled={readOnly}
                    onChange={(value) =>
                      onContent(section.id, { include_histogram_snapshot: value })
                    }
                  />
                </Row>
                <Row label="Include Hot Node Table" zh="嵌入熱點節點表">
                  <Toggle
                    label="Include Hot Node Table"
                    checked={content.include_hot_node_table === true}
                    disabled={readOnly}
                    onChange={(value) => onContent(section.id, { include_hot_node_table: value })}
                  />
                </Row>
              </>
            )}

            {!['critical', 'bottleneck', 'distribution'].includes(section.id) && (
              <p className="py-4 text-[11px] leading-relaxed text-ink-400">
                This section has no content options. Its fields are fixed by the specification so
                the report always states the same things about the result.
                <span className="block">
                  此章節沒有內容選項；欄位由規格固定，確保報告對結果的陳述一致。
                </span>
              </p>
            )}
          </div>
        )}

        {/* --- Display (11 §25) ------------------------------------------ */}
        {tab === 'display' && (
          <div className="flex flex-col">
            <Row label="Section Title" zh="章節標題">
              <input
                type="text"
                aria-label="Section title"
                className="h-7 w-[10rem] rounded-md border border-line-strong bg-surface px-2 text-[11px] text-ink-900 focus:border-accent-500 focus:outline-none disabled:bg-surface-muted"
                value={section.display.title_override ?? definition.title}
                disabled={readOnly}
                onChange={(event) =>
                  onDisplay(section.id, { title_override: event.target.value })
                }
              />
            </Row>
            <Row label="Page Break Before" zh="前置換頁" explanation={T11.pageBreakBefore}>
              <Toggle
                label="Page Break Before"
                checked={section.display.page_break_before}
                disabled={readOnly}
                onChange={(value) => onDisplay(section.id, { page_break_before: value })}
              />
            </Row>
            <Row label="Keep Table Together" zh="表格不分頁" explanation={T11.keepTableTogether}>
              <Toggle
                label="Keep Table Together"
                checked={section.display.keep_table_together}
                disabled={readOnly}
                onChange={(value) => onDisplay(section.id, { keep_table_together: value })}
              />
            </Row>
            <Row label="Compact Spacing" zh="緊湊行距" explanation={T11.compactSpacing}>
              <Toggle
                label="Compact Spacing"
                checked={section.display.compact_spacing}
                disabled={readOnly}
                onChange={(value) => onDisplay(section.id, { compact_spacing: value })}
              />
            </Row>
            <p className="pt-2 text-[10px] leading-relaxed text-ink-400">
              Layout options only. 11 §25 deliberately stops short of free-form word-processor
              behaviour in V1.
            </p>
          </div>
        )}

        {/* --- Data (11 §26) — read-only --------------------------------- */}
        {tab === 'data' && (
          <div className="flex flex-col gap-1.5">
            <Row label="Snapshot Source" zh="快照來源" explanation={T11.snapshotSource}>
              <span className="text-[11px] font-semibold text-ink-900">
                {snapshot.snapshot_id ?? 'None'}
              </span>
            </Row>
            <Row label="Snapshot Status" zh="快照狀態" explanation={T11.snapshotStatus}>
              <Badge tone={SNAPSHOT_TONE[snapshot.state]}>{snapshot.state}</Badge>
            </Row>
            <Row label="Source Screen" zh="來源畫面" explanation={T11.sourceScreen}>
              <span className="text-[11px] font-semibold text-ink-900">
                {definition.source_screen}
              </span>
            </Row>
            <Row label="Last Updated" zh="最後更新">
              <span className="text-[11px] text-ink-700">{timeOf(snapshot.created_at)}</span>
            </Row>

            <p className="mt-1 text-[10px] leading-relaxed text-ink-500">
              {definition.source_zh}
            </p>

            {unavailable.includes(section.id) && (
              <p className="rounded border border-warn-500/40 bg-warn-100 px-2 py-1.5 text-[10.5px] font-semibold text-warn-600">
                No data for this section in the current snapshot. It renders as Not Available; no
                rows are estimated.
                <span className="block font-normal">
                  此章節在目前快照中沒有資料，將顯示 Not Available，不會以估算值填補。
                </span>
              </p>
            )}

            <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
              Read-only. Screen 11 never recalculates a thermal value; edit inputs in Screens 04–07.
            </p>
          </div>
        )}

        {/* --- Notes (11 §27) -------------------------------------------- */}
        {tab === 'notes' && (
          <SectionNoteEditor
            inputId="rp-note"
            section={section}
            readOnly={readOnly}
            onNote={onNote}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The note editor — 11 §27.
 *
 * 11.png shows it twice: as the inspector's Notes tab and as a panel pinned to
 * the foot of the right rail, so a note can be written without leaving the
 * Content tab. Both edit the same field on the same section.
 */
export function SectionNoteEditor({
  inputId,
  section,
  readOnly,
  onNote,
}: {
  inputId: string;
  section: ReportSectionConfig;
  readOnly: boolean;
  onNote: (id: SectionId, note: string) => void;
}) {
  const definition = sectionDefinition(section.id);
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="flex items-center gap-1 text-[11px] font-semibold text-ink-700"
      >
        Section Note
        <span className="font-normal text-ink-400">/ 章節備註</span>
        <EngineeringInfo zh={T11.reportOnlyText} label="Report-only text" align="left" />
        <span className="ml-auto truncate text-[10px] font-normal text-ink-400">
          {definition.title}
        </span>
      </label>
      <TextArea
        id={inputId}
        rows={4}
        className="!text-[11px]"
        value={section.note ?? ''}
        disabled={readOnly}
        maxLength={NOTE_LIMIT}
        placeholder="Report-only note for this section…"
        onChange={(event) => onNote(section.id, event.target.value)}
      />
      <p className="flex items-center justify-between text-[10px] text-ink-400">
        <span>Report-only text · 不會修改任何分析結果</span>
        <span className="tabular">
          {(section.note ?? '').length} / {NOTE_LIMIT}
        </span>
      </p>
    </div>
  );
}
