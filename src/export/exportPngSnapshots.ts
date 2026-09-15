/**
 * Chart / snapshot PNGs — 12 §15, §16, AC-12-17.
 *
 * §15 is a fence: "Export only already supported views" and "Do not invent new
 * analytical views in 12." So each image here is one of Screens 07–09's own
 * views, re-rendered off-screen from the SAME stored results the screen reads —
 * the solved network and the bottleneck overlay.
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

/** Breathing room around the graph in the exported image. */
const GRAPH_PADDING_PX = 40;

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
    cy.fit(undefined, GRAPH_PADDING_PX);

    const dataUrl = cy.png({
      full: true,
      scale: scale === '2x' ? 2 : 1,
      bg: '#ffffff',
      output: 'base64uri',
    }) as string;
    // `cy.fit`'s padding moves the viewport, and `full: true` ignores the
    // viewport entirely -- it crops to `elements.boundingBox()`, which stops
    // at the node outline rather than outside it. So the outermost nodes came
    // out with their borders shaved against the image edge, and in a dagre LR
    // layout the leftmost column is every heat source in the network. The
    // margin has to be added after the fact, because Cytoscape's full-graph
    // export takes no padding of its own.
    return await padImage(dataUrl, GRAPH_PADDING_PX * (scale === '2x' ? 2 : 1));
  } finally {
    cy.destroy();
    container.remove();
  }
}

/** Draws the rendered graph onto a white canvas `margin` pixels larger all round. */
async function padImage(dataUrl: string, margin: number): Promise<Blob> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('The rendered graph could not be re-read for padding.'));
    image.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = image.width + margin * 2;
  canvas.height = image.height + margin * 2;
  const context = canvas.getContext('2d');
  if (!context) return dataUrlToBlob(dataUrl);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, margin, margin);

  return await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? dataUrlToBlob(dataUrl)),
      'image/png',
    );
  });
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

  // The histogram and the component bars used to follow, labelled (09). Screen
  // 09 was removed and nothing replaced it, so they were the only two pictures
  // in this export with no counterpart anywhere in the tool — an engineer could
  // not lay the file beside the screen it came from and check it, which is the
  // one thing a snapshot export is for.

  return { images, warnings };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
