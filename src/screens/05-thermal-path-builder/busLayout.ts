/**
 * Placing the view-only HSK bus against the positions a layout actually produced.
 *
 * The element builder writes the bar, its junctions and its outlet from the
 * STORED coordinates, which is right for the first paint and wrong the moment
 * dagre moves anything. This re-derives the same geometry from live Cytoscape
 * positions — using the same `busGeometry` — so the bar does not jump between
 * the two answers.
 *
 * Shared by Screen 05's editable canvas and Screen 07's solved one: the bus is
 * the same picture on both, and two copies of this would drift.
 */

import type { Core, NodeSingular } from 'cytoscape';

import { busGeometry, parallelBusRankShift } from './thermalGraphElements';

/**
 * Dagre knows nothing about the view-only bus labels, so its normal rank gap
 * can be shorter than a two-line Spreading / Heat Pipe annotation. On an
 * explicit Auto Layout only, move the HSK base rank and everything after it
 * just far enough to give the longest parallel label its requested room.
 */
function ensureParallelBusLabelRoom(cy: Core) {
  cy.nodes('.hsk-bus').forEach((bus) => {
    const labels = cy.nodes('.hsk-bus-parallel-label').filter(
      (label) => label.data('busId') === bus.id(),
    );
    if (labels.length === 0) return;

    const axis = (bus.data('axis') as 'vertical' | 'horizontal' | null) ?? 'vertical';
    const vertical = axis === 'vertical';
    const flow = vertical ? 'x' : 'y';
    const shared = cy.getElementById(bus.data('sharedId') as string);
    if (!shared.isNode()) return;

    const sources: NodeSingular[] = [];
    cy.nodes('.hsk-bus-branch-junction')
      .filter((junction) => junction.data('busId') === bus.id())
      .forEach((junction) => {
        const source = cy.getElementById(junction.data('sourceId') as string);
        if (source.isNode() && !sources.some((found) => found.id() === source.id())) {
          sources.push(source);
        }
      });
    if (sources.length === 0) return;

    const mean = sources.reduce((sum, source) => sum + source.position(flow), 0) / sources.length;
    const targetAfter = shared.position(flow) >= mean;
    const sourceFront = targetAfter
      ? Math.max(
          ...sources.map((source) =>
            vertical ? source.boundingBox().x2 : source.boundingBox().y2,
          ),
        )
      : Math.min(
          ...sources.map((source) =>
            vertical ? source.boundingBox().x1 : source.boundingBox().y1,
          ),
        );
    const sharedBox = shared.boundingBox();
    const targetFront = targetAfter
      ? vertical
        ? sharedBox.x1
        : sharedBox.y1
      : vertical
        ? sharedBox.x2
        : sharedBox.y2;
    let requiredBranchRoom = 0;
    labels.forEach((label) => {
      requiredBranchRoom = Math.max(
        requiredBranchRoom,
        (label.data('requiredFlowRoom') as number | undefined) ?? 0,
      );
    });
    const shift = parallelBusRankShift(sourceFront, targetFront, requiredBranchRoom);
    if (shift < 0.5) return;

    const sharedFlow = shared.position(flow);
    const signedShift = targetAfter ? shift : -shift;
    cy.nodes()
      .filter((node) => {
        if (node.hasClass('view-only')) return false;
        const value = node.position(flow);
        return targetAfter ? value >= sharedFlow - 0.5 : value <= sharedFlow + 0.5;
      })
      .forEach((node) => {
        node.position(flow, node.position(flow) + signedShift);
      });
  });
}

export function positionViewBuses(cy: Core, ensureParallelRoom = false) {
  if (ensureParallelRoom) ensureParallelBusLabelRoom(cy);
  cy.nodes('.hsk-bus').forEach((bus) => {
    const axis = (bus.data('axis') as 'vertical' | 'horizontal' | null) ?? 'vertical';
    const shared = cy.getElementById(bus.data('sharedId') as string);
    if (shared.length === 0) return;
    const junctions = cy.nodes('.hsk-bus-branch-junction').filter(
      (junction) => junction.data('busId') === bus.id(),
    );
    if (junctions.length === 0) return;

    const sourceEntries: Array<{ junction: NodeSingular; source: NodeSingular }> = [];
    junctions.forEach((junction) => {
      const source = cy.getElementById(junction.data('sourceId') as string);
      if (source.isNode()) sourceEntries.push({ junction, source });
    });
    if (sourceEntries.length === 0) return;
    const outlet = cy.getElementById(bus.data('outletId') as string);
    if (!outlet.isNode()) return;

    const vertical = axis === 'vertical';
    const flow = vertical ? 'x' : 'y';
    const sharedBox = shared.boundingBox();
    const mean =
      sourceEntries.reduce((sum, entry) => sum + entry.source.position(flow), 0) /
      sourceEntries.length;
    const targetAfter = shared.position(flow) >= mean;

    const boxFar = (entry: { source: NodeSingular }) =>
      vertical ? entry.source.boundingBox().x2 : entry.source.boundingBox().y2;
    const boxNear = (entry: { source: NodeSingular }) =>
      vertical ? entry.source.boundingBox().x1 : entry.source.boundingBox().y1;

    const sourceFront = targetAfter
      ? Math.max(...sourceEntries.map(boxFar))
      : Math.min(...sourceEntries.map(boxNear));
    const targetFront = targetAfter
      ? vertical
        ? sharedBox.x1
        : sharedBox.y1
      : vertical
        ? sharedBox.x2
        : sharedBox.y2;

    const geometry = busGeometry(
      axis,
      { x: shared.position('x'), y: shared.position('y') },
      sourceEntries.map((entry) => ({
        x: entry.source.position('x'),
        y: entry.source.position('y'),
      })),
      sourceEntries.length,
      { sourceFront, targetFront },
    );
    if (geometry.along == null || !geometry.position || !geometry.outletPosition) return;

    bus.data('w', geometry.w);
    bus.data('h', geometry.h);
    bus.position(geometry.position);
    outlet.position(geometry.outletPosition);
    sourceEntries.forEach(({ junction, source }) => {
      // The fan the element builder computed has to survive this pass, or two
      // branches from one terminal snap back on top of each other the moment a
      // layout runs.
      const offset = (junction.data('crossOffset') as number | undefined) ?? 0;
      junction.position(
        vertical
          ? { x: geometry.along!, y: source.position('y') + offset }
          : { x: source.position('x') + offset, y: geometry.along! },
      );
    });

    // Parallel branches keep the original straight fan. Put each label at the
    // midpoint of the VISIBLE segment (source box edge to bus), not midway from
    // the node centre; after Auto Layout adds room this keeps the full label
    // clear of both the terminal and the junction bar.
    cy.nodes('.hsk-bus-parallel-label')
      .filter((label) => label.data('busId') === bus.id())
      .forEach((label) => {
        const source = cy.getElementById(label.data('sourceId') as string);
        if (!source.isNode()) return;
        const offset = (label.data('crossOffset') as number | undefined) ?? 0;
        const sourceBox = source.boundingBox();
        const sourceFront = targetAfter
          ? vertical
            ? sourceBox.x2
            : sourceBox.y2
          : vertical
            ? sourceBox.x1
            : sourceBox.y1;
        const labelFlow = (sourceFront + geometry.along!) / 2;
        const sourceCentre = source.position(flow);
        const denominator = geometry.along! - sourceCentre;
        const fraction = denominator === 0 ? 0.5 : (labelFlow - sourceCentre) / denominator;
        label.position(
          vertical
            ? {
                x: labelFlow,
                y: source.position('y') + offset * fraction,
              }
            : {
                x: source.position('x') + offset * fraction,
                y: labelFlow,
              },
        );
      });

    // The parallel note rides on the bar at its terminal's own level — between
    // the fanned branches, which is what makes it read as their combination.
    // It is placed separately from the junctions above because it is not a
    // branch: counting it as one would skew the bar's span and centre.
    cy.nodes('.hsk-bus-parallel-note')
      .filter((note) => note.data('busId') === bus.id())
      .forEach((note) => {
        const source = cy.getElementById(note.data('sourceId') as string);
        if (!source.isNode()) return;
        note.position(
          vertical
            ? { x: geometry.along!, y: source.position('y') }
            : { x: source.position('x'), y: geometry.along! },
        );
      });
  });
}
