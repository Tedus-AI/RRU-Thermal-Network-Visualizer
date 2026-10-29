/**
 * Screen 04 isometric solids: the renderer the 3D stack and the path/mount tile icons share.
 *
 * Drawn the way the anatomy kit draws a solid, in each layer's own colour: every side facet takes
 * one of four tones by how it turns toward a light at the viewer's left (so the shading holds while
 * the stack is dragged round), the top is a little lighter, a crease and a bevel run along the
 * visible top edge, and the solid has ONE silhouette — the `.sh` outline the 3D view's hover and
 * highlight styles restyle — instead of an outline per face.
 */

import { Fragment, type ReactNode } from 'react';

export type Pt = [number, number];

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
const r1 = (value: number) => Number(value.toFixed(1));

/** Convex hull of screen points (monotone chain): a prism's silhouette. */
export function hull(points: Pt[]): Pt[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const SIDE_DARK = [0.34, 0.25, 0.17, 0.1];

export interface PrismOptions {
  faded?: boolean;
  key?: string;
  /** The top ring inset by the bevel, with as many points as the ring: draws the bevel highlight. */
  inner?: Pt[];
  /** A stroke for the silhouette, where no `.sh` style reaches (the tile icons). */
  edge?: string;
}

/** The solid helpers for one camera: `P` projects world (x, y, z) and the azimuth is `atan2(sinA, cosA)`. */
export function solidKit(P: (x: number, y: number, z: number) => Pt, sinA: number, cosA: number) {
  const toward: Pt = [sinA, cosA];
  const pathD = (pts: Pt[], close = true) => pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join('') + (close ? 'Z' : '');
  const rounded = (x0: number, x1: number, y0: number, y1: number, r: number): Pt[] => {
    const rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
    if (!(rr > 0.05)) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const corners: Array<[number, number, number]> = [
      [x1 - rr, y0 + rr, -Math.PI / 2],
      [x1 - rr, y1 - rr, 0],
      [x0 + rr, y1 - rr, Math.PI / 2],
      [x0 + rr, y0 + rr, Math.PI],
    ];
    return corners.flatMap(([cx, cy, a0]) =>
      [0, 1, 2, 3, 4].map((i): Pt => [cx + rr * Math.cos(a0 + (i * Math.PI) / 8), cy + rr * Math.sin(a0 + (i * Math.PI) / 8)]),
    );
  };
  const circle = (cx: number, cy: number, r: number, n = 18): Pt[] =>
    Array.from({ length: n }, (_, i): Pt => [cx + r * Math.cos((i * 2 * Math.PI) / n), cy + r * Math.sin((i * 2 * Math.PI) / n)]);
  /** Which edges of a ring face the viewer (their outward normal points toward them). */
  const facing = (ring: Pt[]) =>
    ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      return (b[1] - a[1]) * toward[0] - (b[0] - a[0]) * toward[1] > 1e-3;
    });
  /** Polylines along the ring edges flagged visible, at height `zz`. */
  const runs = (ring: Pt[], visible: boolean[], zz: number) => {
    const n = ring.length;
    const start = visible.findIndex((v, i) => v && !visible[(i + n - 1) % n]);
    if (start < 0) return '';
    let d = '';
    let run: Pt[] = [];
    for (let step = 0; step <= n; step++) {
      const i = (start + step) % n;
      if (visible[i] && step < n) {
        if (!run.length) run.push(P(ring[i][0], ring[i][1], zz));
        run.push(P(ring[(i + 1) % n][0], ring[(i + 1) % n][1], zz));
      } else if (run.length) {
        d += pathD(run, false);
        run = [];
      }
    }
    return d;
  };
  const prism = (ring: Pt[], z0: number, z1: number, fill: string, o: PrismOptions = {}): ReactNode => {
    const n = ring.length;
    const visible = facing(ring);
    const tones: string[][] = [[], [], [], []];
    for (let i = 0; i < n; i++) {
      if (!visible[i]) continue;
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = (b[1] - a[1]) / len;
      const ny = -(b[0] - a[0]) / len;
      const lit = -(nx * cosA - ny * sinA);
      tones[clamp(Math.floor(((lit + 1) / 2) * 4), 0, 3)].push(
        pathD([P(a[0], a[1], z0), P(b[0], b[1], z0), P(b[0], b[1], z1), P(a[0], a[1], z1)]),
      );
    }
    const silhouette = pathD(hull([...ring.map((p) => P(p[0], p[1], z0)), ...ring.map((p) => P(p[0], p[1], z1))]));
    const crease = runs(ring, visible, z1);
    const bevel = o.inner && o.inner.length === n ? runs(o.inner, visible, z1) : '';
    const body = (
      <>
        <path d={silhouette} fill={fill} />
        {tones.map((list, k) => (list.length ? <path key={k} d={list.join('')} fill="#000" opacity={SIDE_DARK[k]} /> : null))}
        <path d={pathD(ring.map((p) => P(p[0], p[1], z1)))} fill="#fff" opacity={0.08} />
        {crease && <path d={crease} fill="none" stroke="#0f1b30" strokeOpacity={0.3} strokeWidth={0.7} />}
        {bevel && <path d={bevel} fill="none" stroke="#fff" strokeOpacity={0.8} strokeWidth={0.9} strokeLinecap="round" />}
        <path className="sh" d={silhouette} fill="none" stroke={o.edge} strokeWidth={o.edge ? 0.8 : undefined} strokeLinejoin="round" />
      </>
    );
    return o.faded ? (
      <g key={o.key} opacity={0.5}>
        {body}
      </g>
    ) : (
      <Fragment key={o.key}>{body}</Fragment>
    );
  };
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, fill: string, faded = false, key?: string, r = 0, edge?: string) => {
    const b = Math.min(1.4, (x1 - x0) / 6, (y1 - y0) / 6, (z1 - z0) / 2);
    const inner = b > 0.3 ? rounded(x0 + b, x1 - b, y0 + b, y1 - b, r > 0.05 ? Math.max(r - b, 0.06) : 0) : undefined;
    return prism(rounded(x0, x1, y0, y1, r), z0, z1, fill, { faded, key, inner, edge });
  };
  /** The corner radius a layer of this size gets. */
  const radiusOf = (L: number, W: number) => clamp(Math.min(L, W) * 0.05, 0.8, 5);
  return { toward, pathD, rounded, circle, facing, runs, prism, box, radiusOf };
}
