/**
 * Off-screen report rendering — 12 §9, §38, AC-12-08.
 *
 * §38 is explicit: "PDF must match Screen 11 semantic config. Do not rebuild a
 * different report in 12." So this module does not lay out a report. It mounts
 * Screen 11's own `ReportPageView` in print mode into a detached container and
 * hands the resulting DOM to the PDF and HTML writers. Page size, orientation,
 * language, section order, included sections and header/footer all come from the
 * config, unchanged, because it is literally the same component.
 */

import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { ReportPageView, ReportSection } from '@/screens/11-report-preview/ReportPreviewCanvas';
import type { SectionRenderInput } from '@/screens/11-report-preview/ReportSections';
import { includedSections, orderedSections } from '@/report/reportConfig';
import { paginate, type RowCounts } from '@/report/pagination';
import { readMeasuredHeights, type MeasuredHeights } from '@/report/measuredHeights';
import {
  pageBoxMm,
  type ReportPage,
  type ReportSectionConfig,
  type ThermalReportConfig,
} from '@/report/reportTypes';
import type { ResultsOverviewSnapshot } from '@/thermal/overview/overviewTypes';
import type { NetworkFigure } from '@/report/networkFigures';

export interface ReportRenderInput {
  config: ThermalReportConfig;
  snapshot: ResultsOverviewSnapshot;
  project: { name: string; id: string; stage?: string; customer?: string };
  scenario: {
    name: string;
    ambient_C: number;
    wind_mps: number;
    solar_W_m2: number;
    power_scale: number;
  };
  /** Sections the snapshot has no data for, so they render as Not Available. */
  unavailable: SectionRenderInput['section']['id'][];
  /** True when the snapshot is stale — the HTML report says so in a banner. */
  stale: boolean;
  /** The live network the Thermal Network figures are drawn from, when there is one. */
  network_context?: SectionRenderInput['network_context'];
  network_figures?: SectionRenderInput['network_figures'];
  /**
   * Heights the preview measured. Only a fallback now: the export measures its
   * own pages, so a payload prepared before that existed still breaks correctly.
   */
  measured_heights?: MeasuredHeights;
}

export interface RenderedReport {
  /** One detached element per page, already laid out at real millimetre size. */
  pages: HTMLElement[];
  page_models: ReportPage[];
  width_mm: number;
  height_mm: number;
  /** Call when finished; unmounts the React roots and removes the container. */
  dispose: () => void;
}

/**
 * Row counts drive the page estimate, exactly as Screen 11 computes them.
 *
 * The figure counts were missing, so the two splittable figure sections were
 * paginated as though they held nothing and the export put every chain on one
 * page for the page box to clip.
 */
function rowCountsOf(
  snapshot: ResultsOverviewSnapshot,
  figures: readonly NetworkFigure[],
): RowCounts {
  return {
    critical: snapshot.critical_components.length,
    network_figures: figures.filter((figure) => !figure.part).length,
    bottleneck_figures: figures.filter((figure) => Boolean(figure.part)).length,
    actions: snapshot.action_summary.length,
  };
}

/**
 * Measure the sections the way Screen 11 measures them, on this very render.
 *
 * The preview's numbers used to arrive on the export payload, which meant a
 * payload prepared before that field existed carried none -- and the export
 * silently fell back to the registry's estimates and broke its pages somewhere
 * the engineer had never seen. Since the export mounts Screen 11's own
 * components anyway, it can do the measuring pass itself: one page to learn
 * what a page's body is in pixels, then every included section rendered whole
 * at that width. Nothing then depends on when the payload was written.
 *
 * Returns nothing when the browser laid nothing out (a zero-height body), so
 * the caller falls back rather than paginating against zeroes.
 */
function measureSections(
  container: HTMLElement,
  input: ReportRenderInput,
  sections: ReportSectionConfig[],
  included: ReportSectionConfig[],
  renderInput: (section: ReportSectionConfig) => SectionRenderInput,
): MeasuredHeights {
  const probeHost = document.createElement('div');
  container.appendChild(probeHost);
  const probeRoot = createRoot(probeHost);

  try {
    // One page, carrying nothing, purely to read the body box the real pages
    // will have. Its size comes from the page size and margins, not from what
    // is on it, so an empty page measures the same as a full one.
    flushSync(() => {
      probeRoot.render(
        <ReportPageView
          config={input.config}
          page={{ page_number: 1, title: '', title_zh: '', section_ids: [] }}
          sections={included}
          renderInput={renderInput}
          scale={1}
          selectedId={included[0]?.id ?? 'cover'}
          onSelectSection={() => {}}
          stale={input.stale}
          printMode
        />,
      );
    });

    const body = probeHost.querySelector<HTMLElement>('[data-report-body]');
    if (!body || body.offsetHeight <= 0 || body.offsetWidth <= 0) return {};
    const bodyHeight = body.offsetHeight;
    const bodyWidth = body.offsetWidth;
    const gap = Number.parseFloat(getComputedStyle(body).rowGap) || 0;

    const measureHost = document.createElement('div');
    measureHost.style.width = `${bodyWidth}px`;
    measureHost.style.display = 'flex';
    measureHost.style.flexDirection = 'column';
    measureHost.style.rowGap = `${gap}px`;
    container.appendChild(measureHost);
    const measureRoot = createRoot(measureHost);

    try {
      flushSync(() => {
        measureRoot.render(
          <>
            {included.map((section) => (
              <div key={section.id} data-measure-section={section.id}>
                <ReportSection
                  section={section}
                  input={{ ...renderInput(section), measuring: true }}
                  index={sections.indexOf(section) + 1}
                  mode={input.config.language_mode}
                />
              </div>
            ))}
          </>,
        );
      });

      return readMeasuredHeights(measureHost, bodyHeight, gap);
    } finally {
      measureRoot.unmount();
      measureHost.remove();
    }
  } finally {
    probeRoot.unmount();
    probeHost.remove();
  }
}

/**
 * Mounts every page off-screen.
 *
 * The container is positioned far off the viewport rather than hidden: an
 * element with `display: none` has no layout, and html2canvas would rasterize
 * an empty box. It stays in the document only for as long as the render takes.
 */
export function renderReport(input: ReportRenderInput): RenderedReport {
  const { config, snapshot } = input;
  const sections = orderedSections(config);
  const included = includedSections(config);
  const figures = input.network_figures ?? [];
  // The heights Screen 11 measured off the pages it showed, carried on the
  // export payload. Re-deriving them here would mean re-measuring a render
  // that has not happened yet; taking the preview's own numbers means the
  // exported document breaks its pages exactly where the engineer approved
  // them. Absent (an older payload), `paginate` falls back to the registry
  // estimate, which is what split a nine-row table 6 + 3 across two pages.
  const box = pageBoxMm(config.page_size, config.orientation);

  const container = document.createElement('div');
  container.setAttribute('data-export-report', 'true');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.zIndex = '-1';
  container.style.backgroundColor = '#ffffff';
  // Pinned to the ratio the report inherits from `body` on screen, so the
  // rasterizer's baseline correction (see `exportPdfReport`) can neutralise
  // `body`'s own line-height without moving a single line of the report.
  container.style.lineHeight = '1.5';
  document.body.appendChild(container);

  const roots: Root[] = [];
  const pages: HTMLElement[] = [];

  const renderInput = (section: (typeof sections)[number]): SectionRenderInput => ({
    config,
    section,
    snapshot,
    project: input.project,
    scenario: input.scenario,
    unavailable: input.unavailable.includes(section.id),
    // Screen 12's export renders the same page components, so it must supply
    // the same inputs. It is given the network context when it has one; the
    // figures then draw exactly as they do in the preview.
    network_context: input.network_context ?? null,
    network_figures: input.network_figures ?? [],
    from: 0,
    to: Number.POSITIVE_INFINITY,
    part: 0,
    parts: 1,
  });

  // The payload's numbers first, because they are literally what the engineer
  // watched the preview break its pages on. Anything the payload does not
  // carry is measured here instead, on these very pages: an older payload has
  // no heights at all, and paginating from the registry's generous estimates
  // is what broke the export somewhere the engineer had never seen.
  const measured = {
    ...measureSections(container, input, sections, included, renderInput),
    ...input.measured_heights,
  };
  const pageModels = paginate(sections, rowCountsOf(snapshot, figures), measured);

  for (const model of pageModels) {
    const host = document.createElement('div');
    host.style.backgroundColor = '#ffffff';
    container.appendChild(host);

    const root = createRoot(host);
    // flushSync so the DOM exists before the caller rasterizes it. Without it
    // React 18 would schedule the commit and html2canvas would photograph an
    // empty container.
    flushSync(() => {
      root.render(
        <ReportPageView
          config={config}
          page={model}
          sections={included}
          renderInput={renderInput}
          scale={1}
          selectedId={included[0]?.id ?? 'cover'}
          onSelectSection={() => {}}
          stale={input.stale}
          printMode
        />,
      );
    });

    roots.push(root);
    pages.push(host.firstElementChild as HTMLElement);
  }

  return {
    pages,
    page_models: pageModels,
    width_mm: box.width,
    height_mm: box.height,
    dispose: () => {
      for (const root of roots) root.unmount();
      container.remove();
    },
  };
}
