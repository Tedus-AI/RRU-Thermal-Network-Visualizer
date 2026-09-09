/**
 * The three least-margin parts, marked on the whole machine.
 *
 * Screen 08's deck numbers three parts and its focused view numbers the
 * segments of whichever one is chosen. Widening to the whole machine had
 * neither: 113 nodes and nothing saying which three the screen is about. The
 * badge is the same one, anchored to the part rather than to a segment — so
 * what is asserted here is that it is emitted for exactly the ranked parts,
 * that it never marks something the graph is not drawing, and that it arrives
 * lit, since unlike a segment a ranked part has no "offered but not cut" state.
 */

import { describe, expect, it } from 'vitest';

import type { ThermalNetwork } from '@/thermal/types';

import { buildElements } from './SolvedGraphCanvas';
import { buildScale } from './resultViewModel';

const DISPLAY = { showLabels: true, showPower: true, showLimits: false, showBoundary: true };
const SCALES = { temperature: buildScale([60]), delta: buildScale([1]), rth: buildScale([0.5]), maxFlow: 1 };

function network(): ThermalNetwork {
  const node = (id: string, disabled = false) => ({
    id,
    name: id,
    type: 'custom',
    power_W: 0,
    limit_C: null,
    component_ref: id === 'C' ? 'CMP_C' : null,
    disabled,
  });
  return {
    nodes: { A: node('A'), B: node('B'), C: node('C'), D: node('D', true) },
    edges: {
      EDGE_A_B: {
        id: 'EDGE_A_B',
        from: 'A',
        to: 'B',
        enabled: true,
        rth: { analytical: 0.5, active_source: 'Analytical', provenance: {} },
      },
    },
    templates: {},
    layout: { positions: {} },
  } as unknown as ThermalNetwork;
}

function badges(
  ranked: ReadonlyMap<string, { rank: number }>,
  hidden: ReadonlySet<string> = new Set<string>(),
) {
  return buildElements(
    network(),
    null,
    'temperature',
    DISPLAY,
    'SCN_001',
    'TopBottom',
    SCALES,
    new Set<string>(),
    hidden,
    undefined,
    undefined,
    ranked,
  ).filter((element) => String(element.classes ?? '').includes('tuned-badge'));
}

describe('rank badges on the whole machine', () => {
  it('marks each ranked part, anchored to it and already lit', () => {
    const marks = badges(new Map([['A', { rank: 1 }], ['B', { rank: 2 }]]));

    expect(marks.map((element) => element.data.id)).toEqual(['A__RANK_BADGE', 'B__RANK_BADGE']);
    expect(marks.map((element) => element.data.label)).toEqual(['1', '2']);
    expect(marks.map((element) => element.data.anchorNodeId)).toEqual(['A', 'B']);
    for (const mark of marks) {
      expect(mark.classes).toContain('tuned-active');
      // It is furniture: dagre must not lay it out and it must not be clickable.
      expect(mark.classes).toContain('view-only');
      expect(mark.selectable).toBe(false);
    }
  });

  /** A badge floating beside a node the reader cannot see marks nothing. */
  it('skips a part the view is hiding, and one that is disabled', () => {
    expect(badges(new Map([['C', { rank: 1 }]]), new Set(['C']))).toHaveLength(0);
    expect(badges(new Map([['D', { rank: 1 }]]))).toHaveLength(0);
    expect(badges(new Map([['NOPE', { rank: 1 }]]))).toHaveLength(0);
  });

  it('emits nothing at all when no part is ranked — 07 marks nothing', () => {
    expect(badges(new Map())).toHaveLength(0);
  });
});

/**
 * The over-temperature alarm.
 *
 * A node past its limit already wears a red border; the dot is the version of
 * that a reader sees without looking for it. What matters here is that it
 * appears for exactly the nodes the border appears for — the same test, not a
 * second one that could drift from it — that it carries the degrees for the
 * hover text, and that it is off unless a screen asks for it.
 */
describe('over-limit alarm badges', () => {
  const hot = (): ThermalNetwork => {
    const net = network();
    (net.nodes as Record<string, { limit_C?: number }>).A.limit_C = 90;
    (net.nodes as Record<string, { limit_C?: number }>).B.limit_C = 90;
    return net;
  };
  const solved = {
    node_temperatures_C: { A: 96.4, B: 71.2, C: 60, D: 60 },
    edge_results: {},
  } as unknown as import('../../thermal/solver/solverTypes').ThermalSolution;

  const build = (alert: boolean) =>
    buildElements(
      hot(),
      solved,
      'temperature',
      DISPLAY,
      'SCN_001',
      'TopBottom',
      SCALES,
      new Set<string>(),
      undefined,
      undefined,
      undefined,
      undefined,
      alert,
    );

  it('marks the node that is over, and carries how far over', () => {
    const marks = build(true).filter((e) => String(e.classes ?? '').includes('alert-badge'));

    expect(marks).toHaveLength(1);
    expect(marks[0].data.id).toBe('A__ALERT_BADGE');
    expect(marks[0].data.anchorNodeId).toBe('A');
    expect(marks[0].data.over_C).toBeCloseTo(6.4, 6);
    expect(marks[0].data.alertLimit_C).toBe(90);
    // No digit in it: there is only one thing a red dot can mean here.
    expect(marks[0].data.label).toBe('');
    // It pulses with the rest, and takes the hover the others refuse.
    expect(marks[0].classes).toContain('pulse-badge');
  });

  it('agrees with the red border it is amplifying', () => {
    const elements = build(true);
    const bordered = elements
      .filter((e) => String(e.classes ?? '').includes('over-limit'))
      .map((e) => e.data.id);
    const dotted = elements
      .filter((e) => String(e.classes ?? '').includes('alert-badge'))
      .map((e) => String(e.data.anchorNodeId));

    expect(dotted).toEqual(bordered);
  });

  it('stays off unless a screen asks for it — 08 marks its own way', () => {
    expect(build(false).filter((e) => String(e.classes ?? '').includes('alert-badge'))).toHaveLength(
      0,
    );
  });
});
