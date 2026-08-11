/**
 * Read-only Network Snapshot — 10 §13, AC-10-17.
 *
 * A compact view of the solved thermal network with heat sources, shared base,
 * heat sink and boundary distinguished, and ONE path highlighted: the top
 * bottleneck's path when Screen 08 is current, otherwise the hottest
 * component's path out to a boundary (10 §13).
 *
 * Nothing here edits. Cytoscape is created with `autoungrabify` and
 * `userPanningEnabled` left on only so the picture can be read — no node can be
 * dragged, no edge can be added, and no value is written back anywhere.
 *
 * The Cytoscape mechanics repeat what Screens 05–09 learned: explicit
 * `data(w)/data(h)` rather than `width: 'label'`, a fit that waits until the
 * container really has a size, and a re-fit when the container changes
 * materially.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import cytoscape, { type Core, type ElementDefinition, type StylesheetCSS } from 'cytoscape';
import dagre from 'cytoscape-dagre';

import { labelBox } from '@/ui/graphStyles';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import { isBoundaryNode } from '@/thermal/analysis/temperatureDataset';
import type { CriticalPath } from '@/thermal/overview/criticalPath';

cytoscape.use(dagre);

/** 10 §13 — the four families the snapshot has to distinguish. */
type NodeFamily = 'heat_source' | 'shared_base' | 'heat_sink' | 'boundary' | 'other';

const FAMILY_STYLE: Record<NodeFamily, { fill: string; border: string; text: string }> = {
  heat_source: { fill: '#fee2e2', border: '#dc2626', text: '#7f1d1d' },
  shared_base: { fill: '#e0e7ff', border: '#4f46e5', text: '#312e81' },
  heat_sink: { fill: '#dcfce7', border: '#16a34a', text: '#14532d' },
  boundary: { fill: '#f1f5f9', border: '#475569', text: '#0f172a' },
  other: { fill: '#f8fafc', border: '#cbd5e1', text: '#334155' },
};

export const FAMILY_LABELS: Array<{ family: NodeFamily; label: string; zh: string }> = [
  { family: 'heat_source', label: 'Heat Sources', zh: '熱源' },
  { family: 'shared_base', label: 'Shared Base', zh: '共用基座' },
  { family: 'heat_sink', label: 'HSK', zh: '散熱器' },
  { family: 'boundary', label: 'Boundary', zh: '邊界' },
];

const SHARED_BASE_TYPES = new Set(['main_base', 'small_base', 'base_zone', 'housing']);
const HEAT_SINK_TYPES = new Set([
  'heat_sink_base',
  'fin_root',
  'fin_surface',
  'heat_pipe_evaporator',
  'heat_pipe_condenser',
]);

function familyOf(
  node: ThermalNetwork['nodes'][string],
): NodeFamily {
  if (isBoundaryNode(node)) return 'boundary';
  if (node.power_W > 0) return 'heat_source';
  if (HEAT_SINK_TYPES.has(node.type)) return 'heat_sink';
  if (SHARED_BASE_TYPES.has(node.type)) return 'shared_base';
  return 'other';
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
        'font-size': 9,
        'font-weight': 600,
        'text-max-width': '120px',
      },
    },
    { selector: 'node.boundary', style: { 'border-style': 'dashed', 'border-width': 2.5 } },
    { selector: 'node.dimmed', style: { opacity: 0.35 } },
    {
      selector: 'node.on-path',
      style: { 'border-width': 3, 'border-color': '#b45309', 'z-index': 20 },
    },
    { selector: 'node:selected', style: { 'border-color': '#1d4ed8', 'border-width': 3.5 } },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': '#cbd5e1',
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#cbd5e1',
        'arrow-scale': 0.7,
      },
    },
    { selector: 'edge.dimmed', style: { opacity: 0.25 } },
    {
      selector: 'edge.on-path',
      style: {
        width: 3.5,
        'line-color': '#f59e0b',
        'target-arrow-color': '#f59e0b',
        'z-index': 20,
      },
    },
  ] as unknown as StylesheetCSS[];
}

export interface NetworkSnapshotHandle {
  fit: () => void;
  center: (nodeId: string) => void;
}

function buildElements(
  network: ThermalNetwork,
  solution: ThermalSolution,
  path: CriticalPath,
): ElementDefinition[] {
  const onPathNodes = new Set(path.node_ids);
  const onPathEdges = new Set(path.edge_ids);
  const highlighting = onPathEdges.size > 0;
  const elements: ElementDefinition[] = [];

  for (const node of Object.values(network.nodes)) {
    if (node.disabled) continue;
    const temperature = solution.node_temperatures_C[node.id];
    if (temperature == null || !Number.isFinite(temperature)) continue;

    const family = familyOf(node);
    const style = FAMILY_STYLE[family];
    const label = `${node.name}\n${temperature.toFixed(1)} °C`;
    const box = labelBox(label);
    const onPath = onPathNodes.has(node.id);

    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label,
        w: box.w,
        h: box.h,
        fill: style.fill,
        border: style.border,
        text: style.text,
      },
      classes: [
        family === 'boundary' ? 'boundary' : '',
        onPath ? 'on-path' : highlighting ? 'dimmed' : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  const present = new Set(elements.map((element) => element.data.id as string));
  for (const edge of Object.values(network.edges)) {
    if (!edge.enabled) continue;
    if (!present.has(edge.from) || !present.has(edge.to)) continue;
    const onPath = onPathEdges.has(edge.id);
    elements.push({
      group: 'edges',
      data: { id: edge.id, source: edge.from, target: edge.to },
      classes: onPath ? 'on-path' : highlighting ? 'dimmed' : '',
    });
  }

  return elements;
}

export const NetworkSnapshot = forwardRef<
  NetworkSnapshotHandle,
  {
    network: ThermalNetwork;
    solution: ThermalSolution;
    path: CriticalPath;
    selectedNodeId: string | null;
    onSelectNode: (nodeId: string | null) => void;
  }
>(function NetworkSnapshot({ network, solution, path, selectedNodeId, onSelectNode }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const fittedRef = useRef(false);
  const fittedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const signatureRef = useRef('');

  const handlers = useRef({ onSelectNode });
  handlers.current = { onSelectNode };

  const elements = useMemo(
    () => buildElements(network, solution, path),
    [network, solution, path],
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
      // 10 §13, AC-10-17 — the snapshot is read-only. Nothing can be dragged.
      autoungrabify: true,
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (event) => handlers.current.onSelectNode(event.target.id() as string));
    cy.on('tap', (event) => {
      if (event.target === cy) handlers.current.onSelectNode(null);
    });

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0 || rect.height === 0) return;
      cy.resize();
      if (cy.nodes().length === 0) return;

      const last = fittedSizeRef.current;
      const changed =
        !last ||
        Math.abs(rect.width - last.width) / Math.max(last.width, 1) > 0.15 ||
        Math.abs(rect.height - last.height) / Math.max(last.height, 1) > 0.15;

      if (!fittedRef.current || changed) {
        cy.fit(undefined, 30);
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
      cy.nodes().forEach((node) => {
        const position = node.position();
        positionsRef.current[node.id() as string] = { x: position.x, y: position.y };
      });
    };

    const refit = () => {
      cy.resize();
      const box = cy.container()?.getBoundingClientRect();
      const sized = Boolean(box && box.width > 0 && box.height > 0);
      if (sized) cy.fit(undefined, 30);
      fittedRef.current = sized && cy.nodes().length > 0;
    };

    if (missing.length > 0 && cy.nodes().length > 0) {
      const layout = cy.layout({
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: 22,
        rankSep: 64,
        animate: false,
      } as unknown as cytoscape.LayoutOptions);
      // Positions are only ever read after the layout has finished.
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

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().unselect();
    if (!selectedNodeId) return;
    const node = cy.getElementById(selectedNodeId);
    if (node.length > 0) node.select();
  }, [selectedNodeId, elements]);

  useImperativeHandle(
    ref,
    (): NetworkSnapshotHandle => ({
      fit: () => cyRef.current?.fit(undefined, 30),
      center: (nodeId) => {
        const cy = cyRef.current;
        const node = cy?.getElementById(nodeId);
        if (cy && node && node.length > 0) {
          cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 0.8) }, { duration: 200 });
        }
      },
    }),
    [],
  );

  return <div ref={containerRef} className="size-full" data-testid="overview-network-snapshot" />;
});

/** Legend for the four node families plus the highlighted path (10 §13). */
export function SnapshotLegend({ path }: { path: CriticalPath }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-500">
      {FAMILY_LABELS.map((entry) => (
        <span key={entry.family} className="flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-sm border"
            style={{
              backgroundColor: FAMILY_STYLE[entry.family].fill,
              borderColor: FAMILY_STYLE[entry.family].border,
            }}
          />
          {entry.label}
          <span className="text-ink-400">{entry.zh}</span>
        </span>
      ))}
      <span className="flex items-center gap-1 font-semibold text-[#b45309]">
        <span aria-hidden className="inline-block h-0 w-5 border-t-[3px] border-[#f59e0b]" />
        {path.origin === 'top_bottleneck'
          ? 'Top Bottleneck Path / 首要瓶頸路徑'
          : path.origin === 'hottest_component'
            ? 'Hottest Component Path / 最熱元件路徑'
            : 'No path highlighted / 無標示路徑'}
      </span>
    </div>
  );
}
