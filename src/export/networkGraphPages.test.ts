/**
 * One page per distinct chain, not one per device.
 *
 * The rule as asked for: "每種元件如果有多顆又同瓦數就出一顆就好了". On the real
 * STARKCORE project that turns 113 nodes and 22 device instances into nine
 * pages — the four PAs are one identical chain drawn four times, and so are the
 * four drivers, the four pre-drivers, the four circulators and the two DDRs.
 *
 * The grouping is on power AND device count rather than on power alone, because
 * a GROUPED qty model splits a part across instances that stand for different
 * numbers of devices. Those chains differ and both deserve a page.
 */

import { describe, expect, it } from 'vitest';

import { createComponent, type Component } from '@/domain/component';

import { componentGraphPages, pageTitle } from './networkGraphPages';
import type { ThermalNetwork, ThermalNode } from '@/thermal/types';

function component(id: string, name: string, qty = 1): Component {
  return createComponent({
    id,
    name,
    category: 'RF',
    qty,
    power_W: 1,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-09-04T00:00:00.000Z',
    },
  });
}

/** A source node plus one passive node, as every template emits. */
function chain(
  componentId: string,
  instance: string | null,
  power: number,
  devices = 1,
): ThermalNode[] {
  const suffix = instance ? `_${instance}` : '';
  const meta = (extra: Record<string, unknown>) => ({
    ...(instance ? { instance } : {}),
    devices_represented: devices,
    ...extra,
  });
  return [
    {
      id: `NODE_${componentId}${suffix}_JUNCTION`,
      name: 'Junction',
      power_W: power,
      component_ref: componentId,
      origin: { kind: 'template', component_id: componentId },
      metadata: meta({ component_power_linked: true }),
    },
    {
      id: `NODE_${componentId}${suffix}_TIM`,
      name: 'TIM',
      power_W: 0,
      component_ref: componentId,
      origin: { kind: 'template', component_id: componentId },
      metadata: meta({}),
    },
  ] as unknown as ThermalNode[];
}

function networkOf(...nodes: ThermalNode[]): ThermalNetwork {
  return {
    id: 'NET',
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    edges: {},
  } as unknown as ThermalNetwork;
}

describe('a part with several identical devices', () => {
  const pa = component('CMP_PA', 'GTRB384608FC', 4);
  const network = networkOf(
    ...chain('CMP_PA', '1', 52.99),
    ...chain('CMP_PA', '2', 52.99),
    ...chain('CMP_PA', '3', 52.99),
    ...chain('CMP_PA', '4', 52.99),
  );

  it('gets one page, not four', () => {
    expect(componentGraphPages(network, [pa])).toHaveLength(1);
  });

  it('draws the first instance and hides its siblings', () => {
    const [page] = componentGraphPages(network, [pa]);

    expect(page.instance).toBe('1');
    expect([...page.hidden_node_ids].sort()).toEqual([
      'NODE_CMP_PA_2_JUNCTION',
      'NODE_CMP_PA_2_TIM',
      'NODE_CMP_PA_3_JUNCTION',
      'NODE_CMP_PA_3_TIM',
      'NODE_CMP_PA_4_JUNCTION',
      'NODE_CMP_PA_4_TIM',
    ]);
  });

  /** Nothing of instance 1 may be hidden, or the page draws an empty chain. */
  it('keeps every node of the instance it draws', () => {
    const [page] = componentGraphPages(network, [pa]);

    expect(page.hidden_node_ids.has('NODE_CMP_PA_1_JUNCTION')).toBe(false);
    expect(page.hidden_node_ids.has('NODE_CMP_PA_1_TIM')).toBe(false);
  });

  it('says how many it stands for', () => {
    const [page] = componentGraphPages(network, [pa]);

    expect(page.represents_instances).toBe(4);
    expect(pageTitle(page)).toBe('GTRB384608FC · 53.0 W · 1 of 4 identical');
  });

  /** Instance order is numeric: 10 must not sort before 2. */
  it('picks instance 1 even when the ids sort as text', () => {
    const many = networkOf(
      ...chain('CMP_PA', '10', 52.99),
      ...chain('CMP_PA', '2', 52.99),
      ...chain('CMP_PA', '1', 52.99),
    );

    expect(componentGraphPages(many, [pa])[0].instance).toBe('1');
  });
});

describe('a part whose devices differ', () => {
  /** Two instances at different power are two different chains. */
  it('gets a page for each distinct power', () => {
    const mixed = component('CMP_MIX', 'Mixed', 2);
    const network = networkOf(...chain('CMP_MIX', '1', 10), ...chain('CMP_MIX', '2', 4));

    const pages = componentGraphPages(network, [mixed]);

    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.power_W)).toEqual([10, 4]);
    expect(pages.every((page) => page.represents_instances === 1)).toBe(true);
  });

  /**
   * A GROUPED split: eight devices as 5 + 3. Same per-device power, different
   * device counts, so the two chains carry different total heat.
   */
  it('separates instances standing for different device counts', () => {
    const grouped = component('CMP_G', 'Grouped', 8);
    const network = networkOf(
      ...chain('CMP_G', 'G1', 4, 5),
      ...chain('CMP_G', 'G2', 4, 3),
    );

    const pages = componentGraphPages(network, [grouped]);

    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.devices)).toEqual([5, 3]);
  });
});

describe('a part modelled as one chain', () => {
  it('gets one page with no instance', () => {
    const fpga = component('CMP_FPGA', 'XCZU67DR');
    const network = networkOf(...chain('CMP_FPGA', null, 35));

    const [page] = componentGraphPages(network, [fpga]);

    expect(page.instance).toBeNull();
    expect(page.hidden_node_ids.size).toBe(0);
    expect(pageTitle(page)).toBe('XCZU67DR · 35.0 W');
  });
});

describe('what gets no page at all', () => {
  it('skips a component the graph does not model', () => {
    const missing = component('CMP_NONE', 'Not modelled');

    expect(componentGraphPages(networkOf(), [missing])).toEqual([]);
  });

  it('skips a component that has been switched off', () => {
    const off = { ...component('CMP_PA', 'GTRB384608FC'), enabled: false };
    const network = networkOf(...chain('CMP_PA', null, 53));

    expect(componentGraphPages(network, [off])).toEqual([]);
  });

  it('skips a disabled node when choosing the instance to draw', () => {
    const pa = component('CMP_PA', 'GTRB384608FC', 2);
    const nodes = [...chain('CMP_PA', '1', 53), ...chain('CMP_PA', '2', 53)];
    const network = networkOf(
      ...nodes.map((node) =>
        node.id.startsWith('NODE_CMP_PA_1') ? ({ ...node, disabled: true } as ThermalNode) : node,
      ),
    );

    expect(componentGraphPages(network, [pa])[0].instance).toBe('2');
  });
});

describe('what each page hides', () => {
  const pa = component('CMP_PA', 'PA', 2);
  const fpga = component('CMP_FPGA', 'FPGA');
  const network = networkOf(
    ...chain('CMP_PA', '1', 53),
    ...chain('CMP_PA', '2', 53),
    ...chain('CMP_FPGA', null, 35),
  );

  it('hides every other component, so the page is about one part', () => {
    const [paPage, fpgaPage] = componentGraphPages(network, [pa, fpga]);

    expect([...paPage.hidden_component_ids]).toEqual(['CMP_FPGA']);
    expect([...fpgaPage.hidden_component_ids]).toEqual(['CMP_PA']);
  });

  /** Shared structure has no component behind it and must survive every page. */
  it('never hides the part the page is about', () => {
    for (const page of componentGraphPages(network, [pa, fpga])) {
      expect(page.hidden_component_ids.has(page.component_id), page.component_name).toBe(false);
    }
  });

  it('follows Screen 04 order', () => {
    expect(componentGraphPages(network, [fpga, pa]).map((page) => page.component_name)).toEqual([
      'FPGA',
      'PA',
    ]);
  });
});
