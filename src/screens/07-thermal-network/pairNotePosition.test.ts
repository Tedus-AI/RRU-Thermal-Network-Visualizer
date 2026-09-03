/**
 * Where the combination note for a bus-less parallel pair actually lands.
 *
 * The note itself was already being built — filtering the graph down to one
 * component dissolves the bus (a bar forms at four branches or more), so the
 * pair is read from the node pair instead. But it was positioned ONCE, from
 * `network.layout.positions`: the last SAVED coordinates. Every Auto relayout
 * recomputes the graph without writing those back, so the note stayed where the
 * nodes used to be — far outside the picture, and indistinguishable from never
 * having been drawn. Which is exactly how it was reported.
 *
 * So the fix is not "build the note", it is "keep putting it back", and that is
 * what this test holds: after a layout has moved the pair, the note is at the
 * new midpoint, not the old one.
 */

import cytoscape from 'cytoscape';
import { describe, expect, it } from 'vitest';

import { positionViewBuses } from '@/screens/05-thermal-path-builder/busLayout';

/**
 * The FPGA's two routes to the base, and the note that combines them.
 *
 * Added with `cy.add` rather than the constructor's `elements`, because a
 * headless instance silently drops the positions given that way — every node
 * would start at the origin and the test would pass without proving anything.
 */
function graph() {
  const cy = cytoscape({ headless: true, styleEnabled: false });
  cy.add([
    { group: 'nodes', data: { id: 'TIM' }, position: { x: 0, y: 0 } },
    { group: 'nodes', data: { id: 'BASE' }, position: { x: 400, y: 0 } },
    {
      group: 'nodes',
      data: { id: 'NOTE', pairFrom: 'TIM', pairTo: 'BASE', label: '∥ 0.054 °C/W' },
      classes: 'view-only hsk-bus-parallel-note',
      // The stale coordinate: where the pair sat when the project was saved.
      position: { x: -900, y: -700 },
    },
  ]);
  return cy;
}

describe('the parallel note on a graph with no bus', () => {
  it('is put beside the midpoint of the pair as it stands now', () => {
    const cy = graph();

    positionViewBuses(cy);

    // Midway along, and off the axis: the bare midpoint is where the lower
    // branch's own label sits, so the combination landed on top of it.
    expect(cy.getElementById('NOTE').position()).toEqual({ x: 200, y: 48 });
  });

  it('follows the pair when a relayout moves it, and turns with it', () => {
    const cy = graph();
    positionViewBuses(cy);

    // A top-to-bottom pair: the clearance has to move to the other axis, or it
    // would slide the note ALONG the pair rather than off it.
    cy.getElementById('TIM').position({ x: 100, y: 300 });
    cy.getElementById('BASE').position({ x: 100, y: 700 });
    positionViewBuses(cy);

    expect(cy.getElementById('NOTE').position()).toEqual({ x: 148, y: 500 });
  });

  /** A note whose pair was filtered away must not be dragged to the origin. */
  it('leaves a note alone when its pair is not on the graph', () => {
    const cy = graph();
    cy.getElementById('BASE').remove();

    positionViewBuses(cy);

    expect(cy.getElementById('NOTE').position()).toEqual({ x: -900, y: -700 });
  });

  /** Notes that ride a bar are still the bar's business, not this pass's. */
  it('does not touch a note that belongs to a bus', () => {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add({
      group: 'nodes',
      data: { id: 'NOTE', busId: 'BUS_1', sourceId: 'TIM' },
      classes: 'view-only hsk-bus-parallel-note',
      position: { x: 42, y: 7 },
    });

    positionViewBuses(cy);

    expect(cy.getElementById('NOTE').position()).toEqual({ x: 42, y: 7 });
  });
});
