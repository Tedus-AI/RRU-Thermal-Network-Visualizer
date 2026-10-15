/**
 * Where a segment's rank badge goes, worked out from what is actually drawn.
 *
 * The badge used to sit a fixed 36 px above the midpoint of the straight line
 * between the segment's two nodes. That is right for one straight edge with its
 * label above it, and wrong for the case Screen 08 is asked about most: a heat
 * pipe and a spreading path between the same TIM and the same base. The two
 * branches share both nodes, so both badges landed on ONE point — and since the
 * branches bow apart and the straight line runs between them, that point was on
 * the upper branch's label.
 *
 * So a badge now starts from its edge's own label, where Cytoscape drew it on
 * the edge's own curve, and sits just beyond it on the side the label went:
 * above an ordinary edge (the old position, to the pixel), above the upper
 * branch of a pair and below the lower one. It is then checked against every
 * piece of text and every box on the picture, and against the badges already
 * placed, and moved out until it touches none of them.
 *
 * Pure geometry, no Cytoscape: the canvas measures, this decides.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface EdgeBadgeRequest {
  id: string;
  /** The edge's midpoint as drawn — on its curve, not between its nodes. */
  mid: Point;
  /** The two nodes' centres: the straight line a curved edge bows away from. */
  from: Point;
  to: Point;
  /** The edge's own label as drawn, or null when it shows none. */
  label: Box | null;
}

/** Half the badge's 20 px. */
export const BADGE_RADIUS_PX = 10;

/**
 * Air between a badge's rim and any text or box.
 *
 * The halo on a cut segment breathes out to 6 px; closer than that and it
 * lands on the ΔT text, and the two read as one smudged glyph.
 */
export const BADGE_CLEARANCE_PX = 7;

/**
 * How far above an unlabelled edge a badge sits — where a labelled one ends up:
 * 11 for the label's offset, half its ~15 px box, the clearance and the radius.
 */
export const BADGE_LIFT_PX = 36;

/** The room one badge takes across, clearance either side included. */
export const BADGE_ROOM_PX = 2 * (BADGE_RADIUS_PX + BADGE_CLEARANCE_PX);

/** How far a blocked badge is moved out per try, and how far at most. */
const PUSH_STEP_PX = 6;
const MAX_PUSH_PX = 120;

/** Centre to centre for two badges side by side. */
const SIDE_STEP_PX = 2 * BADGE_RADIUS_PX + BADGE_CLEARANCE_PX;

/** Touching is allowed; overlapping by more than rounding is not. */
const EPSILON_PX = 0.5;

/**
 * One position per request, in request order — so the lower rank gets the
 * spot it wanted and a later badge is the one that moves.
 *
 * `placed` are badges already fixed (those anchored to a part); a segment's
 * badge keeps clear of them as it does of another segment's.
 */
export function placeEdgeBadges(
  requests: readonly EdgeBadgeRequest[],
  obstacles: readonly Box[],
  placed: readonly Point[] = [],
): Map<string, Point> {
  const result = new Map<string, Point>();
  const badges: Point[] = [...placed];

  for (const request of requests) {
    const { normal, start } = preferredSpot(request);
    const tangent = { x: -normal.y, y: normal.x };
    let chosen: Point | null = null;

    // Further out along the side its label went, first straight out and then
    // a badge's width either side — never back towards its own edge.
    search: for (let push = 0; push <= MAX_PUSH_PX; push += PUSH_STEP_PX) {
      for (const side of [0, 1, -1, 2, -2]) {
        const candidate = {
          x: start.x + normal.x * push + tangent.x * side * SIDE_STEP_PX,
          y: start.y + normal.y * push + tangent.y * side * SIDE_STEP_PX,
        };
        if (isClear(candidate, obstacles, badges)) {
          chosen = candidate;
          break search;
        }
      }
    }

    // Nowhere clear within reach: the spot it wanted, which is still beside
    // its own label rather than on it.
    const at = chosen ?? start;
    result.set(request.id, at);
    badges.push(at);
  }

  return result;
}

/** Just beyond the edge's own label, on the side the label sits. */
function preferredSpot(request: EdgeBadgeRequest): { normal: Point; start: Point } {
  const { label, mid } = request;
  if (label) {
    const centre = { x: (label.x1 + label.x2) / 2, y: (label.y1 + label.y2) / 2 };
    const normal =
      unit({ x: centre.x - mid.x, y: centre.y - mid.y }) ?? bulge(request) ?? upward(request);
    // From the label's centre to its edge, measured along the way out.
    const reach =
      (Math.abs(normal.x) * (label.x2 - label.x1)) / 2 +
      (Math.abs(normal.y) * (label.y2 - label.y1)) / 2;
    const out = reach + BADGE_CLEARANCE_PX + BADGE_RADIUS_PX;
    return { normal, start: { x: centre.x + normal.x * out, y: centre.y + normal.y * out } };
  }
  const normal = bulge(request) ?? upward(request);
  return {
    normal,
    start: { x: mid.x + normal.x * BADGE_LIFT_PX, y: mid.y + normal.y * BADGE_LIFT_PX },
  };
}

/** The way a curved edge bows away from the straight line; null if it is straight. */
function bulge({ mid, from, to }: EdgeBadgeRequest): Point | null {
  return unit({ x: mid.x - (from.x + to.x) / 2, y: mid.y - (from.y + to.y) / 2 });
}

/** Square to the edge, on the upper side — straight up for a level edge. */
function upward({ from, to }: EdgeBadgeRequest): Point {
  const along = unit({ x: to.x - from.x, y: to.y - from.y }) ?? { x: 1, y: 0 };
  const normal = { x: along.y, y: -along.x };
  if (normal.y > 1e-9 || (Math.abs(normal.y) <= 1e-9 && normal.x > 0)) {
    return { x: -normal.x, y: -normal.y };
  }
  return normal;
}

function unit(vector: Point): Point | null {
  const length = Math.hypot(vector.x, vector.y);
  return length > EPSILON_PX ? { x: vector.x / length, y: vector.y / length } : null;
}

function isClear(at: Point, obstacles: readonly Box[], badges: readonly Point[]): boolean {
  const reach = BADGE_RADIUS_PX + BADGE_CLEARANCE_PX - EPSILON_PX;
  for (const box of obstacles) {
    if (distanceToBox(at, box) < reach) return false;
  }
  const apart = 2 * BADGE_RADIUS_PX + BADGE_CLEARANCE_PX - EPSILON_PX;
  return badges.every((badge) => Math.hypot(badge.x - at.x, badge.y - at.y) >= apart);
}

/** Zero inside the box. */
export function distanceToBox(at: Point, box: Box): number {
  const dx = Math.max(box.x1 - at.x, 0, at.x - box.x2);
  const dy = Math.max(box.y1 - at.y, 0, at.y - box.y2);
  return Math.hypot(dx, dy);
}

/** True when a badge at `at` sits on the box or within its clearance. */
export function badgeTouches(at: Point, box: Box): boolean {
  return distanceToBox(at, box) < BADGE_RADIUS_PX + BADGE_CLEARANCE_PX - EPSILON_PX;
}
