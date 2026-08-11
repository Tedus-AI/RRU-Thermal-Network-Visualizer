/**
 * Thermal Network Highlight (Path Focus) — 08 §15.
 *
 * The Screen 07 solved topology with a bottleneck-score OVERLAY on top. The
 * topology itself is untouched: no node is added, moved or removed, and no
 * resistance is edited here.
 *
 * Colour and thickness come from the composite score, so what stands out is the
 * candidate whose improvement helps most — not the one with the largest
 * resistance (08 §1). Selecting a row focuses that candidate's path and dims
 * the rest.
 *
 * The Cytoscape mechanics repeat what Screens 05–07 learned: explicit node
 * sizes rather than `width: label`, positions read only after `layoutstop`, and
 * a fit that waits until the container really has a size.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import cytoscape, { type Core, type ElementDefinition, type StylesheetCSS } from 'cytoscape';
import dagre from 'cytoscape-dagre';

import { GROUP_COLORS, labelBox, nodeGroup } from '@/ui/graphStyles';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import {
  CLASSIFICATION_COLOR,
  type BottleneckResult,
} from '@/thermal/analysis/analysisTypes';

cytoscape.use(dagre);

const NEUTRAL = '#cbd5e1';

export interface OverlayHandle {
  fit: () => void;
  zoomBy: (delta: number) => void;
  relayout: () => void;
  center: (elementId: string) => void;
}

function stylesheet(): StylesheetCSS[] {
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
        color: 'data(text)',
        'text-wrap': 'wrap',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 10,
        'font-weight': 600,
        'text-max-width': '150px',
      },
    },
    { selector: 'node.fixed', style: { 'border-style': 'dashed', 'border-width': 2.5 } },
    { selector: 'node.on-path', style: { 'border-color': '#dc2626', 'border-width': 3 } },
    { selector: 'node:selected', style: { 'border-color': '#1d4ed8', 'border-width': 3.5 } },
    { selector: '.dimmed', style: { opacity: 0.45 } },
    {
      selector: 'edge',
      style: {
        width: 'data(width)',
        'line-color': 'data(color)',
        'line-style': 'data(lineStyle)',
        'curve-style': 'bezier',
        'target-arrow-shape': 'data(tgtArrow)',
        'source-arrow-shape': 'data(srcArrow)',
        'target-arrow-color': 'data(color)',
        'source-arrow-color': 'data(color)',
        'arrow-scale': 0.85,
        label: 'data(label)',
        'font-size': 9,
        'font-weight': 700,
        color: '#334155',
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.9,
        'text-background-padding': '2px',
        'text-rotation': 'autorotate',
      },
    },
    {
      selector: 'edge.candidate-selected',
      style: { width: 6, 'line-color': '#dc2626', 'target-arrow-color': '#dc2626', 'source-arrow-color': '#dc2626' },
    },
  ] as unknown as StylesheetCSS[];
}

function buildElements(
  network: ThermalNetwork,
  solution: ThermalSolution,
  byEdge: Map<string, BottleneckResult>,
  selectedEdgeId: string | null,
  showScores: boolean,
): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  const selected = selectedEdgeId ? byEdge.get(selectedEdgeId) : null;
  const pathNodes = new Set<string>();
  if (selected) {
    const edge = network.edges[selected.edge_id];
    if (edge) {
      pathNodes.add(edge.from);
      pathNodes.add(edge.to);
    }
  }

  for (const node of Object.values(network.nodes)) {
    if (node.disabled) continue;
    const role = GROUP_COLORS[nodeGroup(node)];
    const temperature = solution.node_temperatures_C[node.id] ?? null;
    const fixed = node.boundary_type === 'fixed_temperature' || node.boundary_role === 'placeholder';

    const lines = [node.name];
    if (temperature != null) lines.push(`${temperature.toFixed(1)} °C`);
    if (node.power_W > 0) lines.push(`${node.power_W.toFixed(1)} W`);

    const label = lines.join('\n');
    const box = labelBox(label);

    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label,
        w: box.w,
        h: box.h,
        fill: role.fill,
        border: role.border,
        text: role.text,
      },
      classes: [fixed ? 'fixed' : '', pathNodes.has(node.id) ? 'on-path' : ''].filter(Boolean).join(' '),
    });
  }

  const present = new Set(elements.map((element) => element.data.id as string));

  for (const edge of Object.values(network.edges)) {
    if (!present.has(edge.from) || !present.has(edge.to)) continue;

    const result = byEdge.get(edge.id);
    const flow = solution.edge_results[edge.id];
    const reverse = flow?.actual_direction === 'reverse';

    // No score means the edge was not a candidate — it stays neutral rather
    // than being coloured as if it had scored zero on a real comparison.
    const color = result ? CLASSIFICATION_COLOR[result.classification] : NEUTRAL;
    const width = result ? 1.5 + (result.score / 100) * 6.5 : 1.5;

    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: showScores && result ? String(result.score) : '',
        color,
        width,
        srcArrow: reverse ? 'triangle' : 'none',
        tgtArrow: reverse ? 'none' : 'triangle',
        lineStyle: result ? 'solid' : 'dashed',
      },
      classes: selectedEdgeId === edge.id ? 'candidate-selected' : '',
    });
  }

  return elements;
}

export const BottleneckGraphOverlay = forwardRef<
  OverlayHandle,
  {
    network: ThermalNetwork;
    solution: ThermalSolution;
    results: BottleneckResult[];
    selectedEdgeId: string | null;
    focusPath: boolean;
    showScores: boolean;
    onSelectEdge: (edgeId: string | null) => void;
  }
>(function BottleneckGraphOverlay(
  { network, solution, results, selectedEdgeId, focusPath, showScores, onSelectEdge },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const fittedRef = useRef(false);
  const fittedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const signatureRef = useRef('');

  const handlers = useRef({ onSelectEdge });
  handlers.current = { onSelectEdge };

  const byEdge = useMemo(
    () => new Map(results.map((result) => [result.edge_id, result])),
    [results],
  );

  const elements = useMemo(
    () => buildElements(network, solution, byEdge, selectedEdgeId, showScores),
    [network, solution, byEdge, selectedEdgeId, showScores],
  );

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: stylesheet(),
      minZoom: 0.15,
      maxZoom: 3,
      wheelSensitivity: 0.2,
      boxSelectionEnabled: false,
      // The overlay is a view of Screen 07's result: nodes are inspected, never
      // rearranged into a different topology (08 §15).
      autoungrabify: true,
    });
    cyRef.current = cy;

    cy.on('tap', 'edge', (event) => handlers.current.onSelectEdge(event.target.id() as string));
    cy.on('tap', (event) => {
      if (event.target === cy) handlers.current.onSelectEdge(null);
    });

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0 || rect.height === 0) return;
      cy.resize();
      if (cy.nodes().length === 0) return;

      // A fit computed for one container size is wrong for another: this panel
      // grows as the surrounding sections settle, and a viewport restored from
      // the smaller box leaves the graph off-screen. Re-fit whenever the box
      // itself changes materially, not on every pixel of a drag.
      const last = fittedSizeRef.current;
      const grew =
        !last ||
        Math.abs(rect.width - last.width) / Math.max(last.width, 1) > 0.15 ||
        Math.abs(rect.height - last.height) / Math.max(last.height, 1) > 0.15;

      if (!fittedRef.current || grew) {
        cy.fit(undefined, 40);
        fittedRef.current = true;
        fittedSizeRef.current = { width: rect.width, height: rect.height };
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const pan = { ...cy.pan() };
    const zoom = cy.zoom();
    const hadElements = cy.elements().length > 0;

    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });

    const signature = elements
      .map((element) => element.data.id)
      .sort()
      .join('|');
    const structureChanged = signature !== signatureRef.current;
    signatureRef.current = signature;

    const missing: string[] = [];
    cy.nodes().forEach((node) => {
      const known = positionsRef.current[node.id() as string];
      if (known) node.position({ ...known });
      else missing.push(node.id() as string);
    });

    const snapshot = () => {
      positionsRef.current = {};
      cy.nodes().forEach((node) => {
        const position = node.position();
        positionsRef.current[node.id() as string] = { x: position.x, y: position.y };
      });
    };

    const refit = () => {
      cy.resize();
      const box = cy.container()?.getBoundingClientRect();
      const sized = Boolean(box && box.width > 0 && box.height > 0);
      if (sized) cy.fit(undefined, 40);
      fittedRef.current = sized && cy.nodes().length > 0;
    };

    if (missing.length > 0 && cy.nodes().length > 0) {
      const layout = cy.layout({
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: 30,
        rankSep: 90,
        animate: false,
      } as unknown as cytoscape.LayoutOptions);
      layout.one('layoutstop', () => {
        snapshot();
        refit();
      });
      layout.run();
      return;
    }

    snapshot();
    if (hadElements && !structureChanged) cy.viewport({ zoom, pan });
    else refit();
  }, [elements]);

  // --- path focus (08 §15) -------------------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('dimmed');
    if (!selectedEdgeId) return;

    const edge = cy.getElementById(selectedEdgeId);
    if (edge.length === 0) return;
    const neighbourhood = edge.union(edge.connectedNodes());

    if (!focusPath) return;
    cy.elements().difference(neighbourhood).addClass('dimmed');
    // Dimming the rest is only half of "path focus": the focused candidate has
    // to be on screen for it to mean anything.
    cy.animate({ fit: { eles: neighbourhood, padding: 90 } }, { duration: 200 });
  }, [focusPath, selectedEdgeId, elements]);

  useImperativeHandle(
    ref,
    (): OverlayHandle => ({
      fit: () => cyRef.current?.fit(undefined, 40),
      zoomBy: (delta) => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.zoom({ level: cy.zoom() + delta, renderedPosition: { x: 0, y: 0 } });
        cy.center();
      },
      relayout: () => {
        const cy = cyRef.current;
        if (!cy || cy.nodes().length === 0) return;
        const layout = cy.layout({
          name: 'dagre',
          rankDir: 'LR',
          nodeSep: 30,
          rankSep: 90,
          animate: false,
        } as unknown as cytoscape.LayoutOptions);
        layout.one('layoutstop', () => {
          positionsRef.current = {};
          cy.nodes().forEach((node) => {
            const position = node.position();
            positionsRef.current[node.id() as string] = { x: position.x, y: position.y };
          });
          cy.fit(undefined, 40);
        });
        layout.run();
      },
      center: (elementId) => {
        const cy = cyRef.current;
        const element = cy?.getElementById(elementId);
        if (cy && element && element.length > 0) {
          cy.animate({ center: { eles: element }, zoom: Math.max(cy.zoom(), 0.9) }, { duration: 200 });
        }
      },
    }),
    [],
  );

  return <div ref={containerRef} className="size-full" data-testid="bottleneck-overlay-canvas" />;
});

/**
 * Overlay legend — 08 §15.
 *
 * The mockup prints the bands as ≥75 / 50–74 / 25–49 / <25. The Markdown's
 * classification thresholds are 80 / 60 / 35 (08 §4), and the Markdown is the
 * source of truth, so the legend states the thresholds the code actually uses.
 */
export const OVERLAY_LEGEND = [
  { classification: 'Critical' as const, label: 'Critical (Score ≥ 80)', zh: '關鍵' },
  { classification: 'High' as const, label: 'High (60–79)', zh: '高' },
  { classification: 'Medium' as const, label: 'Medium (35–59)', zh: '中' },
  { classification: 'Low' as const, label: 'Low (< 35)', zh: '低' },
];
