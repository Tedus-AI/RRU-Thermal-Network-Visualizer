/**
 * The heat sink on the fin-surface panel, drawn from the panel's own numbers.
 *
 * Upright, as an RRU hangs: the base's L runs vertically, the fins stand out of
 * the base and air rises through the channels — the h fit is still air over
 * vertical fins (`finArray.ts`). The solid is 03's renderer (`isoSolid.tsx`) in
 * the heat path palette, so the base and the fins are the colours they are in
 * 03's stack. Beside it, a true-scale section through the top end carries the
 * numbers too small to read on the solid: the gap, the tip thickness, and on a
 * die-cast stack the root the draft thickens.
 *
 * Every dimension is a field's value; the fin count, the root thickness and the
 * tip's excess ratio are the fin result's. A field still empty draws dashed and
 * reads 未填 — the stand-in proportions it is drawn at are never shown as numbers.
 */

import { useId, type ReactNode } from 'react';

import { hull, solidKit, type Pt } from '@/screens/04-component-manager/isoSolid';
import '@/screens/04-component-manager/heatPath.css';
import { FIN_GEOMETRY_KEYS } from '@/thermal/boundary/calculations';
import type { FinArrayResult } from '@/thermal/boundary/finArray';

/** A dimension on the figure; the panel's fields light theirs up and back. */
export type HeatSinkDim = 'baseL' | 'baseW' | 'height' | 'gap' | 'thickness' | 'draft' | 'count';

/** Which dimension each fin field is. The k and the process factor have none. */
export const FIN_FIELD_DIM: Readonly<Record<string, HeatSinkDim>> = {
  [FIN_GEOMETRY_KEYS.baseLength]: 'baseL',
  [FIN_GEOMETRY_KEYS.baseWidth]: 'baseW',
  [FIN_GEOMETRY_KEYS.height]: 'height',
  [FIN_GEOMETRY_KEYS.gap]: 'gap',
  [FIN_GEOMETRY_KEYS.thickness]: 'thickness',
  [FIN_GEOMETRY_KEYS.draftAngle]: 'draft',
  [FIN_GEOMETRY_KEYS.countOverride]: 'count',
};

export interface HeatSinkGeometry {
  baseL_mm: number | null;
  baseW_mm: number | null;
  /** 01's base thickness: drawn, not dimensioned (it is not a field here). */
  baseT_mm: number | null;
  finHeight_mm: number | null;
  gap_mm: number | null;
  /** At the tip. */
  thickness_mm: number | null;
  /** The draft the result used: 0 unless die-cast. */
  draft_deg: number;
}

const VW = 380;
const VH = 318;
/** Viewed from the left of the fin tips, so the fin faces it sees take the light. */
const AZ = (-35 * Math.PI) / 180;
const SIN = Math.sin(AZ);
const COS = Math.cos(AZ);
const ELEV = 0.866;
const SOLID = { x0: 40, x1: 212, y0: 46, y1: 276 };
const INSET = { x: 226, y: 30, w: 150, h: 250 };
/** Past this many fins the stack draws as one block: the count still reads, the paint does not stall. */
const MAX_DRAWN_FINS = 160;
const EDGE = 'rgba(15, 27, 48, 0.32)';

const pos = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const r1 = (value: number) => Number(value.toFixed(1));
const fmt = (value: number) => String(Number(value.toFixed(2)));
const textW = (text: string, size: number) =>
  [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? size : size * 0.6), 0);

export function HeatSinkFigure({
  geometry: g,
  result,
  highlight,
  onHighlight,
}: {
  geometry: HeatSinkGeometry;
  result: FinArrayResult | null;
  highlight: HeatSinkDim | null;
  onHighlight: (dim: HeatSinkDim | null) => void;
}) {
  const uid = useId().replace(/:/g, '');
  const ids = { arr: `${uid}-arr`, arrHl: `${uid}-arrhl`, clip: `${uid}-clip` };

  const known = {
    L: pos(g.baseL_mm),
    W: pos(g.baseW_mm),
    FH: pos(g.finHeight_mm),
    gap: pos(g.gap_mm),
    t: pos(g.thickness_mm),
  };
  const fins = known.L && known.W && known.FH && known.gap && known.t && result != null;
  // Stand-ins for what is missing: drawn dashed, never labelled with a number.
  const W = pos(g.baseW_mm) ? g.baseW_mm : pos(g.baseL_mm) ? g.baseL_mm / 1.22 : 275;
  const L = pos(g.baseL_mm) ? g.baseL_mm : W * 1.22;
  const FH = pos(g.finHeight_mm) ? g.finHeight_mm : W * 0.22;
  const tb = pos(g.baseT_mm) ? g.baseT_mm : Math.max(3, W * 0.025);
  const t = g.thickness_mm ?? 0;
  const gap = g.gap_mm ?? 0;
  const tr = result?.rootThickness_mm ?? t;
  const n = fins ? result.fin_count : 0;
  const pitch = t + gap;

  // Fins centred on the base; a count override that does not fit runs past its edges, as it would.
  const span = n * t + (n - 1) * gap;
  const overhang = fins ? Math.max(0, (span - W) / 2 + (tr - t) / 2) : 0;

  // Fit the upright envelope into the left of the figure.
  const raw = (x: number, y: number, z: number): Pt => [x * COS - y * SIN, (x * SIN + y * COS) * 0.5 - z * ELEV];
  const corners = [-overhang, W + overhang].flatMap((x) => [-tb, FH].flatMap((y) => [0, L].map((z) => raw(x, y, z))));
  const bx0 = Math.min(...corners.map((p) => p[0]));
  const bx1 = Math.max(...corners.map((p) => p[0]));
  const by0 = Math.min(...corners.map((p) => p[1]));
  const by1 = Math.max(...corners.map((p) => p[1]));
  const s = Math.min((SOLID.x1 - SOLID.x0) / (bx1 - bx0), (SOLID.y1 - SOLID.y0) / (by1 - by0));
  const ox = (SOLID.x0 + SOLID.x1) / 2 - (s * (bx0 + bx1)) / 2;
  const oy = (SOLID.y0 + SOLID.y1) / 2 - (s * (by0 + by1)) / 2;
  const P = (x: number, y: number, z: number): Pt => {
    const [px, py] = raw(x, y, z);
    return [ox + s * px, oy + s * py];
  };
  const { pathD, prism, box } = solidKit(P, SIN, COS);
  /** The screen outline of an upright block, for a dashed missing envelope. */
  const envelope = (y0: number, y1: number) =>
    pathD(hull([0, W].flatMap((x) => [y0, y1].flatMap((y) => [0, L].map((z) => P(x, y, z))))));

  // Drawn far to near: the viewer is on the x = 0 side.
  const centers = Array.from({ length: n }, (_, i) => (W - span) / 2 + t / 2 + i * pitch);
  const solid: ReactNode[] = [
    pos(g.baseL_mm) && pos(g.baseW_mm) ? (
      box(0, W, -tb, 0, 0, L, 'var(--hp-base)', false, 'base', 0.8, EDGE)
    ) : (
      <path key="base" d={envelope(-tb, 0)} className="miss-ol" fill="none" />
    ),
  ];
  if (!fins) {
    solid.push(<path key="fins" d={envelope(0, FH)} className="miss-ol" fill="rgba(224, 69, 63, 0.04)" />);
  } else if (n > MAX_DRAWN_FINS) {
    solid.push(box(centers[0] - t / 2, centers[n - 1] + t / 2, 0, FH, 0, L, 'var(--hp-fin)', false, 'fins', 0, EDGE));
  } else {
    for (const xc of [...centers].reverse()) {
      const ring: Pt[] = [
        [xc - tr / 2, 0],
        [xc + tr / 2, 0],
        [xc + t / 2, FH],
        [xc - t / 2, FH],
      ];
      solid.push(prism(ring, 0, L, 'var(--hp-fin)', { key: `f${xc}`, edge: EDGE }));
    }
  }
  // Rising air over three channels.
  const air: ReactNode[] = [];
  if (fins && n >= 2) {
    for (const f of [0.45, 0.63, 0.81]) {
      const k = Math.min(n - 2, Math.round(f * (n - 1)));
      const [x0, y0] = P((centers[k] + centers[k + 1]) / 2, FH * 0.55, L);
      air.push(
        <path
          key={f}
          className="air"
          d={`M${r1(x0)} ${r1(y0 - 6)}V${r1(y0 - 22)}M${r1(x0 - 3.5)} ${r1(y0 - 17.5)}L${r1(x0)} ${r1(y0 - 22)}L${r1(x0 + 3.5)} ${r1(y0 - 17.5)}`}
        />,
      );
    }
  }

  // --- dimensions --------------------------------------------------------
  const tag = (cx: number, cy: number, text: string, miss = false, anchor: 'mid' | 'left' | 'right' = 'mid') => {
    const tw = textW(text, 10.5) + 10;
    const x = anchor === 'mid' ? cx - tw / 2 : anchor === 'left' ? cx : cx - tw;
    return (
      <>
        <rect x={r1(x)} y={r1(cy - 8)} width={r1(tw)} height={15} rx={3.5} className={miss ? 'miss' : undefined} />
        <text x={r1(x + tw / 2)} y={r1(cy + 3.6)} textAnchor="middle" className={miss ? 'miss' : undefined}>
          {text}
        </text>
      </>
    );
  };
  const dim = (key: HeatSinkDim, children: ReactNode) => (
    <g
      key={key}
      className={highlight === key ? 'dm hl' : 'dm'}
      data-dim={key}
      onMouseEnter={() => onHighlight(key)}
      onMouseLeave={() => onHighlight(null)}
    >
      {children}
    </g>
  );
  const arrow = (key: HeatSinkDim) => `url(#${highlight === key ? ids.arrHl : ids.arr})`;
  const line = (key: HeatSinkDim, a: Pt, b: Pt) => (
    <line x1={r1(a[0])} y1={r1(a[1])} x2={r1(b[0])} y2={r1(b[1])} markerStart={arrow(key)} markerEnd={arrow(key)} />
  );
  /** Two arrows pointing in from outside, for a span too thin to hold them. */
  const inward = (key: HeatSinkDim, x0: number, x1: number, y: number) => (
    <>
      <line x1={r1(x1 + 12)} y1={r1(y)} x2={r1(x1)} y2={r1(y)} markerEnd={arrow(key)} />
      <line x1={r1(x0 - 12)} y1={r1(y)} x2={r1(x0)} y2={r1(y)} markerEnd={arrow(key)} />
    </>
  );
  const ext = (a: Pt, b: Pt) => <line className="ext" x1={r1(a[0])} y1={r1(a[1])} x2={r1(b[0])} y2={r1(b[1])} />;
  const value = (ok: boolean, v: number | null) => (ok && v != null ? fmt(v) : '未填');

  const dims: ReactNode[] = [];
  {
    // L, up the leftmost vertical edge of the silhouette.
    const ends: Pt[] = [0, W].flatMap((x) => [-tb, FH].map((y): Pt => [x, y]));
    const [lx, ly] = ends.reduce((best, p) => (P(p[0], p[1], 0)[0] < P(best[0], best[1], 0)[0] ? p : best));
    const bot = P(lx, ly, 0);
    const top = P(lx, ly, L);
    const x = bot[0] - 12;
    dims.push(
      dim(
        'baseL',
        <>
          {ext([bot[0] - 2, bot[1]], [x - 3, bot[1]])}
          {ext([top[0] - 2, top[1]], [x - 3, top[1]])}
          {line('baseL', [x, bot[1]], [x, top[1]])}
          {tag(x, (bot[1] + top[1]) / 2, `L ${value(known.L, g.baseL_mm)}`, !known.L)}
        </>,
      ),
    );
  }
  {
    // W, along the fin tips at the foot, stood off toward the viewer.
    const off = 16 / s;
    const a = P(0, FH + off, 0);
    const b = P(W, FH + off, 0);
    dims.push(
      dim(
        'baseW',
        <>
          {ext(P(0, FH, 0), P(0, FH + off * 1.25, 0))}
          {ext(P(W, FH, 0), P(W, FH + off * 1.25, 0))}
          {line('baseW', a, b)}
          {tag((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 11, `W ${value(known.W, g.baseW_mm)}`, !known.W)}
        </>,
      ),
    );
  }
  {
    const c = P(W * 0.17, FH * 0.5, L);
    dims.push(dim('count', tag(c[0], c[1] - 22, fins ? `${n} 片` : '片數 未定', !fins)));
  }

  // --- the section through the top end -----------------------------------
  const { x: IX, y: IY, w: IW, h: IH } = INSET;
  const section: ReactNode[] = [];
  let marker: ReactNode = null;
  if (fins) {
    const sec = Math.min((IH - 96) / (FH + tb), (IW - 54) / (2.25 * pitch), 7);
    const cx = IX + IW / 2 - 8;
    const rootY = IY + IH - 40;
    const X = (x: number) => cx + x * sec;
    const Y = (y: number) => rootY - y * sec;
    const shown = n >= 3 ? [-pitch, 0, pitch] : n === 2 ? [-pitch, 0] : [0];
    const right = shown[shown.length - 1];
    section.push(
      <defs key="defs">
        <clipPath id={ids.clip}>
          <rect x={IX + 1} y={IY + 22} width={IW - 2} height={IH - 23} rx={7} />
        </clipPath>
      </defs>,
      <g key="cut" clipPath={`url(#${ids.clip})`}>
        <rect x={IX} y={r1(Y(0))} width={IW} height={r1(tb * sec)} fill="var(--hp-base)" />
        {shown.map((x) => (
          <path
            key={x}
            className="sec-fin"
            d={pathD([
              [X(x - tr / 2), Y(0)],
              [X(x + tr / 2), Y(0)],
              [X(x + t / 2), Y(FH)],
              [X(x - t / 2), Y(FH)],
            ])}
          />
        ))}
        <path className="sec-root" d={`M${IX} ${r1(Y(0))}H${IX + IW}`} />
      </g>,
    );
    if (n >= 2) {
      const gy = Y(FH) - 9;
      const g0 = X(-pitch + t / 2);
      const g1 = X(-t / 2);
      section.push(
        dim(
          'gap',
          <>
            {line('gap', [g0, gy], [g1, gy])}
            {tag((g0 + g1) / 2, gy - 12, fmt(gap))}
          </>,
        ),
      );
    }
    const ty = Y(FH) - 9;
    section.push(
      dim(
        'thickness',
        <>
          {inward('thickness', X(-t / 2), X(t / 2), ty)}
          {ext([X(-t / 2), Y(FH) - 2], [X(-t / 2), ty - 3])}
          {ext([X(t / 2), Y(FH) - 2], [X(t / 2), ty - 3])}
          {tag(X(t / 2) + 14, ty, `t ${fmt(t)}`, false, 'left')}
        </>,
      ),
    );
    const hx = X(right + Math.max(tr, t) / 2) + 9;
    section.push(
      dim(
        'height',
        <>
          {line('height', [hx, Y(0)], [hx, Y(FH)])}
          {tag(hx + 3, (Y(0) + Y(FH)) / 2, fmt(FH), false, 'left')}
        </>,
      ),
    );
    if (g.draft_deg > 0 && tr > t + 1e-6) {
      const ry = Y(0) + tb * sec + 11;
      section.push(
        dim(
          'draft',
          <>
            {ext([X(-tr / 2), Y(0)], [X(-tr / 2), ry + 3])}
            {ext([X(tr / 2), Y(0)], [X(tr / 2), ry + 3])}
            {inward('draft', X(-tr / 2), X(tr / 2), ry)}
            {tag(X(tr / 2) + 14, ry, `根 ${fmt(tr)}`, false, 'left')}
            {ext([X(-tr / 2), Y(0)], [X(-tr / 2), Y(FH * 0.62)])}
            {tag(X(-tr / 2) - 4, Y(FH * 0.42), `拔模 ${fmt(g.draft_deg)}°`, false, 'right')}
          </>,
        ),
      );
    }
    section.push(
      <text key="tip" x={IX + IW - 9} y={IY + 16} textAnchor="end" className="tip">
        尖端超溫 {Math.round(result.tipExcessRatio * 100)}%
      </text>,
    );
    // Where the section is cut, and the leader to it.
    const k = Math.max(0, n - 3);
    const a = P(n >= 2 ? (centers[k] + centers[k + 1]) / 2 : centers[0], FH * 0.5, L);
    marker = (
      <g className="cut-mark">
        <path d={`M${r1(a[0] + 7)} ${r1(a[1])}L${IX} ${IY + 40}`} />
        <circle cx={r1(a[0])} cy={r1(a[1])} r={7} />
        <text x={r1(a[0])} y={r1(a[1] + 3.2)} textAnchor="middle">
          A
        </text>
      </g>
    );
  } else {
    const missing = [
      !known.L && '底座長',
      !known.W && '底座寬',
      !known.FH && '高度',
      !known.gap && '間隙',
      !known.t && '厚度',
    ].filter(Boolean);
    section.push(
      <text key="miss" x={IX + IW / 2} y={IY + IH / 2} textAnchor="middle" className="miss-txt">
        <tspan x={IX + IW / 2}>鰭片幾何未填齊</tspan>
        <tspan x={IX + IW / 2} dy={16}>
          {missing.length ? missing.join('、') : '排不下任何一片'}
        </tspan>
      </text>,
    );
  }

  const label = fins
    ? `散熱器示意：底座 ${fmt(L)}×${fmt(W)} mm，${n} 片鰭片，高 ${fmt(FH)} mm，間隙 ${fmt(gap)} mm，厚 ${fmt(t)} mm`
    : '散熱器示意：鰭片幾何未填齊';

  return (
    <svg className="hp-svg" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={label} data-heat-sink>
      <defs>
        {[ids.arr, ids.arrHl].map((id) => (
          <marker key={id} id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0.8L7.5 4L0 7.2Z" className={id === ids.arrHl ? 'arr hl' : 'arr'} />
          </marker>
        ))}
      </defs>
      {solid}
      {air}
      {marker}
      <rect x={IX} y={IY} width={IW} height={IH} rx={8} className="inset" />
      <text x={IX + 10} y={IY + 16} className="inset-ttl">
        上端剖面 A
      </text>
      {section}
      {dims}
      {fins && (
        <text x={SOLID.x0 - 26} y={VH - 6} className="note">
          ↑ 靜止空氣・自然對流（鰭片垂直）
        </text>
      )}
    </svg>
  );
}
