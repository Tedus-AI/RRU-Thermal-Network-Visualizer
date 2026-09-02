/**
 * Solved thermal graph — 07 §20–§28.
 *
 * The canvas paints ONE result mode at a time and says which. Colour always
 * means the quantity named in the toolbar, never a bottleneck rank: 07 §44
 * keeps ranking, sensitivity and composite scores entirely inside Screen 08.
 *
 * Heat-flow arrows follow the SOLVED direction (07 §22): a negative Q flips the
 * arrow instead of being hidden or flagged as an error.
 *
 * The Cytoscape mechanics repeat what Screens 05 and 06 learned: explicit node
 * sizes rather than `width: label`, positions read only after `layoutstop`, and
 * a fit that waits until the container really has a size.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import cytoscape, { type Core, type ElementDefinition, type StylesheetCSS } from 'cytoscape';
import dagre from 'cytoscape-dagre';

import { GROUP_COLORS, labelBox, nodeGroup } from '@/ui/graphStyles';
import {
  marqueeRect,
  WHEEL_ZOOM_STEP,
  wheelNotches,
  zoomRegionViewport,
  type ViewportBox,
} from '@/ui/graphViewport';
import { layoutOptions } from '@/screens/05-thermal-path-builder/ThermalGraphCanvas';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import {
  RTH_SOURCE_BADGE,
  RTH_SOURCE_COLORS,
  buildScale,
  num,
  rth as formatRth,
  signed,
  type ResultMode,
  type Scale,
} from './resultViewModel';

cytoscape.use(dagre);

export interface GraphDisplayOptions {
  showLabels: boolean;
  showPower: boolean;
  showLimits: boolean;
  showBoundary: boolean;
  /** Dims everything not attached to the selection — 07 §27 "Focus Path". */
}

export interface SolvedGraphHandle {
  fit: () => void;
  zoomBy: (delta: number) => void;
  relayout: (mode: string) => void;
  center: (elementId: string) => void;
}

/**
 * What the pointer does on this canvas.
 *
 * Screen 05's canvas carries a longer list because it edits topology; here
 * nothing is editable, so the only choice is between panning the view and
 * dragging out a region to zoom into.
 */
export type SolvedCanvasTool = 'select' | 'zoom-box';

const EDGE_NEUTRAL = '#94a3b8';
const DELTA_RAMP = ['#e0f2fe', '#7dd3fc', '#fbbf24', '#f97316', '#dc2626'] as const;
const RTH_RAMP = ['#bbf7d0', '#86efac', '#fde68a', '#fb923c', '#ef4444'] as const;

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
    { selector: 'node.over-limit', style: { 'border-color': '#dc2626', 'border-width': 3 } },
    { selector: 'node:selected', style: { 'border-color': '#1d4ed8', 'border-width': 3.5 } },
    { selector: '.dimmed', style: { opacity: 0.18 } },
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
        'font-weight': 600,
        color: '#334155',
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.9,
        'text-background-padding': '2px',
        'text-rotation': 'autorotate',
      },
    },
    {
      selector: 'edge:selected',
      style: { 'line-color': '#1d4ed8', 'target-arrow-color': '#1d4ed8', 'source-arrow-color': '#1d4ed8' },
    },
  ] as unknown as StylesheetCSS[];
}

/** Line width from |Q|, 1.5–9 px. Thickness is magnitude only (07 §22). */
function widthForFlow(magnitude: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(magnitude)) return 2;
  return 1.5 + (Math.min(magnitude, max) / max) * 7.5;
}

function buildElements(
  network: ThermalNetwork,
  solution: ThermalSolution | null,
  mode: ResultMode,
  display: GraphDisplayOptions,
  scenarioId: string,
  scales: { temperature: Scale; delta: Scale; rth: Scale; maxFlow: number },
): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  const solved = mode === 'temperature' || mode === 'heat_flow' || mode === 'delta_t';

  for (const node of Object.values(network.nodes)) {
    if (node.disabled) continue;

    const group = nodeGroup(node);
    const role = GROUP_COLORS[group];
    const temperature = solution?.node_temperatures_C[node.id] ?? null;
    const fixed = node.boundary_type === 'fixed_temperature' || node.boundary_role === 'placeholder';

    if (fixed && !display.showBoundary) continue;

    const lines = [node.name];
    if (mode === 'temperature' && temperature != null) {
      lines.push(`${temperature.toFixed(1)} °C`);
    }
    if (display.showPower && node.power_W > 0) lines.push(`${num(node.power_W, 2, 'W')}`);
    if (display.showLimits && node.limit_C != null) {
      const margin = temperature != null ? node.limit_C - temperature : null;
      lines.push(
        margin != null
          ? `limit ${node.limit_C.toFixed(0)} °C · margin ${margin.toFixed(1)}`
          : `limit ${node.limit_C.toFixed(0)} °C`,
      );
    }
    if (fixed && mode !== 'temperature') lines.push('Boundary');

    const label = display.showLabels ? lines.join('\n') : '';
    const box = labelBox(label || node.name);

    // Only the Temperature mode colours a node by a result (07 §21, §22).
    const fill =
      mode === 'temperature' && temperature != null
        ? scales.temperature.colorOf(temperature)
        : role.fill;
    const text = mode === 'temperature' && temperature != null ? '#ffffff' : role.text;

    const classes: string[] = [];
    if (fixed) classes.push('fixed');
    if (node.limit_C != null && temperature != null && temperature > node.limit_C) {
      classes.push('over-limit');
    }

    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label,
        w: box.w,
        h: box.h,
        fill,
        border: role.border,
        text,
      },
      classes: classes.join(' '),
    });
  }

  const presentNodes = new Set(elements.map((element) => element.data.id as string));

  for (const edge of Object.values(network.edges)) {
    if (!presentNodes.has(edge.from) || !presentNodes.has(edge.to)) continue;

    const result = solution?.edge_results[edge.id] ?? null;
    const override = edge.scenario_overrides?.[scenarioId];
    const R = result?.active_rth_C_per_W ?? override?.R_C_per_W ?? null;
    const enabled = edge.enabled && override?.enabled !== false;

    let color = EDGE_NEUTRAL;
    let width = 2;
    let label = '';
    let reverse = false;

    switch (mode) {
      case 'temperature':
        // Edges stay neutral; the optional Q label is the only result shown.
        if (display.showLabels && result) label = `${num(result.heat_flow_W, 1, 'W')}`;
        break;

      case 'heat_flow':
        if (result) {
          color = '#ea580c';
          width = widthForFlow(Math.abs(result.heat_flow_W), scales.maxFlow);
          reverse = result.actual_direction === 'reverse';
          if (display.showLabels) label = `${Math.abs(result.heat_flow_W).toFixed(1)} W`;
        }
        break;

      case 'delta_t':
        if (result) {
          color = scales.delta.colorOf(Math.abs(result.delta_T_C));
          width = 3;
          if (display.showLabels) label = signed(result.delta_T_C, 1, '°C');
        }
        break;

      case 'rth':
        if (R != null) {
          color = scales.rth.colorOf(R);
          width = 3;
          if (display.showLabels) label = `${formatRth(R)} °C/W`;
        } else if (display.showLabels) {
          label = 'Rth N/A';
        }
        break;

      case 'rth_source': {
        const badge = RTH_SOURCE_BADGE[edge.rth.active_source];
        const boundaryDerived = result?.rth_origin === 'boundary_scenario';
        color = boundaryDerived ? '#2563eb' : (RTH_SOURCE_COLORS[badge?.short ?? 'A'] ?? EDGE_NEUTRAL);
        width = 3;
        if (display.showLabels) {
          label = R == null ? 'Unresolved' : boundaryDerived ? 'Boundary (06)' : (badge?.label ?? 'Unresolved');
        }
        break;
      }

      case 'node_type':
      default:
        break;
    }

    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label,
        color,
        width,
        // A negative Q means the heat really flows the other way (07 §15, §22).
        srcArrow: reverse ? 'triangle' : 'none',
        tgtArrow: reverse ? 'none' : 'triangle',
        lineStyle: !enabled ? 'dotted' : R == null && solved ? 'dashed' : 'solid',
      },
    });
  }

  return elements;
}

export const SolvedGraphCanvas = forwardRef<
  SolvedGraphHandle,
  {
    network: ThermalNetwork;
    solution: ThermalSolution | null;
    mode: ResultMode;
    display: GraphDisplayOptions;
    scenarioId: string;
    selectedNodeId: string | null;
    selectedEdgeId: string | null;
    tool: SolvedCanvasTool;
    onSelectNode: (nodeId: string | null) => void;
    onSelectEdge: (edgeId: string | null) => void;
    onZoomChange: (zoom: number) => void;
  }
>(function SolvedGraphCanvas(
  {
    network,
    solution,
    mode,
    display,
    scenarioId,
    selectedNodeId,
    selectedEdgeId,
    tool,
    onSelectNode,
    onSelectEdge,
    onZoomChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const fittedRef = useRef(false);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const signatureRef = useRef('');

  // Marquee zoom, in container pixels. `null` while no drag is in progress.
  const [marquee, setMarquee] = useState<ViewportBox | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);

  const handlers = useRef({ onSelectNode, onSelectEdge, onZoomChange });
  handlers.current = { onSelectNode, onSelectEdge, onZoomChange };

  const scales = useMemo(() => {
    const temperatures = Object.values(solution?.node_temperatures_C ?? {});
    const results = Object.values(solution?.edge_results ?? {});
    return {
      temperature: buildScale(temperatures),
      delta: buildScale(results.map((entry) => Math.abs(entry.delta_T_C)), DELTA_RAMP),
      rth: buildScale(results.map((entry) => entry.active_rth_C_per_W), RTH_RAMP),
      maxFlow: results.reduce((max, entry) => Math.max(max, Math.abs(entry.heat_flow_W)), 0),
    };
  }, [solution]);

  const elements = useMemo(
    () => buildElements(network, solution, mode, display, scenarioId, scales),
    [network, solution, mode, display, scenarioId, scales],
  );

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: stylesheet(),
      minZoom: 0.15,
      maxZoom: 3,
      boxSelectionEnabled: false,
      // Cytoscape's own wheel zoom is off so the hand-rolled one below is the
      // only thing acting on a notch. Left on, the two stacked and a single
      // notch moved this canvas 7.9% against Screen 05's 3.0%.
      userZoomingEnabled: false,
    });
    cyRef.current = cy;

    /**
     * The wheel, by hand, so a notch is worth the same here as on Screens 05
     * and 06. Cytoscape's `wheelSensitivity` scales the raw delta instead, and
     * the raw delta depends on the mouse and the operating system — the same
     * flick moved this canvas noticeably further than the other two.
     */
    const container = containerRef.current;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const notches = wheelNotches(event);
      if (notches === 0) return;
      const bounds = container.getBoundingClientRect();
      cy.zoom({
        // Wheel down is a positive delta and means zoom out.
        level: cy.zoom() * WHEEL_ZOOM_STEP ** -notches,
        // The point under the cursor stays under the cursor.
        renderedPosition: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      });
    };
    container.addEventListener('wheel', onWheel, { passive: false });

    cy.on('tap', 'node', (event) => {
      handlers.current.onSelectNode(event.target.id() as string);
      handlers.current.onSelectEdge(null);
    });
    cy.on('tap', 'edge', (event) => {
      handlers.current.onSelectEdge(event.target.id() as string);
      handlers.current.onSelectNode(null);
    });
    cy.on('tap', (event) => {
      if (event.target !== cy) return;
      handlers.current.onSelectNode(null);
      handlers.current.onSelectEdge(null);
    });

    // The toolbar shows the zoom level, so every route that changes it — the
    // wheel included — has to report, not just the buttons.
    cy.on('zoom', () => handlers.current.onZoomChange(cy.zoom()));

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0 || rect.height === 0) return;
      cy.resize();
      if (!fittedRef.current && cy.nodes().length > 0) {
        cy.fit(undefined, 40);
        fittedRef.current = true;
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      container.removeEventListener('wheel', onWheel);
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
      // Layout applies positions asynchronously; reading them before
      // `layoutstop` yields zeros and stacks the whole graph on one point.
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

  // --- selection + focus ---------------------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().unselect();
    cy.elements().removeClass('dimmed');

    const selected = selectedNodeId
      ? cy.getElementById(selectedNodeId)
      : selectedEdgeId
        ? cy.getElementById(selectedEdgeId)
        : null;

    if (!selected || selected.length === 0) return;
    selected.select();

  }, [selectedNodeId, selectedEdgeId, elements]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // While a region is being drawn the overlay owns the pointer, so panning
    // would fight it. Leaving the tool also drops any half-drawn rectangle.
    cy.userPanningEnabled(tool !== 'zoom-box');
    if (tool !== 'zoom-box') {
      marqueeStart.current = null;
      setMarquee(null);
    }
  }, [tool]);

  /** Zoom the viewport onto a region the engineer drew, in container pixels. */
  const zoomToRegion = (box: ViewportBox) => {
    const cy = cyRef.current;
    if (!cy) return;
    const next = zoomRegionViewport({
      box,
      current: { zoom: cy.zoom(), pan: cy.pan() },
      viewWidth: cy.width(),
      viewHeight: cy.height(),
      minZoom: cy.minZoom(),
      maxZoom: cy.maxZoom(),
    });
    if (!next) return;
    cy.viewport(next);
    handlers.current.onZoomChange(cy.zoom());
  };

  useImperativeHandle(
    ref,
    (): SolvedGraphHandle => ({
      // `resize` first: a caller fitting right after the container changed size
      // — the fullscreen toggle — would otherwise fit to the old dimensions,
      // because Cytoscape caches them until it is told to re-measure.
      fit: () => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.resize();
        cy.fit(undefined, 40);
        handlers.current.onZoomChange(cy.zoom());
      },
      zoomBy: (delta) => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.zoom({ level: cy.zoom() + delta, renderedPosition: { x: 0, y: 0 } });
        cy.center();
      },
      relayout: (mode) => {
        const cy = cyRef.current;
        if (!cy || cy.nodes().length === 0) return;
        // The same options Screen 05 uses, so a mode means the same thing on
        // both — including the rank separation widening to fit the longest
        // edge label, which is what keeps a label off the boxes either side.
        const labels: string[] = [];
        cy.edges().forEach((edge) => {
          const label = edge.data('label');
          if (typeof label === 'string' && label.trim()) labels.push(label);
        });
        const layout = cy.layout(
          layoutOptions(mode, labels) as unknown as cytoscape.LayoutOptions,
        );
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

  const rect = marqueeRect(marquee);

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" data-testid="solved-graph-canvas" />
      {tool === 'zoom-box' && (
        <div
          data-testid="solved-zoom-marquee-layer"
          className="absolute inset-0 z-10 cursor-crosshair"
          onPointerDown={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
            marqueeStart.current = point;
            setMarquee({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = marqueeStart.current;
            if (!start) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            setMarquee({
              x1: start.x,
              y1: start.y,
              x2: event.clientX - bounds.left,
              y2: event.clientY - bounds.top,
            });
          }}
          onPointerUp={(event) => {
            const start = marqueeStart.current;
            marqueeStart.current = null;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (start) {
              zoomToRegion({
                x1: start.x,
                y1: start.y,
                x2: event.clientX - bounds.left,
                y2: event.clientY - bounds.top,
              });
            }
            setMarquee(null);
          }}
          onPointerCancel={() => {
            marqueeStart.current = null;
            setMarquee(null);
          }}
        >
          {rect && (
            <div
              aria-hidden
              className="absolute border-2 border-accent-600 bg-accent-500/15"
              style={rect}
            />
          )}
        </div>
      )}
    </div>
  );
});

/** Legend rows for the active mode — 07 §21, §22 both require one. */
export function legendFor(
  mode: ResultMode,
  solution: ThermalSolution | null,
): Array<{ color: string; label: string; zh: string }> {
  const results = Object.values(solution?.edge_results ?? {});

  switch (mode) {
    case 'temperature': {
      const scale = buildScale(Object.values(solution?.node_temperatures_C ?? {}));
      if (scale.max === scale.min) {
        return [{ color: scale.colorOf(scale.min), label: `${scale.min.toFixed(1)} °C`, zh: '節點溫度' }];
      }
      return scale.stops.map((stop) => ({
        color: stop.color,
        label: `${stop.from.toFixed(0)} – ${stop.to.toFixed(0)} °C`,
        zh: '節點溫度',
      }));
    }

    case 'heat_flow': {
      const max = results.reduce((value, entry) => Math.max(value, Math.abs(entry.heat_flow_W)), 0);
      return [
        { color: '#ea580c', label: `Thickest = ${max.toFixed(1)} W`, zh: '線寬代表熱流大小' },
        { color: '#ea580c', label: 'Arrow = solved direction', zh: '箭頭為實際求解方向' },
        { color: EDGE_NEUTRAL, label: 'Reverse flow flips the arrow', zh: '負值代表逆向流動' },
      ];
    }

    case 'delta_t': {
      const scale = buildScale(results.map((entry) => Math.abs(entry.delta_T_C)), DELTA_RAMP);
      return scale.stops.map((stop) => ({
        color: stop.color,
        label: `${stop.from.toFixed(1)} – ${stop.to.toFixed(1)} °C`,
        zh: '連線溫差（帶正負號顯示）',
      }));
    }

    case 'rth': {
      const scale = buildScale(results.map((entry) => entry.active_rth_C_per_W), RTH_RAMP);
      return scale.stops.map((stop) => ({
        color: stop.color,
        label: `${formatRth(stop.from)} – ${formatRth(stop.to)} °C/W`,
        zh: '作用中熱阻',
      }));
    }

    case 'rth_source':
      return [
        { color: RTH_SOURCE_COLORS.A, label: 'A · Analytical', zh: '解析計算' },
        { color: RTH_SOURCE_COLORS.U, label: 'U · Manual', zh: '手動輸入' },
        { color: RTH_SOURCE_COLORS.M, label: 'M · Measurement', zh: '量測' },
        { color: RTH_SOURCE_COLORS.F, label: 'F · FloTHERM (reserved)', zh: 'FloTHERM（03 尚未實作）' },
        { color: '#2563eb', label: 'Boundary derived (06)', zh: '由 06 邊界條件推導' },
      ];

    case 'node_type':
    default:
      return [
        { color: GROUP_COLORS.source.border, label: 'Heat Source', zh: '熱源' },
        { color: GROUP_COLORS.spreader.border, label: 'Case / Spreader', zh: '外殼 / 擴散' },
        { color: GROUP_COLORS.interface.border, label: 'Interface', zh: '介面' },
        { color: GROUP_COLORS.zone.border, label: 'Base / Structure', zh: '基座 / 結構' },
        { color: GROUP_COLORS.heatsink.border, label: 'Heat Sink', zh: '散熱器' },
        { color: GROUP_COLORS.boundary.border, label: 'Boundary', zh: '邊界' },
      ];
  }
}
