/**
 * Centre workspace — page toolbar and the paginated preview — 11 §10, §40.
 *
 * The preview is an HTML/CSS semantic report renderer, which is what §10
 * recommends and what §38 requires: no PDF is generated on this screen. The page
 * is a real A4/Letter box at the chosen orientation so what the reader sees is
 * proportionally what Screen 12 will lay out.
 */

import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';

import { Button, Select } from '@/ui/primitives';
import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import {
  ZOOM_LABELS,
  ZOOM_MODES,
  pageBoxMm,
  type ReportPage,
  type ReportSectionConfig,
  type SectionId,
  type ThermalReportConfig,
  type ZoomMode,
} from '@/report/reportTypes';
import { sectionDefinition } from '@/report/sectionRegistry';

import { ReportSectionBody, type SectionRenderInput } from './ReportSections';
import { reportLabel } from './reportViewModel';
import { T11 } from './tooltips';

/** Zoom levels the toolbar offers, in the specification's order (11 §40). */
const NUMERIC_ZOOMS: ZoomMode[] = ['50', '75', '100', '125'];

export function PageToolbar({
  page,
  pageCount,
  zoom,
  onPage,
  onZoom,
}: {
  page: number;
  pageCount: number;
  zoom: ZoomMode;
  onPage: (page: number) => void;
  onZoom: (zoom: ZoomMode) => void;
}) {
  const step = (direction: -1 | 1) => {
    const index = NUMERIC_ZOOMS.indexOf(zoom);
    if (index === -1) {
      onZoom(direction === 1 ? '125' : '75');
      return;
    }
    const next = NUMERIC_ZOOMS[Math.min(Math.max(index + direction, 0), NUMERIC_ZOOMS.length - 1)];
    onZoom(next);
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
      <Button
        className="!h-7 !px-2 !text-[11px]"
        icon={<ChevronLeft className="size-3.5" />}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <span className="text-[11.5px] font-semibold text-ink-700 tabular">
        Page {pageCount === 0 ? 0 : page} of {pageCount}
      </span>
      <Button
        className="!h-7 !px-2 !text-[11px]"
        trailingIcon={<ChevronRight className="size-3.5" />}
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>

      <span className="mx-1 h-5 w-px bg-line" aria-hidden />

      <button
        type="button"
        title={biTitle('Zoom out', '縮小')}
        aria-label={biTitle('Zoom out', '縮小')}
        onClick={() => step(-1)}
        className="flex size-7 items-center justify-center rounded border border-line-strong text-ink-500 transition-colors hover:bg-surface-muted"
      >
        <Minus className="size-3.5" />
      </button>
      {/* Every zoom mode is an option, including the two fit modes: a select
          whose value is absent from its items silently displays the first entry,
          which would show "50%" while the page is actually fitted to width. */}
      <Select
        className="h-7 !w-[6.5rem] !text-[11px]"
        aria-label="Zoom level"
        value={zoom}
        items={ZOOM_MODES.map((entry) => ({ value: entry, label: ZOOM_LABELS[entry] }))}
        onChange={(event) => onZoom(event.target.value as ZoomMode)}
      />
      <button
        type="button"
        title={biTitle('Zoom in', '放大')}
        aria-label={biTitle('Zoom in', '放大')}
        onClick={() => step(1)}
        className="flex size-7 items-center justify-center rounded border border-line-strong text-ink-500 transition-colors hover:bg-surface-muted"
      >
        <Plus className="size-3.5" />
      </button>

      <Button
        className={`!h-7 !px-2 !text-[11px] ${zoom === 'fit_width' ? '!border-accent-600 !text-accent-700' : ''}`}
        onClick={() => onZoom('fit_width')}
      >
        Fit Width
      </Button>
      <Button
        className={`!h-7 !px-2 !text-[11px] ${zoom === 'fit_page' ? '!border-accent-600 !text-accent-700' : ''}`}
        onClick={() => onZoom('fit_page')}
      >
        Fit Page
      </Button>

      <span className="ml-auto flex items-center text-[10px] text-ink-400">
        <EngineeringInfo zh={T11.zoom} label="Zoom" />
      </span>
    </div>
  );
}

/**
 * One rendered page.
 *
 * Sections are numbered from 1 across the whole report, matching the outline, so
 * a heading in the preview can be traced back to the outline entry that
 * produced it.
 */
export function ReportPageView({
  config,
  page,
  sections,
  renderInput,
  scale,
  onSelectSection,
  selectedId,
  stale,
}: {
  config: ThermalReportConfig;
  page: ReportPage | null;
  /** All included sections, in order, so headings can be numbered. */
  sections: ReportSectionConfig[];
  renderInput: (section: ReportSectionConfig) => SectionRenderInput | null;
  scale: number;
  onSelectSection: (id: SectionId) => void;
  selectedId: SectionId;
  stale: boolean;
}) {
  const box = pageBoxMm(config.page_size, config.orientation);
  const mode = config.language_mode;

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-[12px] text-ink-400">
          No sections are included, so there is nothing to preview.
          <span className="block">目前沒有納入任何章節，因此沒有可預覽的內容。</span>
        </p>
      </div>
    );
  }

  const onPage = page.section_ids;
  const header = config.header_footer;

  return (
    <div className="flex justify-center py-4">
      <div
        className="relative origin-top bg-white shadow-lg ring-1 ring-black/10"
        style={{
          width: `${box.width}mm`,
          height: `${box.height}mm`,
          transform: `scale(${scale})`,
          // The scaled page must still reserve its own layout space.
          marginBottom: `${box.height * (scale - 1)}mm`,
        }}
      >
        {stale && (
          // 11 §3, AC-11-03 — a stale preview is watermarked so a screenshot of
          // it can never be mistaken for a current result.
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
          >
            <span className="rotate-[-24deg] text-[64px] font-black tracking-[0.2em] text-danger-600/12 select-none">
              STALE
            </span>
          </span>
        )}

        <div className="flex h-full flex-col px-[14mm] py-[12mm]">
          {/* --- running header (11 §9) --------------------------------- */}
          <div className="flex shrink-0 items-center justify-between border-b border-[#d7dde5] pb-1 text-[8.5px] text-[#68748a]">
            <span className="truncate">
              {[
                header.show_project_name ? config.cover.project_name_override : null,
                header.show_report_title ? config.title : null,
              ]
                .filter(Boolean)
                .join(' · ') || `Snapshot: ${config.snapshot_id}`}
            </span>
            <span className="truncate">
              {header.show_scenario ? config.subtitle : ''}
              {header.show_prepared_date ? ` · ${config.cover.prepared_date}` : ''}
            </span>
          </div>

          {/* --- body ---------------------------------------------------- */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pt-3">
            {onPage.map((id) => {
              const section = sections.find((entry) => entry.id === id);
              if (!section) return null;
              const input = renderInput(section);
              if (!input) return null;
              const index = sections.findIndex((entry) => entry.id === id) + 1;
              const definition = sectionDefinition(id);
              const title = section.display.title_override || definition.title;

              return (
                <section
                  key={id}
                  onClick={() => onSelectSection(id)}
                  className={`cursor-pointer rounded-sm transition-colors ${
                    selectedId === id ? 'outline outline-2 outline-offset-2 outline-accent-500/60' : ''
                  } ${section.display.compact_spacing ? 'leading-tight' : ''}`}
                >
                  {id !== 'cover' && (
                    <h2 className="mb-1.5 flex items-baseline gap-2 text-[13px] font-bold text-[#16202f]">
                      <span className="text-[#1d4ed8] tabular">{index}</span>
                      {reportLabel(mode, title, definition.zh)}
                    </h2>
                  )}
                  <ReportSectionBody input={input} />
                  {section.note?.trim() && (
                    <p className="mt-1.5 border-l-2 border-[#b6c2d3] pl-2 text-[9px] text-[#68748a] italic">
                      {section.note}
                      <span className="ml-1 not-italic">· report-only text</span>
                    </p>
                  )}
                </section>
              );
            })}
          </div>

          {/* --- running footer (11 §9) --------------------------------- */}
          <div className="flex shrink-0 items-center justify-between border-t border-[#d7dde5] pt-1 text-[8.5px] text-[#68748a]">
            <span className="truncate">
              {header.show_project_name ? config.cover.project_name_override ?? '' : ''}
            </span>
            <span className="truncate">
              {header.show_confidentiality ? header.footer_text : ''}
            </span>
            <span className="shrink-0">
              {header.show_page_number ? `Page ${page.page_number}` : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
