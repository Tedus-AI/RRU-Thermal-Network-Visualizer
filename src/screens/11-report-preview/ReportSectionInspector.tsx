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
  ReportPage,
  ReportSectionConfig,
  SectionContentOptions,
  SectionDisplayOptions,
  SectionId,
  SnapshotSummary,
} from '@/report/reportTypes';
import { sectionDefinition } from '@/report/sectionRegistry';
import { DEFAULT_LOGO_TEXT } from '@/report/defaultTemplate';

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

/** Scenario Summary's seven fields, in the order the section prints them. */
const SCENARIO_FIELDS = [
  { key: 'show_stage', label: 'Stage', zh: '階段' },
  { key: 'show_scenario', label: 'Scenario', zh: '情境' },
  { key: 'show_ambient', label: 'Ambient', zh: '環境溫度' },
  { key: 'show_wind', label: 'Wind', zh: '風速' },
  { key: 'show_solar', label: 'Solar', zh: '太陽輻射' },
  { key: 'show_power_scale', label: 'Power Scale', zh: '功率倍率' },
  { key: 'show_last_solved', label: 'Last Solved', zh: '最後求解' },
] as const;

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

/**
 * A labelled text field.
 *
 * The input was a fixed 10 rem against a label that took whatever it liked,
 * which is how "FR1 RRU starkcore 12L Thermal Engineering Report" came to be
 * edited four words at a time. The label is capped instead and the input takes
 * the rest of the row — `wide` gives the longest fields (the title and the
 * subtitle) a still narrower label.
 */
function TextRow({
  label,
  zh,
  value,
  readOnly,
  invalid,
  placeholder,
  type,
  wide,
  onChange,
}: {
  label: string;
  zh: string;
  value: string;
  readOnly: boolean;
  invalid?: boolean;
  placeholder?: string;
  type?: string;
  wide?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 py-1">
      <span
        className={`flex min-w-0 shrink-0 items-center gap-1 text-[11px] text-ink-700 ${
          wide ? 'basis-[5.5rem]' : 'basis-[8.5rem]'
        }`}
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-[10px] text-ink-400">{zh}</span>
      </span>
      <TextInput
        className="h-7 min-w-0 flex-1 !text-[11px]"
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
  pages,
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
  /** The current pagination, so the Display tab can say where this lands. */
  pages: ReportPage[];
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

  const onPages = pages.filter((page) => page.section_ids.includes(section.id));
  const placement = !section.included
    ? '未納入報告，因此不佔任何頁面。'
    : onPages.length === 0
      ? '尚未配置頁面。'
      : onPages.length > 1
        ? `跨第 ${onPages[0].page_number}–${onPages[onPages.length - 1].page_number} 頁`
        : (() => {
            const page = onPages[0];
            const others = page.section_ids.length - 1;
            return others === 0
              ? `位於第 ${page.page_number} 頁，獨占一頁`
              : `位於第 ${page.page_number} 頁，與其他 ${others} 個章節同頁`;
          })();

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
                  wide
                  value={cover.title}
                  readOnly={readOnly}
                  invalid={cover.title.trim().length === 0}
                  onChange={(value) => onCover({ title: value })}
                />
                <TextRow
                  label="Subtitle"
                  zh="副標題"
                  wide
                  value={cover.subtitle ?? ''}
                  readOnly={readOnly}
                  onChange={(value) => onCover({ subtitle: value })}
                />
                {/* Screen 01's name, in the box, rather than behind it as grey
                    placeholder text — a field that looks empty reads as one
                    nobody filled in, and the cover has always printed the
                    project's name. Clearing it falls back to 01 again. */}
                <TextRow
                  label="Project Name"
                  zh="專案名稱"
                  value={cover.config.project_name_override || cover.project_name}
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
                {/* The wordmark beside the mark. It is the team's report, not
                    this tool's brochure, so the words are theirs to set. */}
                {cover.config.show_logo && (
                  <TextRow
                    label="Logo Text"
                    zh="標誌文字"
                    wide
                    value={cover.config.logo_text ?? DEFAULT_LOGO_TEXT}
                    readOnly={readOnly}
                    placeholder={DEFAULT_LOGO_TEXT}
                    onChange={(value) => onCover({ cover: { logo_text: value } })}
                  />
                )}
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

            {section.id === 'project' && (
              <>
                {SCENARIO_FIELDS.map(({ key, label, zh }) => (
                  <Row key={key} label={label} zh={zh}>
                    <Toggle
                      label={label}
                      checked={content[key] !== false}
                      disabled={readOnly}
                      onChange={(value) => onContent(section.id, { [key]: value })}
                    />
                  </Row>
                ))}
              </>
            )}

            {!['critical', 'project'].includes(section.id) && (
              <p className="py-4 text-[11px] text-ink-400">此章節沒有內容選項。</p>
            )}
          </div>
        )}

        {/* --- Display (11 §25) ------------------------------------------ */}
        {tab === 'display' && (
          <div className="flex flex-col">
            {/* Where this section currently lands.
                Page Break Before and Keep Table Together change PAGINATION,
                not how a page is drawn, so on this screen they looked inert —
                you toggle one and the page in front of you is identical. This
                line moves the moment either does, which is the whole of what
                they do. */}
            <p className="mb-1 rounded border border-line bg-surface-muted px-2 py-1.5 text-[10.5px] text-ink-700">
              {placement}
            </p>
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
                此章節在目前快照中沒有資料，將顯示 Not Available。
                <span className="block font-normal">
                </span>
              </p>
            )}

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
