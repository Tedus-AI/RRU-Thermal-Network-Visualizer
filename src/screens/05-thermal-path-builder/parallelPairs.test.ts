/**
 * The brace over a parallel pair, on all three screens that draw one.
 *
 * Two faults were reported together, and they have one cause: the combination
 * was owned by the BUS. A bar only forms at four branches or more, so filtering
 * the graph down to one component dissolved it — on Screen 07 the combination
 * vanished with it, and on Screens 05 and 06 it was never drawn at all. The
 * pair belongs to the network, not to the bar that happens to be drawn over it.
 *
 * The third fault was quieter and worse: 05 printed the FPGA's spreading branch
 * as `0.057` and 07 printed `0.322` for the same edge, so the two screens read
 * as though they disagreed. They do not — 05 has no boundary condition, so it
 * builds the edge at Bi → ∞, which is a lower bound — but nothing on the graph
 * said so.
 */

import { describe, expect, it } from 'vitest';

import type { ThermalNetwork } from '@/thermal/types';

import { cytoscapeStylesheet } from '@/ui/graphStyles';

import {
  floorPrefix,
  isSpreadingFloor,
  parallelBraceElement,
  parallelBranchGeometry,
  parallelPairNames,
  parallelPairs,
} from './parallelPairs';
import { buildElements } from './thermalGraphElements';

const SPREAD = 'EDGE_PORT_CMP_FPGA_TIM_HEAT_OUT_HSK_BASE';
const PIPE = 'EDGE_PORT_MOUNT_CMP_FPGA_TIM_HEAT_PIPE';

/** The real XCZU67DR pair: one spreading edge, one two-pipe mount. */
function network(): ThermalNetwork {
  const node = (id: string, componentRef: string | null) => ({
    id,
    name: id,
    type: 'custom',
    power_W: 0,
    limit_C: null,
    component_ref: componentRef,
    disabled: false,
    ports: [],
  });
  return {
    nodes: {
      NODE_TIM: node('NODE_TIM', 'CMP_FPGA'),
      NODE_HSK_BASE: node('NODE_HSK_BASE', null),
      NODE_OTHER: node('NODE_OTHER', 'CMP_OTHER'),
    },
    edges: {
      [SPREAD]: {
        id: SPREAD,
        from: 'NODE_TIM',
        to: 'NODE_HSK_BASE',
        type: 'spreading',
        method: 'spreading_disc',
        enabled: true,
        // No `bi`: Screens 05/06 have no boundary, so this is the Bi → ∞ floor.
        parameters: { source_area_mm2: 770, plate_area_mm2: 92400 },
        rth: { analytical: 0.056823, active_source: 'Analytical', provenance: {} },
      },
      [PIPE]: {
        id: PIPE,
        from: 'NODE_TIM',
        to: 'NODE_HSK_BASE',
        type: 'heat_pipe',
        method: 'direct_rth',
        enabled: true,
        parameters: { R_C_per_W: 0.065, R_per_pipe_C_per_W: 0.13, pipes: 2 },
        rth: { analytical: 0.065, active_source: 'Analytical', provenance: {} },
      },
      EDGE_LONE: {
        id: 'EDGE_LONE',
        from: 'NODE_OTHER',
        to: 'NODE_HSK_BASE',
        type: 'conduction',
        method: 'direct_rth',
        enabled: true,
        parameters: {},
        rth: { analytical: 0.2, active_source: 'Analytical', provenance: {} },
      },
    },
    templates: {},
    layout: {
      positions: {
        NODE_TIM: { x: 0, y: 0 },
        NODE_HSK_BASE: { x: 400, y: 0 },
        NODE_OTHER: { x: 0, y: 200 },
      },
    },
  } as unknown as ThermalNetwork;
}

const NONE = new Set<string>();

describe('finding the pairs a bus is not drawing', () => {
  it('finds the two routes from one terminal to the base', () => {
    const pairs = parallelPairs(network(), NONE, NONE);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].edgeIds).toEqual([SPREAD, PIPE]);
    expect(pairs[0].from).toBe('NODE_TIM');
    expect(pairs[0].to).toBe('NODE_HSK_BASE');
  });

  it('leaves a lone branch alone — there is nothing to combine', () => {
    const pairs = parallelPairs(network(), NONE, NONE);

    expect(pairs.flatMap((pair) => pair.edgeIds)).not.toContain('EDGE_LONE');
  });

  /** The bar writes its own combination; two would be one too many. */
  it('yields to the bus where the bus already routes the branches', () => {
    expect(parallelPairs(network(), NONE, new Set([SPREAD, PIPE]))).toEqual([]);
  });

  it('drops a pair whose terminal the reader has filtered out', () => {
    expect(parallelPairs(network(), new Set(['NODE_TIM']), NONE)).toEqual([]);
  });

  it('ignores a disabled branch, so a disabled pair is no longer a pair', () => {
    const net = network();
    net.edges[PIPE].enabled = false;

    expect(parallelPairs(net, NONE, NONE)).toEqual([]);
  });
});

describe('naming what the combination came from', () => {
  /**
   * The reported gap: `∥ 0.054 °C/W` never said WHICH two of the lines on
   * screen produced it. The names are the ones the branches carry, so they
   * match by reading rather than by tracing curves.
   */
  it('names both branches, and says the pipe count', () => {
    expect(parallelPairNames(network(), [SPREAD, PIPE])).toBe('Spreading ∥ Heat Pipe ×2');
  });

  it('joins them by what the mode actually does to them', () => {
    expect(parallelPairNames(network(), [SPREAD, PIPE], 'heat_flow')).toBe(
      'Spreading + Heat Pipe ×2',
    );
    expect(parallelPairNames(network(), [SPREAD, PIPE], 'delta_t')).toBe(
      'Spreading, Heat Pipe ×2',
    );
  });

  it('says nothing for a single branch', () => {
    expect(parallelPairNames(network(), [SPREAD])).toBe('');
  });
});

describe('the Bi → ∞ floor, which is why 05 and 07 print different numbers', () => {
  it('recognises a disc-spreading edge built without a Biot number', () => {
    expect(isSpreadingFloor(network().edges[SPREAD])).toBe(true);
  });

  /** Once Screen 07 re-solves it at the scenario's real Bi, it is an answer. */
  it('stops calling it a floor once a Bi is stated', () => {
    const net = network();
    net.edges[SPREAD].parameters = { ...net.edges[SPREAD].parameters, bi: 0.1061 };

    expect(isSpreadingFloor(net.edges[SPREAD])).toBe(false);
  });

  it('leaves an ordinary resistance alone', () => {
    expect(isSpreadingFloor(network().edges[PIPE])).toBe(false);
  });

  /** A combination containing a floor is itself only a floor. */
  it('marks the pair when either branch is a floor', () => {
    expect(floorPrefix(network(), [SPREAD, PIPE])).toBe('≥');
    expect(floorPrefix(network(), [PIPE])).toBe('');
  });
});

describe('what Screen 05 draws (and Screen 06 with it, through the same canvas)', () => {
  const elementsOf = (net: ThermalNetwork, hiddenComponentIds?: ReadonlySet<string>) =>
    buildElements(net, {
      showPorts: false,
      showLabels: true,
      layoutMode: 'LeftRight',
      hiddenComponentIds,
    });

  const brace = (net: ThermalNetwork, hiddenComponentIds?: ReadonlySet<string>) =>
    elementsOf(net, hiddenComponentIds).find((element) =>
      String(element.classes ?? '').includes('parallel-brace'),
    );

  /** The report: filter to one component and the combination is simply gone. */
  it('braces the pair, naming both branches and the combined value', () => {
    const found = brace(network());

    expect(found).toBeDefined();
    expect(found!.data.source).toBe('NODE_TIM');
    expect(found!.data.target).toBe('NODE_HSK_BASE');
    // 1/(1/0.056823 + 1/0.065) = 0.030319, and it is a floor on this screen.
    expect(found!.data.label).toBe('Spreading ∥ Heat Pipe ×2\n∥ ≥0.030 °C/W');
  });

  it('marks the spreading branch itself as a floor', () => {
    const spreading = elementsOf(network()).find((element) => element.data.id === SPREAD);

    expect(spreading!.data.label).toBe('Spreading ≥0.057 °C/W');
  });

  /** The pipe is a vendor number, not a bound — it must not gain a `≥`. */
  it('leaves the pipe branch unmarked', () => {
    const pipe = elementsOf(network()).find((element) => element.data.id === PIPE);

    expect(pipe!.data.label).toBe('Heat Pipe ×2 0.065 °C/W');
  });

  it('takes the brace away with the component the reader hid', () => {
    expect(brace(network(), new Set(['CMP_FPGA']))).toBeUndefined();
  });

  it('draws no brace when labels are off', () => {
    const elements = buildElements(network(), {
      showPorts: false,
      showLabels: false,
      layoutMode: 'LeftRight',
    });

    expect(
      elements.some((element) => String(element.classes ?? '').includes('parallel-brace')),
    ).toBe(false);
  });
});

describe('the brace element itself', () => {
  it('is a view-only edge across the pair, bowed clear of the branches', () => {
    const pair = parallelPairs(network(), NONE, NONE)[0];
    const element = parallelBraceElement(pair, 'x', '#0f766e');

    expect(element.group).toBe('edges');
    expect(element.classes).toContain('view-only');
    expect(element.selectable).toBe(false);
    // Wider than Cytoscape's own ±20 px fan, or it would read as a third route.
    expect(element.data.bow as number).toBeGreaterThan(40);
  });
});

describe('how the two branches of a pair are placed', () => {
  /**
   * Cytoscape fans siblings apart on its own, but the direction it picks is an
   * implementation detail — and relying on it put each label on the WRONG side
   * of its own curve, so the two converged on one spot in the middle of the gap
   * instead of separating. Curve and label come from one number now, so they
   * cannot disagree.
   */
  it('bows the pair symmetrically, and sends each label the way its curve went', () => {
    const a = parallelBranchGeometry(0, 2);
    const b = parallelBranchGeometry(1, 2);

    expect(a.bow).toBe(-b.bow);
    expect(Math.sign(a.labelMargin)).toBe(Math.sign(a.bow));
    expect(Math.sign(b.labelMargin)).toBe(Math.sign(b.bow));
  });

  it('keeps a three-way split symmetric, with the middle one straight', () => {
    const [a, b, c] = [0, 1, 2].map((index) => parallelBranchGeometry(index, 3));

    expect(b.bow).toBe(0);
    expect(a.bow).toBe(-c.bow);
  });
});

describe('the class the branch carries', () => {
  /**
   * The regression this exists to stop. `parallel-branch` was ALREADY 05's, for
   * a bus branch whose label is rendered by a separate anchor node — so its
   * rule blanks the edge's own label. Reusing the name for a bus-less pair
   * silently erased every label on it: the data was right, the elements were
   * right, and the canvas drew two unlabelled curves.
   */
  it('is not the bus class, whose rule blanks the label it needs', () => {
    const elements = buildElements(network(), {
      showPorts: false,
      showLabels: true,
      layoutMode: 'LeftRight',
      hiddenComponentIds: new Set(['CMP_OTHER']),
    });
    const branch = elements.find((element) => element.data.id === SPREAD)!;

    expect(String(branch.classes)).toContain('parallel-pair-branch');
    expect(String(branch.classes).split(/\s+/)).not.toContain('parallel-branch');
  });

  it('leaves the bus rule blanking only what the bus draws anchors for', () => {
    const blanked = cytoscapeStylesheet().filter(
      (rule) =>
        String((rule as { selector: string }).selector).includes('parallel') &&
        (rule as { style?: Record<string, unknown> }).style?.label === '',
    );

    for (const rule of blanked) {
      expect(String((rule as { selector: string }).selector)).not.toContain(
        'parallel-pair-branch',
      );
    }
  });
});
