/**
 * Left panel — Report Template, Outline / Pages tabs — 11 §6, §11.
 *
 * Outline lists every section with its number, title, REQ badge, include
 * checkbox and a drag affordance, exactly as the PNG shows. Reordering here
 * changes the report LAYOUT only: 11 §6 is explicit that it must never mutate
 * the Screen 10 snapshot, and this panel never sees snapshot data at all.
 */

import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react';

import { Badge, Button, Select } from '@/ui/primitives';
import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import type { ReportPage, ReportSectionConfig, SectionId } from '@/report/reportTypes';
import { sectionDefinition } from '@/report/sectionRegistry';

import { T11 } from './tooltips';

export const OUTLINE_TABS = ['outline', 'pages'] as const;
export type OutlineTab = (typeof OUTLINE_TABS)[number];

export function ReportOutlinePanel({
  templateName,
  templates,
  sections,
  pages,
  selectedId,
  currentPage,
  unavailable,
  readOnly,
  onTemplate,
  onSelect,
  onToggle,
  onMove,
  onDrop,
  onReset,
  onPage,
}: {
  templateName: string;
  templates: string[];
  sections: ReportSectionConfig[];
  pages: ReportPage[];
  selectedId: SectionId;
  currentPage: number;
  /** Sections whose backing data is absent from the snapshot (11 §17, §18). */
  unavailable: SectionId[];
  readOnly: boolean;
  onTemplate: (name: string) => void;
  onSelect: (id: SectionId) => void;
  onToggle: (id: SectionId) => void;
  onMove: (id: SectionId, direction: -1 | 1) => void;
  onDrop: (id: SectionId, toIndex: number) => void;
  onReset: () => void;
  onPage: (page: number) => void;
}) {
  const [tab, setTab] = useState<OutlineTab>('outline');
  const [dragging, setDragging] = useState<SectionId | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {/* --- template (11 §34) ------------------------------------------- */}
      <div>
        <label
          htmlFor="rp-template"
          className="flex items-center gap-1 text-[11px] font-semibold text-ink-700"
        >
          Report Template
          <span className="font-normal text-ink-400">/ 報告模板</span>
          <EngineeringInfo zh={T11.reportTemplate} label="Report Template" align="left" />
        </label>
        <Select
          id="rp-template"
          className="mt-1 h-8 !text-[11.5px]"
          value={templateName}
          disabled={readOnly}
          items={templates.map((name) => ({ value: name, label: name }))}
          onChange={(event) => onTemplate(event.target.value)}
        />
      </div>

      {/* --- Outline / Pages tabs (11 §11) ------------------------------- */}
      <div role="tablist" aria-label={biTitle('Left panel', '左側面板')} className="flex border-b border-line">
        {OUTLINE_TABS.map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={tab === entry}
            onClick={() => setTab(entry)}
            className={`-mb-px flex-1 border-b-2 px-2 py-1.5 text-[11.5px] font-semibold transition-colors ${
              tab === entry
                ? 'border-accent-600 text-accent-700'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {entry === 'outline' ? 'Outline / 大綱' : 'Pages / 頁面'}
          </button>
        ))}
      </div>

      {tab === 'outline' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-1 pb-1 text-[10px] font-semibold text-ink-500">
            <span className="flex items-center gap-1">
              Section / 章節
              <EngineeringInfo zh={T11.sectionOrder} label="Section Order" align="left" />
            </span>
            <span>Include / 包含</span>
          </div>

          <ul className="flex min-h-0 flex-1 flex-col overflow-auto">
            {sections.map((section, index) => {
              const definition = sectionDefinition(section.id);
              const missingData = unavailable.includes(section.id);
              return (
                <li
                  key={section.id}
                  draggable={!readOnly}
                  onDragStart={() => setDragging(section.id)}
                  onDragOver={(event) => {
                    if (!dragging || readOnly) return;
                    event.preventDefault();
                    setDragOver(index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging && !readOnly) onDrop(dragging, index);
                    setDragging(null);
                    setDragOver(null);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setDragOver(null);
                  }}
                  onClick={() => onSelect(section.id)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded border-b border-line/50 px-1 py-1.5 transition-colors ${
                    selectedId === section.id ? 'bg-accent-100' : 'hover:bg-surface-muted'
                  } ${dragOver === index ? 'border-t-2 border-t-accent-600' : ''} ${
                    section.included ? '' : 'opacity-55'
                  }`}
                >
                  <GripVertical
                    className={`size-3.5 shrink-0 ${readOnly ? 'text-ink-300' : 'text-ink-400'}`}
                    aria-hidden
                  />
                  <span className="w-4 shrink-0 text-[10.5px] text-ink-400 tabular">
                    {section.order}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-ink-900">
                    {definition.title}
                    <span className="block truncate text-[10px] font-normal text-ink-400">
                      {definition.zh}
                      {missingData && section.included && (
                        <span className="ml-1 text-warn-600">· Not Available</span>
                      )}
                    </span>
                  </span>

                  {definition.required && (
                    <span title={biTitle('Required section', '必要章節')}>
                      <Badge tone="warn">REQ</Badge>
                    </span>
                  )}

                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      title={biTitle('Move up', '上移')}
                      aria-label={`Move ${definition.title} up`}
                      disabled={readOnly || index === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMove(section.id, -1);
                      }}
                      className="flex size-5 items-center justify-center rounded text-ink-400 hover:bg-surface-muted disabled:opacity-30"
                    >
                      <ArrowUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      title={biTitle('Move down', '下移')}
                      aria-label={`Move ${definition.title} down`}
                      disabled={readOnly || index === sections.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMove(section.id, 1);
                      }}
                      className="flex size-5 items-center justify-center rounded text-ink-400 hover:bg-surface-muted disabled:opacity-30"
                    >
                      <ArrowDown className="size-3" />
                    </button>
                  </span>

                  <input
                    type="checkbox"
                    className="size-3.5 shrink-0 accent-accent-600"
                    checked={section.included}
                    // 11 §6 — a required section cannot be excluded.
                    disabled={readOnly || definition.required}
                    aria-label={`Include ${definition.title}`}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onToggle(section.id)}
                  />
                </li>
              );
            })}
          </ul>

          <div className="shrink-0 border-t border-line pt-2 text-[10px] text-ink-400">
            <p className="flex items-center gap-1">
              <Badge tone="warn">REQ</Badge>
              Required / 必要章節
              <EngineeringInfo zh={T11.requiredSection} label="Required section" align="left" />
            </p>
            <p className="mt-1">Drag to reorder / 拖曳以重新排序</p>
            <Button
              className="mt-2 !h-7 !px-2 !text-[11px]"
              icon={<RotateCcw className="size-3.5" />}
              disabled={readOnly}
              onClick={onReset}
            >
              Reset Layout / 重設版面
            </Button>
          </div>
        </div>
      ) : (
        // --- Pages tab (11 §11) -------------------------------------------
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto pr-1">
          {pages.map((page) => (
            <li key={page.page_number}>
              <button
                type="button"
                onClick={() => onPage(page.page_number)}
                className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors ${
                  currentPage === page.page_number
                    ? 'border-accent-600 bg-accent-100'
                    : 'border-line hover:bg-surface-muted'
                }`}
              >
                {/* A proportional page thumbnail, not a rendered bitmap. */}
                <span className="flex h-10 w-7 shrink-0 flex-col gap-[2px] rounded-sm border border-line-strong bg-white p-[3px]">
                  {Array.from({ length: 5 }).map((_, line) => (
                    <span
                      key={line}
                      className="block h-[2px] rounded-full bg-ink-200"
                      style={{ width: `${line === 0 ? 70 : 100 - line * 8}%` }}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-ink-900">
                    Page {page.page_number}
                  </span>
                  <span className="block truncate text-[10px] text-ink-500">{page.title}</span>
                  <span className="block truncate text-[10px] text-ink-400">{page.title_zh}</span>
                </span>
              </button>
            </li>
          ))}
          {pages.length === 0 && (
            <li className="py-6 text-center text-[11px] text-ink-400">
              No included sections.
              <span className="block">目前沒有納入任何章節。</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
