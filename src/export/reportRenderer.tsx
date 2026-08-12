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

import { ReportPageView } from '@/screens/11-report-preview/ReportPreviewCanvas';
import type { SectionRenderInput } from '@/screens/11-report-preview/ReportSections';
import { includedSections, orderedSections } from '@/report/reportConfig';
import { paginate } from '@/report/pagination';
import { pageBoxMm, type ReportPage, type ThermalReportConfig } from '@/report/reportTypes';
import type { ResultsOverviewSnapshot } from '@/thermal/overview/overviewTypes';

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

/** Row counts drive the page estimate, exactly as Screen 11 computes them. */
function rowCountsOf(snapshot: ResultsOverviewSnapshot) {
  return {
    critical: snapshot.critical_components.length,
    bottleneck: snapshot.bottlenecks.length,
    hot_nodes: Math.min(snapshot.distribution?.row_count ?? 0, 10),
  };
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
  const pageModels = paginate(sections, rowCountsOf(snapshot));
  const box = pageBoxMm(config.page_size, config.orientation);

  const container = document.createElement('div');
  container.setAttribute('data-export-report', 'true');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.zIndex = '-1';
  container.style.backgroundColor = '#ffffff';
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
  });

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
