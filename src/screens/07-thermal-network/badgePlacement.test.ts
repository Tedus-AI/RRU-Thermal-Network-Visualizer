/**
 * Where a segment's rank badge lands.
 *
 * The badge used to sit a fixed 36 px above the midpoint of the straight line
 * between the segment's two nodes. A heat pipe and a spreading path between the
 * same TIM and the same base share both nodes, so their two badges landed on
 * one point — on top of the heat pipe's own label, since the branches bow apart
 * and the straight line runs between them. What is asserted here is the
 * reader's complaint turned round: two badges never on each other, never on any
 * text, and each on the side of the branch it numbers.
 */

import { describe, expect, it } from 'vitest';

import {
  BADGE_CLEARANCE_PX,
  BADGE_LIFT_PX,
  BADGE_RADIUS_PX,
  badgeTouches,
  placeEdgeBadges,
  type Box,
  type EdgeBadgeRequest,
} from './badgePlacement';

/** A label box of `w` × `h` centred on (x, y). */
const box = (x: number, y: number, w: number, h: number): Box => ({
  x1: x - w / 2,
  y1: y - h / 2,
  x2: x + w / 2,
  y2: y + h / 2,
});

const FROM = { x: 0, y: 0 };
const TO = { x: 160, y: 0 };

/** Two boxes, the gap between them about what dagre leaves on Screen 08. */
const NODES = [box(-35, 0, 70, 34), box(195, 0, 70, 34)];

/**
 * The pair as Cytoscape draws it, level: each branch bowed 11 px off the
 * straight line, each label 14 px further out on its own side, and the brace
 * naming both under them.
 */
function pair(braceLabelAt = 86) {
  const pipeLabel = box(80, -25, 70, 15);
  const spreadingLabel = box(80, 25, 60, 15);
  const braceLabel = box(80, braceLabelAt, 120, 28);
  const requests: EdgeBadgeRequest[] = [
    // Ranked 4: the spreading branch, drawn under the line.
    { id: 'SPREADING', mid: { x: 80, y: 11 }, from: FROM, to: TO, label: spreadingLabel },
    // Ranked 5: the heat pipe, drawn over it.
    { id: 'PIPE', mid: { x: 80, y: -11 }, from: FROM, to: TO, label: pipeLabel },
  ];
  return { requests, labels: [pipeLabel, spreadingLabel, braceLabel] };
}

function expectApart(a: { x: number; y: number }, b: { x: number; y: number }) {
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
    2 * BADGE_RADIUS_PX + BADGE_CLEARANCE_PX - 0.5,
  );
}

describe('an ordinary segment', () => {
  it('sits where it always did: centred over its own label, 36 px above the line', () => {
    const label = box(80, -11, 40, 15);
    const at = placeEdgeBadges(
      [{ id: 'E', mid: { x: 80, y: 0 }, from: FROM, to: TO, label }],
      [...NODES, label],
    ).get('E');

    expect(at?.x).toBeCloseTo(80, 6);
    // 35.5: half a pixel short of the old lift, from the label's own box.
    expect(Math.abs(at!.y + BADGE_LIFT_PX)).toBeLessThanOrEqual(1);
    expect(badgeTouches(at!, label)).toBe(false);
  });

  it('with labels off, sits the same lift above the line', () => {
    const at = placeEdgeBadges(
      [{ id: 'E', mid: { x: 80, y: 0 }, from: FROM, to: TO, label: null }],
      NODES,
    ).get('E');

    expect(at).toEqual({ x: 80, y: -BADGE_LIFT_PX });
  });
});

describe('a heat pipe and a spreading path between the same two parts', () => {
  it('gives the two badges two places, neither on the other', () => {
    const { requests, labels } = pair();
    const placed = placeEdgeBadges(requests, [...NODES, ...labels]);
    const pipe = placed.get('PIPE')!;
    const spreading = placed.get('SPREADING')!;

    expectApart(pipe, spreading);
  });

  it('covers no text — either label, or the brace that names both', () => {
    const { requests, labels } = pair();
    const placed = placeEdgeBadges(requests, [...NODES, ...labels]);

    for (const at of placed.values()) {
      for (const label of labels) expect(badgeTouches(at, label)).toBe(false);
      for (const node of NODES) expect(badgeTouches(at, node)).toBe(false);
    }
  });

  it('puts each badge beyond its own branch’s label, on that branch’s side', () => {
    const { requests, labels } = pair();
    const placed = placeEdgeBadges(requests, [...NODES, ...labels]);
    const [pipeLabel, spreadingLabel] = labels;

    // Over the pipe's label, under the spreading label — so which number is
    // which branch is read off the picture, not off the list beside it.
    expect(placed.get('PIPE')!.y).toBeLessThan(pipeLabel.y1);
    expect(placed.get('SPREADING')!.y).toBeGreaterThan(spreadingLabel.y2);
    expect(placed.get('PIPE')!.x).toBeCloseTo(80, 6);
    expect(placed.get('SPREADING')!.x).toBeCloseTo(80, 6);
  });

  /**
   * Without the brace bowing out of the way, the gap under the spreading
   * label is a few pixels — the badge still may not land on the brace's text.
   */
  it('moves clear of the brace when the brace leaves it no room', () => {
    const { requests, labels } = pair(52);
    const placed = placeEdgeBadges(requests, [...NODES, ...labels]);
    const spreading = placed.get('SPREADING')!;

    for (const label of labels) expect(badgeTouches(spreading, label)).toBe(false);
    expect(spreading.y).toBeGreaterThan(0);
    expectApart(spreading, placed.get('PIPE')!);
  });
});

describe('badges competing for one spot', () => {
  it('lets the lower rank keep its spot and moves the next one', () => {
    const label = box(80, -11, 40, 15);
    const request = { mid: { x: 80, y: 0 }, from: FROM, to: TO, label };
    const placed = placeEdgeBadges(
      [
        { id: 'FIRST', ...request },
        { id: 'SECOND', ...request },
      ],
      [...NODES, label],
    );

    expect(Math.abs(placed.get('FIRST')!.y + BADGE_LIFT_PX)).toBeLessThanOrEqual(1);
    expectApart(placed.get('FIRST')!, placed.get('SECOND')!);
    expect(badgeTouches(placed.get('SECOND')!, label)).toBe(false);
  });

  it('keeps clear of a badge already fixed beside a part', () => {
    const label = box(80, -11, 40, 15);
    const fixed = { x: 80, y: -36 };
    const at = placeEdgeBadges(
      [{ id: 'E', mid: { x: 80, y: 0 }, from: FROM, to: TO, label }],
      [...NODES, label],
      [fixed],
    ).get('E')!;

    expectApart(at, fixed);
    expect(badgeTouches(at, label)).toBe(false);
  });
});
