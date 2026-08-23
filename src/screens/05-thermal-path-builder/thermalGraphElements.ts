/** View-only Cytoscape projection for Screen 05. */

import type { ElementDefinition } from 'cytoscape';

import { activeRth } from '@/thermal/rth';
import type { ThermalNetwork } from '@/thermal/types';
import { GROUP_COLORS, edgeColor, edgeLineStyle, labelBox, nodeGroup } from '@/ui/graphStyles';

const EDGE_SHORT: Record<string, string> = {
  package_rjc: 'Rjc',
  package_rjb: 'Rjb',
  package_rja: 'Rja',
  conduction: 'Cond',
  tim: 'TIM',
  solder: 'Solder',
  thermal_via: 'Via',
  contact: 'Contact',
  spreading: 'Spreading',
  heat_pipe: 'Heat Pipe',
  convection: 'Conv',
  radiation: 'Rad',
  custom: 'Custom',
};

const HSK_BUS_MIN_BRANCHES = 4;
const HSK_BUS_PREFIX = 'VIEW_HSK_BUS_';

interface HskBusBranch {
  edgeId: string;
  terminalId: string;
  sharedId: string;
  junctionId: string;
}

interface HskBusGroup {
  id: string;
  sharedId: string;
  branches: HskBusBranch[];
}

function hskBusGroups(network: ThermalNetwork, layoutMode: string): HskBusGroup[] {
  if (!['Auto', 'LeftRight'].includes(layoutMode)) return [];

  const grouped = new Map<string, Array<Omit<HskBusBranch, 'junctionId'>>>();
  for (const edge of Object.values(network.edges)) {
    if (!edge.id.startsWith('EDGE_PORT_')) continue;
    const from = network.nodes[edge.from];
    const to = network.nodes[edge.to];
    if (!from || !to) continue;

    const fromIsHsk = from.type === 'heat_sink_base';
    const toIsHsk = to.type === 'heat_sink_base';
    const terminalId = fromIsHsk && to.ports?.length
      ? to.id
      : toIsHsk && from.ports?.length
        ? from.id
        : null;
    const sharedId = fromIsHsk ? from.id : toIsHsk ? to.id : null;
    if (!terminalId || !sharedId) continue;

    const list = grouped.get(sharedId) ?? [];
    list.push({ edgeId: edge.id, terminalId, sharedId });
    grouped.set(sharedId, list);
  }

  return [...grouped.entries()]
    .filter(([, branches]) => branches.length >= HSK_BUS_MIN_BRANCHES)
    .map(([sharedId, branches]) => {
      const id = `${HSK_BUS_PREFIX}${sharedId}`;
      return {
        id,
        sharedId,
        branches: branches.map((branch) => ({
          ...branch,
          junctionId: `${id}_JUNCTION_${branch.edgeId}`,
        })),
      };
    });
}

function storedBusGeometry(network: ThermalNetwork, group: HskBusGroup) {
  const target = network.layout.positions[group.sharedId];
  const sources = group.branches
    .map((branch) => network.layout.positions[branch.terminalId])
    .filter((position): position is { x: number; y: number } => Boolean(position));
  const fallbackHeight = Math.max(80, group.branches.length * 54);
  if (!target || sources.length === 0) {
    return { position: undefined, height: fallbackHeight, busX: null as number | null };
  }

  const sourceXs = sources.map((position) => position.x);
  const targetOnRight = target.x >= sourceXs.reduce((sum, value) => sum + value, 0) / sourceXs.length;
  const sourceFront = targetOnRight ? Math.max(...sourceXs) : Math.min(...sourceXs);
  const busX = sourceFront + (target.x - sourceFront) * 0.58;
  const maxDistanceY = Math.max(...sources.map((position) => Math.abs(position.y - target.y)));
  return {
    position: { x: busX, y: target.y },
    height: Math.max(80, maxDistanceY * 2 + 16),
    busX,
  };
}

export function buildElements(
  network: ThermalNetwork,
  options: { showPorts: boolean; showLabels: boolean; layoutMode: string },
): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  const busGroups = hskBusGroups(network, options.layoutMode);
  const routedBranches = new Map(
    busGroups.flatMap((group) => group.branches.map((branch) => [branch.edgeId, branch] as const)),
  );

  for (const node of Object.values(network.nodes)) {
    const group = nodeGroup(node);
    const colors = GROUP_COLORS[group];
    const unconnected = (node.ports ?? []).filter((port) => !port.connected_to);
    const portLine =
      options.showPorts && (node.ports ?? []).length > 0
        ? `\n${(node.ports ?? [])
            .map((port) => (port.connected_to ? `${port.kind} ✓` : port.kind))
            .join(' · ')}`
        : '';
    const classes: string[] = [`role-${group}`];
    if (group === 'boundary') classes.push('boundary');
    if (unconnected.length > 0) classes.push('unconnected-port');
    if (node.disabled) classes.push('disabled');
    if (!options.showLabels) classes.push('hide-label');

    const label = `${node.name}${node.power_W > 0 ? ` · ${node.power_W.toFixed(1)} W` : ''}${portLine}`;
    const box = labelBox(label);
    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label,
        w: box.w,
        h: box.h,
        fill: colors.fill,
        border: colors.border,
        text: colors.text,
      },
      classes: classes.join(' '),
      position: network.layout.positions[node.id]
        ? { ...network.layout.positions[node.id] }
        : undefined,
    });
  }

  for (const group of busGroups) {
    const geometry = storedBusGeometry(network, group);
    elements.push({
      group: 'nodes',
      data: {
        id: group.id,
        sharedId: group.sharedId,
        w: 5,
        h: geometry.height,
        fill: '#0d9488',
        border: '#0d9488',
        text: '#0d9488',
        label: '',
      },
      classes: 'view-only hsk-bus',
      position: geometry.position,
      selectable: false,
      grabbable: false,
    });

    for (const branch of group.branches) {
      const sourcePosition = network.layout.positions[branch.terminalId];
      elements.push({
        group: 'nodes',
        data: {
          id: branch.junctionId,
          busId: group.id,
          sourceId: branch.terminalId,
          edgeId: branch.edgeId,
          w: 9,
          h: 9,
          fill: '#0d9488',
          border: '#0d9488',
          text: '#0d9488',
          label: '',
        },
        classes: 'view-only hsk-bus-junction',
        position:
          geometry.busX != null && sourcePosition
            ? { x: geometry.busX, y: sourcePosition.y }
            : undefined,
        selectable: false,
        grabbable: false,
      });
    }

    elements.push({
      group: 'edges',
      data: {
        id: `${group.id}_TRUNK`,
        source: group.id,
        target: group.sharedId,
        color: '#0d9488',
        lineStyle: 'solid',
        label: '',
      },
      classes: 'view-only hsk-bus-trunk',
      selectable: false,
    });
  }

  for (const edge of Object.values(network.edges)) {
    if (!network.nodes[edge.from] || !network.nodes[edge.to]) continue;
    const R = activeRth(edge.rth);
    const short = EDGE_SHORT[edge.type] ?? edge.type;
    const label = options.showLabels
      ? `${short} ${R != null ? `${R.toFixed(3)} °C/W` : '—'}`
      : '';
    const routed = routedBranches.get(edge.id);

    if (routed) {
      const terminalIsSource = edge.from === routed.terminalId;
      const routedLabel = options.showLabels
        ? R != null
          ? `${R.toFixed(3)} °C/W`
          : `${short} —`
        : '';
      elements.push({
        group: 'edges',
        data: {
          id: edge.id,
          source: terminalIsSource ? routed.terminalId : routed.junctionId,
          target: terminalIsSource ? routed.junctionId : routed.terminalId,
          label: routedLabel,
          labelOffset: 80,
          color: edgeColor(edge),
          lineStyle: edgeLineStyle(edge),
        },
        classes: `routed-port-edge ${terminalIsSource ? 'label-at-source' : 'label-at-target'}`,
      });
      // Preserve the authoritative terminal-to-HSK relationship for Dagre;
      // the engineer only sees the routed branch above.
      elements.push({
        group: 'edges',
        data: {
          id: `${routed.junctionId}_LAYOUT`,
          source: edge.from,
          target: edge.to,
          color: '#000000',
          lineStyle: 'solid',
          label: '',
        },
        classes: 'layout-only',
        selectable: false,
      });
      continue;
    }

    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label,
        color: edgeColor(edge),
        lineStyle: edgeLineStyle(edge),
      },
    });
  }

  return elements;
}
