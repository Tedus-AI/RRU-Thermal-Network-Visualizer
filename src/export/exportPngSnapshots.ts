/**
 * Chart / snapshot PNGs — 12 §15, §16, AC-12-17.
 *
 * §15 is a fence: "Export only already supported views" and "Do not invent new
 * analytical views in 12." So each image here is one of Screens 07–09's own
 * views, re-rendered off-screen from the SAME stored results the screen reads —
 * the solved network, the bottleneck overlay and the temperature histogram.
 *
 * Screen 10's Results Overview is deliberately absent. It is a composite screen
 * rather than an analytical view, and turning it into an image would mean
 * designing a new one here, which is exactly what §15 forbids. The catalog
 * reports it as unavailable instead of shipping something invented.
 */

import cytoscape, { type ElementDefinition, type StylesheetCSS } from 'cytoscape';
import dagre from 'cytoscape-dagre';

import { labelBox } from '@/ui/graphStyles';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import type { BottleneckAnalysis } from '@/thermal/analysis/analysisTypes';
import { isBoundaryNode } from '@/thermal/analysis/temperatureDataset';
import { buildTemperatureDataset } from '@/thermal/analysis/temperatureDataset';
import { autoBinWidth, buildHistogram } from '@/thermal/analysis/temperatureStatistics';
import type { Component } from '@/domain/component';

import type { PngScale } from './exportTypes';

cytoscape.use(dagre);

export interface SnapshotImage {
  /** File name inside `images/` — 12 §16. */
  name: string;
  label: string;
  blob: Blob;
}

export interface SnapshotInput {
  network: ThermalNetwork;
  solution: ThermalSolution;
  analysis: BottleneckAnalysis | null;
  components: Component[];
  scenario_name: string;
  scale: PngScale;
}

const PIXELS = { width: 1400, height: 900 };

/** Same temperature ramp Screens 07 and 09 use, so the export matches the screen. */
function temperatureFill(temperature: number, min: number, max: number): string {
  const span = Math.max(max - min, 1);
  const t = Math.min(Math.max((temperature - min) / span, 0), 1);
  // cool blue → amber → red, in the same order the on-screen legend reads.
  const stops = ['#dbeafe', '#dcfce7', '#fef3c7', '#fed7aa', '#fecaca'];
  const index = Math.min(stops.length - 1, Math.floor(t * stops.length));
  return stops[index];
}

function graphStylesheet(): StylesheetCSS[] {
  return [
    {
      selector: 'node',
      style: {
        shape: 'round-rectangle',
        width: 'data(w)',
        height: 'data(h)',
        'background-color': 'data(fill)',
        'border-color': 'data(border)',
        'border-width': 1.5,
        label: 'data(label)',
        color: '#0f172a',
        'text-wrap': 'wrap',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 10,
        'font-weight': 600,
        'text-max-width': '140px',
      },
    },
    { selector: 'node.boundary', style: { 'border-style': 'dashed', 'border-width': 2.5 } },
    {
      selector: 'edge',
      style: {
        width: 'data(width)',
        'line-color': 'data(color)',
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': 'data(color)',
        'arrow-scale': 0.8,
        label: 'data(label)',
        'font-size': 9,
        color: '#475569',
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.85,
        'text-background-padding': '2px',
        'text-rotation': 'autorotate',
      },
    },
  ] as unknown as StylesheetCSS[];
}

/**
 * Renders one Cytoscape graph off-screen and returns its PNG.
 *
 * The container has to be in the document with a real size — a detached or
 * zero-sized container produces a blank image, which is the same lesson Screens
 * 05–10 learned about fitting the canvas.
 */
async function renderGraph(elements: ElementDefinition[], scale: PngScale): Promise<Blob> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = `${PIXELS.width}px`;
  container.style.height = `${PIXELS.height}px`;
  container.style.backgroundColor = '#ffffff';
  document.body.appendChild(container);

  const cy = cytoscape({
    container,
    elements,
    style: graphStylesheet(),
    headless: false,
    styleEnabled: true,
  });

  try {
    const layout = cy.layout({
      name: 'dagre',
      rankDir: 'LR',
      nodeSep: 26,
      rankSep: 70,
      animate: false,
    } as unknown as cytoscape.LayoutOptions);

    await new Promise<void>((resolve) => {
      layout.one('layoutstop', () => resolve());
      layout.run();
    });

    cy.resize();
    cy.fit(undefined, 40);

    const dataUrl = cy.png({
      full: true,
      scale: scale === '2x' ? 2 : 1,
      bg: '#ffffff',
      output: 'base64uri',
    }) as string;
    return dataUrlToBlob(dataUrl);
  } finally {
    cy.destroy();
    container.remove();
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'image/png';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

/** 07 — the solved network, coloured by temperature. */
function solvedNetworkElements(input: SnapshotInput): ElementDefinition[] {
  const temperatures = Object.values(input.solution.node_temperatures_C).filter((value) =>
    Number.isFinite(value),
  );
  const min = temperatures.length > 0 ? Math.min(...temperatures) : 0;
  const max = temperatures.length > 0 ? Math.max(...temperatures) : 1;

  const elements: ElementDefinition[] = [];
  for (const node of Object.values(input.network.nodes)) {
    if (node.disabled) continue;
    const temperature = input.solution.node_temperatures_C[node.id];
    if (temperature == null || !Number.isFinite(temperature)) continue;

    const label = `${node.name}\n${temperature.toFixed(1)} °C`;
    const box = labelBox(label);
    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label,
        w: box.w,
        h: box.h,
        fill: temperatureFill(temperature, min, max),
        border: isBoundaryNode(node) ? '#2563eb' : node.power_W > 0 ? '#dc2626' : '#64748b',
      },
      classes: isBoundaryNode(node) ? 'boundary' : '',
    });
  }

  const present = new Set(elements.map((element) => element.data.id as string));
  for (const edge of Object.values(input.network.edges)) {
    if (!edge.enabled) continue;
    if (!present.has(edge.from) || !present.has(edge.to)) continue;
    const result = input.solution.edge_results[edge.id];
    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        color: '#94a3b8',
        width: 2,
        label: result ? `${result.heat_flow_W.toFixed(1)} W` : '',
      },
    });
  }
  return elements;
}

/** 08 — the same graph with the ranked bottlenecks emphasised. */
function overlayElements(input: SnapshotInput, analysis: BottleneckAnalysis): ElementDefinition[] {
  const rank = new Map(analysis.results.map((result) => [result.edge_id, result]));
  const elements = solvedNetworkElements(input);

  return elements.map((element) => {
    if (element.group !== 'edges') return element;
    const result = rank.get(element.data.id as string);
    if (!result) return element;
    const color =
      result.classification === 'Critical'
        ? '#dc2626'
        : result.classification === 'High'
          ? '#ea580c'
          : result.classification === 'Medium'
            ? '#d97706'
            : '#94a3b8';
    return {
      ...element,
      data: {
        ...element.data,
        color,
        width: result.classification === 'Critical' ? 5 : result.classification === 'High' ? 4 : 2.5,
        label: `#${result.rank} · ${result.score.toFixed(0)}`,
      },
    };
  });
}

/**
 * 09 — the temperature histogram.
 *
 * The bins come from Screen 09's own `buildHistogram`, and the chart is drawn as
 * BARS over those bins — exactly as the screen does it. That is not a stylistic
 * choice: `plotly.js-basic-dist-min` (the build this app ships) has no
 * `histogram` trace, so asking for one silently renders a line through the raw
 * temperatures. Sharing the binning also means the exported image and the screen
 * agree bin for bin, which is what §15 means by "already supported views".
 */
async function renderHistogram(input: SnapshotInput): Promise<Blob | null> {
  const rows = buildTemperatureDataset({
    network: input.network,
    solution: input.solution,
    components: input.components,
  });
  if (rows.length === 0) return null;

  const temperatures = rows.map((row) => row.temperature_C);
  const bins = buildHistogram(
    rows.map((row) => ({ node_id: row.node_id, temperature_C: row.temperature_C })),
    autoBinWidth(temperatures),
  );
  if (bins.length === 0) return null;

  const Plotly = (await import('plotly.js-basic-dist-min')).default as unknown as {
    toImage: (figure: unknown, options: Record<string, unknown>) => Promise<string>;
  };

  const figure = {
    data: [
      {
        type: 'bar',
        x: bins.map((bin) => bin.label),
        y: bins.map((bin) => bin.count),
        marker: { color: '#2977f5', line: { color: '#1348a8', width: 1 } },
        text: bins.map((bin) => (bin.count > 0 ? String(bin.count) : '')),
        textposition: 'outside',
        name: 'Nodes',
      },
    ],
    layout: {
      title: { text: `Temperature Distribution — ${input.scenario_name}`, font: { size: 15 } },
      xaxis: { title: { text: 'Temperature (°C)' }, type: 'category', automargin: true },
      yaxis: { title: { text: 'Node Count' }, automargin: true },
      bargap: 0.05,
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      margin: { l: 60, r: 24, t: 56, b: 70 },
    },
  };

  const dataUrl = await Plotly.toImage(figure, {
    format: 'png',
    width: 1200,
    height: 700,
    scale: input.scale === '2x' ? 2 : 1,
  });
  return dataUrlToBlob(dataUrl);
}

/** 09 — component temperature bars, "[if available]" in §15. */
async function renderComponentBars(input: SnapshotInput): Promise<Blob | null> {
  const rows = buildTemperatureDataset({
    network: input.network,
    solution: input.solution,
    components: input.components,
  }).filter((row) => row.component_name && row.is_heat_source);
  if (rows.length === 0) return null;

  const hottest = new Map<string, number>();
  for (const row of rows) {
    const key = row.component_name as string;
    hottest.set(key, Math.max(hottest.get(key) ?? -Infinity, row.temperature_C));
  }
  const entries = Array.from(hottest.entries()).sort((a, b) => b[1] - a[1]);

  const Plotly = (await import('plotly.js-basic-dist-min')).default as unknown as {
    toImage: (figure: unknown, options: Record<string, unknown>) => Promise<string>;
  };

  const figure = {
    data: [
      {
        type: 'bar',
        x: entries.map(([name]) => name),
        y: entries.map(([, value]) => value),
        marker: { color: '#ea9a0b' },
        name: 'Max °C',
      },
    ],
    layout: {
      title: { text: `Component Peak Temperature — ${input.scenario_name}`, font: { size: 15 } },
      xaxis: { automargin: true, tickangle: -35 },
      yaxis: { title: { text: 'Temperature (°C)' }, automargin: true },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      margin: { l: 60, r: 24, t: 56, b: 90 },
    },
  };

  const dataUrl = await Plotly.toImage(figure, {
    format: 'png',
    width: 1200,
    height: 700,
    scale: input.scale === '2x' ? 2 : 1,
  });
  return dataUrlToBlob(dataUrl);
}

export interface SnapshotResult {
  images: SnapshotImage[];
  /** 12 §31 — "optional image unavailable" is a warning, not a failure. */
  warnings: string[];
}

/**
 * Renders every view that the stored results actually support.
 *
 * One view failing never costs the others: each is attempted independently and
 * a failure becomes a warning line, which is §30's failure isolation applied
 * inside a single artifact.
 */
export async function exportPngSnapshots(input: SnapshotInput): Promise<SnapshotResult> {
  const images: SnapshotImage[] = [];
  const warnings: string[] = [];

  const attempt = async (name: string, label: string, render: () => Promise<Blob | null>) => {
    try {
      const blob = await render();
      if (!blob) {
        warnings.push(`${label} produced no data and was skipped.`);
        return;
      }
      images.push({ name, label, blob });
    } catch (error) {
      warnings.push(`${label} could not be rendered: ${message(error)}`);
    }
  };

  await attempt('thermal_network.png', 'Solved Thermal Network (07)', () =>
    renderGraph(solvedNetworkElements(input), input.scale),
  );

  if (input.analysis && input.analysis.results.length > 0) {
    const analysis = input.analysis;
    await attempt('bottleneck_overlay.png', 'Bottleneck Overlay (08)', () =>
      renderGraph(overlayElements(input, analysis), input.scale),
    );
  } else {
    warnings.push('Bottleneck overlay unavailable: Screen 08 has no current analysis.');
  }

  await attempt('temperature_histogram.png', 'Temperature Histogram (09)', () =>
    renderHistogram(input),
  );
  await attempt('component_bars.png', 'Component Temperature Bars (09)', () =>
    renderComponentBars(input),
  );

  return { images, warnings };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
