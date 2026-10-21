/**
 * Screen 04 heat path drawing: a 2D cross-section and a 3D exploded stack of
 * one component, built from `heatPathView`.
 *
 * The drawing is a picture, not a model. Thicknesses are exaggerated so a
 * 0.05 mm bond line is visible next to a 7 mm base; widths follow the part's
 * real proportions. What it has to get right is which layers exist for this
 * path and mount, in what order heat crosses them, and which field sets which
 * dimension — the form highlights a layer and the drawing says so.
 *
 * Everything is returned as data (layer groups, labels, a dimension lookup) so
 * the component that renders it can restyle the highlight without rebuilding
 * any element: a click that lands on a layer must find the same DOM node it
 * pressed on.
 */

import { Fragment, type ReactNode } from 'react';

import { packageLabel, SPREADING_DOMAIN_LABELS, type HeatPathType } from '@/domain/component';
import {
  formatArea as fA,
  formatMm as fMm,
  formatR as fR,
  type ChainSegment,
  type HeatLayer,
  type HeatPathView,
  type SegmentId,
} from './heatPathModel';

/** A dimension the focused field sets, drawn on the layer it belongs to. */
export type DimKey =
  | 'pkgL'
  | 'pkgW'
  | 'pkgH'
  | 'eL'
  | 'eW'
  | 'boardT'
  | 'via'
  | 'blt'
  | 'mL'
  | 'mW'
  | 'mH'
  | 'jointBlt'
  | 'landW'
  | 'custom'
  | 'spread'
  | 'rjc';

export const LAYER_COLOR: Record<HeatLayer, string> = {
  die: 'var(--hp-die)',
  pkg: 'var(--hp-pkg)',
  face: 'var(--hp-face)',
  solder: 'var(--hp-solder)',
  coin: 'var(--hp-coin)',
  pcb: 'var(--hp-pcb)',
  via: 'var(--hp-via)',
  tim: 'var(--hp-tim)',
  mount: 'var(--hp-mount)',
  joint: 'var(--hp-tim)',
  pipe: 'var(--hp-pipe)',
  base: 'var(--hp-base)',
  spread: 'var(--hp-heat)',
  fins: 'var(--hp-fin)',
  probe: 'var(--color-ink-700)',
  exposed: 'var(--hp-air)',
};

/** What the face heat leaves the part through is called on each path. */
export const PATH_FACE_LABEL: Record<HeatPathType, string> = {
  Coin: '銅塊接合面',
  Board: 'E-PAD 散熱墊',
  TopSurface: 'Case 上表面',
  DirectMetal: '金屬底面接觸',
};

export const VIEWBOX_W = 600;
const LABEL_X = 420;

export interface DrawnGroup {
  layer: HeatLayer;
  node: ReactNode;
}

export interface Drawing {
  viewBox: string;
  /** 3D only: the transform the stack (and its dimensions) is drawn under. */
  transform?: string;
  layers: DrawnGroup[];
  flow: ReactNode;
  probe: ReactNode;
  labels: DrawnGroup[];
  dim: (key: DimKey | null) => ReactNode;
}

/** Ids of the shared defs, unique per drawing on the page. */
export interface SvgIds {
  arr: string;
  heatArr: string;
  airArr: string;
  hatchMiss: string;
  hatchAir: string;
  wick: string;
  heatGrad: string;
  heatSpot: string;
  hotBody: string;
}

export function svgIds(prefix: string): SvgIds {
  const p = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
  return {
    arr: `${p}arr`,
    heatArr: `${p}heatArr`,
    airArr: `${p}airArr`,
    hatchMiss: `${p}hatchMiss`,
    hatchAir: `${p}hatchAir`,
    wick: `${p}wick`,
    heatGrad: `${p}heatGrad`,
    heatSpot: `${p}heatSpot`,
    hotBody: `${p}hotBody`,
  };
}

const url = (id: string) => `url(#${id})`;

export function SvgDefs({ ids }: { ids: SvgIds }) {
  return (
    <defs>
      <pattern
        id={ids.hatchMiss}
        width="7"
        height="7"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="7" height="7" fill="var(--color-danger-100)" opacity=".55" />
        <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-danger-600)" strokeWidth="2" />
      </pattern>
      <pattern
        id={ids.hatchAir}
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-ink-300)" strokeWidth="1.2" />
      </pattern>
      <pattern id={ids.wick} width="5" height="5" patternUnits="userSpaceOnUse">
        <rect width="5" height="5" fill="var(--hp-pipe)" />
        <circle cx="2.5" cy="2.5" r=".9" fill="#fff" opacity=".55" />
      </pattern>
      <linearGradient id={ids.heatGrad} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: 'var(--hp-heat)', stopOpacity: 0.75 }} />
        <stop offset="1" style={{ stopColor: 'var(--hp-heat)', stopOpacity: 0.08 }} />
      </linearGradient>
      <radialGradient id={ids.heatSpot} cx=".5" cy=".5" r=".55">
        <stop offset="0" style={{ stopColor: 'var(--hp-heat)', stopOpacity: 0.8 }} />
        <stop offset=".6" style={{ stopColor: 'var(--hp-heat)', stopOpacity: 0.28 }} />
        <stop offset="1" style={{ stopColor: 'var(--hp-heat)', stopOpacity: 0.06 }} />
      </radialGradient>
      <radialGradient id={ids.hotBody} cx=".5" cy=".85" r=".8">
        <stop offset="0" style={{ stopColor: 'var(--hp-die)', stopOpacity: 0.95 }} />
        <stop offset=".55" style={{ stopColor: 'var(--hp-die)', stopOpacity: 0.35 }} />
        <stop offset="1" style={{ stopColor: 'var(--hp-pkg)', stopOpacity: 1 }} />
      </radialGradient>
      <marker
        id={ids.arr}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0 0L10 5L0 10z" fill="var(--color-accent-600)" />
      </marker>
      <marker
        id={ids.heatArr}
        viewBox="0 0 10 10"
        refX="7"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto"
      >
        <path d="M0 0L10 5L0 10z" fill="var(--hp-heat)" />
      </marker>
      <marker
        id={ids.airArr}
        viewBox="0 0 10 10"
        refX="7"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto"
      >
        <path d="M0 0L10 5L0 10z" fill="var(--hp-air)" />
      </marker>
    </defs>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ok = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const pos = (value: unknown): value is number => ok(value) && value > 0;
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
const r1 = (value: number) => Number(value.toFixed(1));

/** Text width in SVG units: CJK at the font size, Latin a little over half. */
function textW(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += /[⺀-￯]/.test(ch) ? size : size * 0.58;
  return w;
}

function fit(text: string, size: number, max: number): string {
  if (textW(text, size) <= max) return text;
  let out = '';
  for (const ch of text) {
    if (textW(`${out}${ch}…`, size) > max) break;
    out += ch;
  }
  return `${out}…`;
}

const segOf = (view: HeatPathView, id: SegmentId) =>
  view.segments.find((segment) => segment.id === id);

/** The right-hand figure on a label: its resistance, or what is missing. */
function rLab(segment: ChainSegment | undefined): { r: string; rc: '' | 'miss' | 'later' } {
  if (!segment) return { r: '', rc: '' };
  if (segment.missing.length > 0) return { r: `缺 ${segment.missing[0]}`, rc: 'miss' };
  if (segment.later) return { r: '05 計算', rc: 'later' };
  return { r: `${fR(segment.R)} °C/W${segment.parallel ? ' ∥' : ''}`, rc: '' };
}

interface LabelItem {
  layer: HeatLayer;
  /** Anchor on the drawing. */
  y: number;
  xr: number;
  t: string;
  s?: string;
  r?: string;
  rc?: '' | 'miss' | 'later';
  color?: string;
}

/**
 * Labels down the right edge: each starts level with its anchor, then they are
 * pushed apart symmetrically until none overlap, so the leaders stay short and
 * rarely cross.
 */
function placeLabels(items: LabelItem[], height: number, top = 14): DrawnGroup[] {
  const list = items.map((item) => ({ ...item, ly: item.y })).sort((a, b) => a.y - b.y);
  const gap = 30;
  const lo = top + 8;
  const hi = height - 18;
  list.forEach((item) => {
    item.ly = clamp(item.y, lo, hi);
  });
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let i = 1; i < list.length; i++) {
      const d = list[i].ly - list[i - 1].ly;
      if (d < gap) {
        const push = (gap - d) / 2;
        list[i - 1].ly -= push;
        list[i].ly += push;
        moved = true;
      }
    }
    list.forEach((item) => {
      item.ly = clamp(item.ly, lo, hi);
    });
    if (!moved) break;
  }
  for (let i = 1; i < list.length; i++) {
    if (list[i].ly - list[i - 1].ly < gap) list[i].ly = list[i - 1].ly + gap;
  }
  const room = VIEWBOX_W - 6 - (LABEL_X + 14);
  return list.map((item) => {
    const xr = item.xr + 4;
    const lx = LABEL_X;
    const rW = item.r ? textW(item.r, 11.5) + 8 : 0;
    return {
      layer: item.layer,
      node: (
        <>
          <path
            className="lead"
            d={`M${r1(xr)} ${r1(item.y)} H${r1(Math.min(xr + 10, lx - 14))} L${lx - 8} ${r1(item.ly)} H${lx - 2}`}
          />
          <rect
            x={lx}
            y={r1(item.ly - 10)}
            width="9"
            height="9"
            rx="2"
            fill={item.color || LAYER_COLOR[item.layer]}
          />
          <text className="t1" x={lx + 14} y={r1(item.ly - 1)}>
            {fit(item.t, 12.5, room - rW)}
          </text>
          {item.r && (
            <text className={`tr ${item.rc ?? ''}`} x={VIEWBOX_W - 6} y={r1(item.ly - 1)} textAnchor="end">
              {item.r}
            </text>
          )}
          {item.s && (
            <text className="t2" x={lx + 14} y={r1(item.ly + 12)}>
              {fit(item.s, 10.5, room)}
            </text>
          )}
        </>
      ),
    };
  });
}

function dimKit(ids: SvgIds) {
  const hdim = (x1: number, x2: number, y: number, text: string, ext?: Array<[number, number]>) => {
    const mid = (x1 + x2) / 2;
    const tw = textW(text, 11.5) + 12;
    return (
      <g className="dim">
        {ext?.map(([x, y0], index) => (
          <line key={index} className="ext" x1={r1(x)} y1={r1(y0)} x2={r1(x)} y2={r1(y)} />
        ))}
        <line
          x1={r1(x1)}
          y1={r1(y)}
          x2={r1(x2)}
          y2={r1(y)}
          markerStart={url(ids.arr)}
          markerEnd={url(ids.arr)}
        />
        <rect x={r1(mid - tw / 2)} y={r1(y - 19)} width={r1(tw)} height="16" rx="4" />
        <text x={r1(mid)} y={r1(y - 7)} textAnchor="middle">
          {text}
        </text>
      </g>
    );
  };
  const vdim = (x: number, y1: number, y2: number, text: string, side: 'left' | 'right' = 'left') => {
    const mid = (y1 + y2) / 2;
    const tw = textW(text, 11.5) + 12;
    const tx = side === 'left' ? x - 6 - tw : x + 6;
    const small = Math.abs(y2 - y1) < 14;
    return (
      <g className="dim">
        {small ? (
          <>
            <line x1={r1(x)} y1={r1(y1 - 12)} x2={r1(x)} y2={r1(y1)} markerEnd={url(ids.arr)} />
            <line x1={r1(x)} y1={r1(y2 + 12)} x2={r1(x)} y2={r1(y2)} markerEnd={url(ids.arr)} />
            <line x1={r1(x - 4)} y1={r1(y1)} x2={r1(x + 4)} y2={r1(y1)} />
            <line x1={r1(x - 4)} y1={r1(y2)} x2={r1(x + 4)} y2={r1(y2)} />
          </>
        ) : (
          <line
            x1={r1(x)}
            y1={r1(y1)}
            x2={r1(x)}
            y2={r1(y2)}
            markerStart={url(ids.arr)}
            markerEnd={url(ids.arr)}
          />
        )}
        <rect x={r1(tx)} y={r1(mid - 8)} width={r1(tw)} height="16" rx="4" />
        <text x={r1(tx + tw / 2)} y={r1(mid + 4)} textAnchor="middle">
          {text}
        </text>
      </g>
    );
  };
  /** A thickness beside its layer: right if it fits before the labels, else left, else inside. */
  const vdimA = (xl: number, xr: number, y1: number, y2: number, text: string) => {
    const tw = textW(text, 11.5) + 14;
    if (xr + 6 + tw <= LABEL_X - 12) return vdim(xr, y1, y2, text, 'right');
    if (xl - 6 - tw >= 4) return vdim(xl, y1, y2, text, 'left');
    return vdim(Math.max(xl + 30, 8), y1, y2, text, 'right');
  };
  const tagNote = (x: number, y: number, text: string) => {
    const tw = textW(text, 11.5) + 14;
    return (
      <g className="dim">
        <rect x={r1(x - tw / 2)} y={r1(y - 9)} width={r1(tw)} height="18" rx="4" />
        <text x={r1(x)} y={r1(y + 4)} textAnchor="middle">
          {text}
        </text>
      </g>
    );
  };
  return { hdim, vdim, vdimA, tagNote };
}

/** Groups built up layer by layer, each child keyed by insertion order. */
function layerBag() {
  const groups = new Map<HeatLayer, ReactNode[]>();
  let seq = 0;
  const add = (layer: HeatLayer, node: ReactNode) => {
    const list = groups.get(layer) ?? [];
    list.push(<Fragment key={seq++}>{node}</Fragment>);
    groups.set(layer, list);
  };
  const ordered = (order: HeatLayer[]): DrawnGroup[] =>
    order.filter((layer) => groups.has(layer)).map((layer) => ({ layer, node: groups.get(layer) }));
  return { add, ordered };
}

function probeTag(
  pt: { x: number; y: number },
  view: HeatPathView,
  bend: number,
): ReactNode {
  const text = pos(view.limit) ? `${view.limitType} 上限 ${view.limit} °C` : `缺 ${view.limitType} 限溫`;
  const tw = textW(text, 12) + 18;
  return (
    <>
      <g className={`probe-tag${pos(view.limit) ? '' : ' miss'}`}>
        <path
          d={`M${r1(pt.x)} ${r1(pt.y)} L${r1(Math.max(pt.x - bend, 22 + tw))} 28 H${r1(12 + tw)}`}
          stroke="var(--color-ink-700)"
          strokeWidth="1.2"
          fill="none"
        />
        <rect x="12" y="18" width={r1(tw)} height="20" rx="5" />
        <text x={r1(12 + tw / 2)} y="32" textAnchor="middle">
          {text}
        </text>
      </g>
      <circle cx={r1(pt.x)} cy={r1(pt.y)} r="5.5" fill="var(--color-surface)" stroke="var(--color-ink-900)" strokeWidth="2" />
      <circle cx={r1(pt.x)} cy={r1(pt.y)} r="2" fill="var(--color-ink-900)" />
    </>
  );
}

const pkgName = (view: HeatPathView) =>
  view.packageType === 'RF Power Flanged Package'
    ? 'RF 法蘭封裝'
    : (packageLabel(view.packageType) ?? '未指定封裝');

function timSubtitle(view: HeatPathView): string {
  switch (view.tim.kind) {
    case 'material':
      return `${view.tim.name}・BLT ${fMm(view.tim.blt)} mm・k ${view.tim.k ?? '—'}`;
    case 'direct':
      return `h ${view.contactH ?? '—'} W/m²K・無 TIM`;
    case 'measured':
      return '實測整體介面熱阻';
    case 'missing':
      return '材料已不在專案清單';
    case 'none':
      return '未指定材料';
  }
}

// ---------------------------------------------------------------------------
// 2D cross-section
// ---------------------------------------------------------------------------

export function draw2D(view: HeatPathView, ids: SvgIds): Drawing {
  const { hdim, vdim, vdimA, tagNote } = dimKit(ids);
  const bag = layerBag();
  const add = bag.add;
  const labs: LabelItem[] = [];
  const dims: Partial<Record<DimKey, ReactNode>> = {};
  const missOl = (x: number, y: number, w: number, h: number) => (
    <rect className="miss-ol" x={r1(x)} y={r1(y)} width={r1(Math.max(w, 1))} height={r1(Math.max(h, 1))} fill={url(ids.hatchMiss)} />
  );
  const R = (x: number, y: number, w: number, h: number, fill: string, o: { rx?: number; opacity?: number } = {}) => (
    <rect
      className="sh"
      x={r1(x)}
      y={r1(y)}
      width={r1(Math.max(w, 0.5))}
      height={r1(Math.max(h, 0.5))}
      rx={o.rx}
      fill={fill}
      opacity={o.opacity}
    />
  );

  const cx = 205;
  const half = 175;
  const m = view.mount;
  const { L, W, H } = view.pkg;
  const path = view.heatPath;
  const eL = view.sourceFace.L;
  const eW = view.sourceFace.W;
  const at: {
    die: { x: number; y: number };
    face: { y: number };
    pkgTop: number;
    pkgBot: number;
    baseTop: number;
  } = { die: { x: cx, y: 0 }, face: { y: 0 }, pkgTop: 0, pkgBot: 0, baseTop: 0 };

  const widths = [L];
  if (path === 'Board') widths.push(view.spreadFace.L, eL);
  if (path === 'Coin') widths.push(view.coin.L);
  if (m.type !== 'Direct') widths.push(m.contact_L_mm);
  const maxW = Math.max(...widths.filter(pos), 1);
  const s = Math.min(270 / maxW, 9);
  const px = (mm: number | null, fallback: number) => (pos(mm) ? Math.max(mm * s, 8) : fallback);
  let y = 64;

  const pkgW = px(L, 90);
  const pkgX = cx - pkgW / 2;
  const pkgH = clamp((pos(H) ? H : 2) * (path === 'DirectMetal' ? 6 : 15), 42, 96);
  const dieW = Math.max(Math.min(pkgW * 0.34, 70), 12);
  const missPkg = !pos(L) || !pos(W);

  const drawPackage = (yTop: number) => {
    if (view.junction) {
      add('pkg', R(pkgX, yTop, pkgW, pkgH, 'var(--hp-pkg)', { rx: 3 }));
      const dy = yTop + pkgH - 7 - 11;
      add('die', R(cx - dieW / 2, dy, dieW, 9, 'var(--hp-die)', { rx: 1.5 }));
      at.die = { x: cx, y: dy + 4.5 };
      labs.push({
        layer: 'die',
        y: dy + 3.5,
        xr: pkgX + pkgW,
        t: '晶片（接面）',
        s: 'Rjc：接面 → 散熱面',
        ...rLab(segOf(view, 'rjc')),
      });
      labs.push({
        layer: 'pkg',
        y: yTop + 9,
        xr: pkgX + pkgW,
        t: path === 'DirectMetal' ? '本體' : '封裝本體',
        s: `${pkgName(view)}・${fMm(L)}×${fMm(W)}×${fMm(H)} mm`,
      });
    } else {
      add('pkg', R(pkgX, yTop, pkgW, pkgH, url(ids.hotBody), { rx: 3 }));
      at.die = { x: cx, y: yTop + pkgH * 0.6 };
      labs.push({
        layer: 'pkg',
        y: yTop + pkgH * 0.35,
        xr: pkgX + pkgW,
        t: '本體（熱源）',
        s: `${fMm(L)}×${fMm(W)}×${fMm(H)} mm・等溫本體`,
      });
    }
    if (missPkg) add('pkg', missOl(pkgX, yTop, pkgW, pkgH));
    if (pkgW > 120 && path === 'DirectMetal') {
      add(
        'pkg',
        <text className="svg-txt on-dark" x={cx} y={r1(yTop + pkgH / 2 - 2)} textAnchor="middle">
          {view.packageType === 'Shielded Module' ? '濾波器／屏蔽模組' : pkgName(view)}
        </text>,
      );
    }
    dims.pkgL = hdim(pkgX, pkgX + pkgW, yTop - 10, `L ${fMm(L)} mm`);
    dims.pkgH = vdim(pkgX - 12, yTop, yTop + pkgH, `H ${fMm(H)}`);
    dims.pkgW = tagNote(cx, yTop - 16, `W ${fMm(W)} mm（進紙面方向，看立體圖）`);
    at.pkgTop = yTop;
    at.pkgBot = yTop + pkgH;
  };

  let timW: number;
  if (path === 'TopSurface') {
    const pcbW = Math.min(2 * half, pkgW + 150);
    const pcbH = 30;
    add('pcb', R(cx - pcbW / 2, y, pcbW, pcbH, 'var(--hp-pcb)', { opacity: 0.55 }));
    labs.push({
      layer: 'pcb',
      y: y + 11,
      xr: cx + pcbW / 2,
      t: 'PCB',
      s: '元件裝在朝散熱器的那一面',
      r: '不在熱路徑',
      rc: 'later',
    });
    y += pcbH;
    const nb = clamp(Math.round(pkgW / 11), 3, 18);
    add(
      'pcb',
      Array.from({ length: nb }, (_, i) => (
        <circle
          key={i}
          cx={r1(pkgX + 6 + (i * (pkgW - 12)) / Math.max(nb - 1, 1))}
          cy={y + 4}
          r="3"
          fill="var(--hp-solder)"
        />
      )),
    );
    y += 8;
    drawPackage(y);
    y += pkgH;
    add('face', R(pkgX, y - 7, pkgW, 7, 'var(--hp-face)'));
    at.face = { y: y - 3.5 };
    labs.push({
      layer: 'face',
      y: y - 2.5,
      xr: pkgX + pkgW,
      t: 'Case 上表面（Lid）',
      s: `${fMm(L)}×${fMm(W)} mm・朝散熱器`,
    });
    timW = pkgW;
  } else if (path === 'Coin') {
    drawPackage(y);
    y += pkgH;
    add('face', R(pkgX, y - 6, pkgW, 6, 'var(--hp-face)'));
    at.face = { y: y - 3 };
    labs.push({ layer: 'face', y: y - 2, xr: pkgX + pkgW, t: '銅塊接合面', s: '＝封裝底面' });
    add('solder', R(pkgX, y, pkgW, 11, 'var(--hp-solder)'));
    labs.push({
      layer: 'solder',
      y: y + 5.5,
      xr: pkgX + pkgW,
      t: '焊料',
      s: `${fMm(view.solder.t)} mm・k ${view.solder.k ?? '—'}・有效 ${ok(view.solder.voiding) ? Math.round(view.solder.voiding * 100) : '—'}%`,
      ...rLab(segOf(view, 'solder')),
    });
    y += 11;
    const coinW = px(view.coin.L, pkgW + 40);
    const pcbH = clamp((pos(view.coin.t) ? view.coin.t : 2.5) * 17, 36, 56);
    const pcbW = Math.min(2 * half, coinW + 120);
    add('pcb', R(cx - pcbW / 2, y, pcbW, pcbH, 'var(--hp-pcb)'));
    add('coin', R(cx - coinW / 2, y, coinW, pcbH, 'var(--hp-coin)'));
    if (!pos(view.coin.L) || !pos(view.coin.t)) add('coin', missOl(cx - coinW / 2, y, coinW, pcbH));
    add(
      'coin',
      <path
        d={`M${r1(pkgX)} ${r1(y)} L${r1(cx - coinW / 2 + 2)} ${r1(y + pcbH)} M${r1(pkgX + pkgW)} ${r1(y)} L${r1(cx + coinW / 2 - 2)} ${r1(y + pcbH)}`}
        stroke="var(--hp-heat)"
        strokeWidth="1.4"
        strokeDasharray="4 3"
        fill="none"
        opacity=".9"
      />,
    );
    labs.push({
      layer: 'coin',
      y: y + pcbH * 0.5,
      xr: cx + coinW / 2,
      t: '銅塊',
      s: `${fMm(view.coin.L)}×${fMm(view.coin.W)}×${fMm(view.coin.t)} mm・k ${view.coin.k ?? '—'}`,
      ...rLab(segOf(view, 'coin')),
    });
    labs.push({ layer: 'pcb', y: y + pcbH - 4, xr: cx + pcbW / 2, t: 'PCB', s: '銅塊嵌在板中' });
    y += pcbH;
    timW = coinW;
  } else if (path === 'Board') {
    drawPackage(y);
    y += pkgH;
    const padW = px(eL, pkgW * 0.7);
    add('face', R(cx - padW / 2, y, padW, 7, 'var(--hp-face)'));
    if (!pos(eL) || !pos(eW)) add('face', missOl(cx - padW / 2, y - 2, padW, 11));
    at.face = { y: y + 3.5 };
    labs.push({
      layer: 'face',
      y: y + 3.5,
      xr: cx + Math.max(padW, pkgW) / 2,
      t: 'E-PAD',
      s: `${fMm(eL)}×${fMm(eW)} mm`,
    });
    dims.eL = hdim(cx - padW / 2, cx + padW / 2, at.pkgTop - 10, `E-PAD 長 ${fMm(eL)} mm`, [
      [cx - padW / 2, y],
      [cx + padW / 2, y],
    ]);
    dims.eW = tagNote(cx, at.pkgTop - 16, `E-PAD 寬 ${fMm(eW)} mm（進紙面方向，看立體圖）`);
    y += 7;
    const t = pos(view.boardThickness) ? view.boardThickness : 1.6;
    const pcbH = clamp(t * 17, 30, 58);
    const spW = pos(view.spreadFace.L) ? view.spreadFace.L * s : padW + 16;
    const pcbW = Math.min(2 * half, Math.max(spW, pkgW) + 120);
    add('pcb', R(cx - pcbW / 2, y, pcbW, pcbH, 'var(--hp-pcb)'));
    if (!pos(view.boardThickness)) add('pcb', missOl(cx - pcbW / 2, y, pcbW, pcbH));
    const nv = clamp(Math.round(padW / 8), 2, 16);
    add(
      'via',
      Array.from({ length: nv }, (_, i) => {
        const vx = cx - padW / 2 + 3 + (i * (padW - 6)) / Math.max(nv - 1, 1);
        return <rect key={i} className="sh" x={r1(vx - 1.6)} y={r1(y)} width="3.2" height={r1(pcbH)} fill="var(--hp-via)" />;
      }),
    );
    add(
      'via',
      <path
        d={`M${r1(cx - padW / 2)} ${r1(y)} L${r1(cx - spW / 2)} ${r1(y + pcbH)} M${r1(cx + padW / 2)} ${r1(y)} L${r1(cx + spW / 2)} ${r1(y + pcbH)}`}
        stroke="var(--hp-heat)"
        strokeWidth="1.4"
        strokeDasharray="4 3"
        fill="none"
      />,
    );
    labs.push({
      layer: 'via',
      y: y + pcbH * 0.4,
      xr: cx + Math.max(padW, spW) / 2,
      t: '導熱孔',
      s: `k ${view.via.k ?? '—'}・係數 ${view.via.eff ?? '—'}${view.via.kCustom || view.via.effCustom ? '（自訂）' : ''}`,
      ...rLab(segOf(view, 'via')),
    });
    labs.push({
      layer: 'pcb',
      y: y + pcbH - 3,
      xr: cx + pcbW / 2,
      t: 'PCB',
      s: `板厚 ${fMm(view.boardThickness)} mm`,
    });
    dims.boardT = vdimA(cx - pcbW / 2 - 8, cx + pcbW / 2 + 8, y, y + pcbH, `t ${fMm(view.boardThickness)} mm`);
    dims.via = tagNote(
      cx,
      y + pcbH + 14,
      `擴散面 (L+t)×(W+t) = ${fMm(view.spreadFace.L)}×${fMm(view.spreadFace.W)} mm`,
    );
    y += pcbH;
    timW = spW;
  } else {
    drawPackage(y);
    y += pkgH;
    add('face', R(pkgX, y - 8, pkgW, 8, 'var(--hp-face)'));
    at.face = { y: y - 4 };
    const contact = view.metal.contact_geometry;
    labs.push({
      layer: 'face',
      y: y - 4,
      xr: pkgX + pkgW,
      t: '金屬底面',
      s:
        contact === 'FullBase'
          ? '完整底面接觸'
          : contact === 'PerimeterFrame'
            ? `外圍框接觸・邊寬 ${fMm(view.metal.perimeter_land_width_mm)} mm`
            : `自訂接觸 ${fA(view.metal.custom_contact_area_mm2)} mm²`,
      r: `${fA(view.sourceArea)} mm²`,
      rc: pos(view.sourceArea) ? '' : 'miss',
    });
    if (view.metal.exposed_surface_enabled) {
      const arrow = (x1: number, y1: number, x2: number, y2: number, key: number) => (
        <path
          key={key}
          d={`M${r1(x1)} ${r1(y1)} Q${r1((x1 + x2) / 2 + 6)} ${r1((y1 + y2) / 2)} ${r1(x2)} ${r1(y2)}`}
          stroke="var(--hp-air)"
          strokeWidth="2"
          fill="none"
          markerEnd={url(ids.airArr)}
        />
      );
      const arrows = [0, 1, 2, 3].map((i) => {
        const ax = pkgX + pkgW * (0.2 + i * 0.2);
        return arrow(ax, at.pkgTop - 2, ax + 4, at.pkgTop - 22, i);
      });
      arrows.push(arrow(pkgX - 2, at.pkgTop + pkgH * 0.4, pkgX - 20, at.pkgTop + pkgH * 0.25, 4));
      arrows.push(
        arrow(pkgX + pkgW + 2, at.pkgTop + pkgH * 0.4, pkgX + pkgW + 20, at.pkgTop + pkgH * 0.25, 5),
      );
      add('exposed', arrows);
      labs.push({
        layer: 'exposed',
        y: at.pkgTop - 14,
        xr: pkgX + pkgW * 0.8 + 4,
        t: '暴露表面',
        s: '對流＋輻射（06 設定）',
      });
    }
    timW = pkgW;
  }

  // ---- TIM / contact ----
  const tk = view.tim.kind;
  const timH = tk === 'direct' ? 5 : tk === 'material' ? clamp(8 + (view.tim.blt ?? 0.1) * 9, 9, 24) : 9;
  const timX = cx - timW / 2;
  const timFill = tk === 'direct' ? 'var(--hp-dry)' : 'var(--hp-tim)';
  const contact = view.metal.contact_geometry;
  if (path === 'DirectMetal' && contact === 'PerimeterFrame') {
    const lw = pos(view.metal.perimeter_land_width_mm) ? Math.max(view.metal.perimeter_land_width_mm * s, 5) : 6;
    add('tim', R(timX, y, lw, timH, timFill));
    add('tim', R(timX + timW - lw, y, lw, timH, timFill));
    add('tim', <rect x={r1(timX + lw)} y={r1(y)} width={r1(Math.max(timW - 2 * lw, 0))} height={r1(timH)} fill={url(ids.hatchAir)} />);
    dims.landW = hdim(timX, timX + lw, y - 12, `邊寬 ${fMm(view.metal.perimeter_land_width_mm)} mm`, [
      [timX, y],
      [timX + lw, y],
    ]);
  } else if (path === 'DirectMetal' && contact === 'CustomArea') {
    const area = view.metal.custom_contact_area_mm2;
    const ratio = pos(area) && pos(L) && pos(W) ? clamp(area / (L * W), 0.06, 1) : 0.5;
    const cw = timW * ratio;
    add('tim', <rect x={r1(timX)} y={r1(y)} width={r1(timW)} height={r1(timH)} fill={url(ids.hatchAir)} />);
    add('tim', R(cx - cw / 2, y, cw, timH, timFill));
    dims.custom = hdim(cx - cw / 2, cx + cw / 2, y - 12, `等效 ${fA(area)} mm²`);
  } else {
    add('tim', R(timX, y, timW, timH, timFill));
  }
  if (tk === 'none' || tk === 'missing') add('tim', missOl(timX, y - 2, timW, timH + 4));
  labs.push({
    layer: 'tim',
    color: tk === 'direct' ? 'var(--hp-dry)' : '',
    y: y + timH / 2,
    xr: timX + timW,
    t: tk === 'direct' ? '乾式接觸' : tk === 'measured' ? '介面（實測）' : 'TIM',
    s: timSubtitle(view),
    ...rLab(segOf(view, 'tim')),
  });
  dims.blt = vdimA(
    timX - 8,
    timX + timW + 8,
    y,
    y + timH,
    `BLT ${tk === 'material' ? fMm(view.tim.blt) : '—'} mm（圖上放大）`,
  );
  y += timH;

  // ---- Mount ----
  const fpW = px(m.contact_L_mm, timW + 24);
  let entryW = timW;
  const baseH = clamp((pos(view.base.t) ? view.base.t : 6) * 8, 44, 64);
  const missM = (id: SegmentId) => (segOf(view, id)?.missing.length ?? 0) > 0;
  const jointLabel = (yy: number) => {
    const dry = view.jointTimName == null;
    add('joint', R(cx - fpW / 2, yy, fpW, 5, dry ? 'var(--hp-dry)' : 'var(--hp-tim)'));
    labs.push({
      layer: 'joint',
      color: dry ? 'var(--hp-dry)' : '',
      y: yy + 2.5,
      xr: cx + fpW / 2,
      t: '接合面',
      s: dry ? '乾接觸' : `${view.jointTimName}・BLT ${fMm(m.joint_blt_mm)} mm`,
      ...rLab(segOf(view, 'joint')),
    });
    dims.jointBlt = vdimA(cx - fpW / 2 - 8, cx + fpW / 2 + 8, yy, yy + 5, `BLT ${fMm(m.joint_blt_mm)} mm`);
  };
  if (m.type === 'Pedestal') {
    const hh = pos(m.height_mm) ? clamp(m.height_mm * 9, 18, 64) : 32;
    const bolted = m.attachment === 'Bolted';
    add('mount', R(cx - fpW / 2, y, fpW, hh + (bolted ? 0 : 2), bolted ? 'var(--hp-mount)' : 'var(--hp-base)'));
    if (missM('block')) add('mount', missOl(cx - fpW / 2, y, fpW, hh));
    labs.push({
      layer: 'mount',
      y: y + hh / 2,
      xr: cx + fpW / 2,
      t: '凸台',
      s: `${fMm(m.contact_L_mm)}×${fMm(m.contact_W_mm)}×${fMm(m.height_mm)} mm・${bolted ? '後鎖' : '與底座同體'}`,
      ...rLab(segOf(view, 'block')),
    });
    dims.mL = hdim(cx - fpW / 2, cx + fpW / 2, y + hh + baseH + 16, `凸台長 ${fMm(m.contact_L_mm)} mm`, [
      [cx - fpW / 2, y + hh],
      [cx + fpW / 2, y + hh],
    ]);
    dims.mH = vdim(cx - fpW / 2 - 10, y, y + hh, `高 ${fMm(m.height_mm)} mm`);
    dims.mW = tagNote(cx, y + hh / 2, `凸台寬 ${fMm(m.contact_W_mm)} mm（進紙面方向）`);
    y += hh;
    if (bolted) {
      jointLabel(y);
      y += 5;
    }
    entryW = fpW;
  } else if (m.type === 'SmallBaseHeatPipe' || m.type === 'VaporChamber') {
    const vc = m.type === 'VaporChamber';
    const hh = vc ? 18 : pos(m.height_mm) ? clamp(m.height_mm * 7, 18, 46) : 26;
    const layer: HeatLayer = vc ? 'pipe' : 'mount';
    add(layer, R(cx - fpW / 2, y, fpW, hh, vc ? url(ids.wick) : 'var(--hp-mount)', { rx: vc ? 3 : 1 }));
    if (missM(vc ? 'vc' : 'block')) add(layer, missOl(cx - fpW / 2, y, fpW, hh));
    labs.push({
      layer,
      y: y + hh / 2,
      xr: cx + fpW / 2,
      t: vc ? '均熱板' : '小基座',
      s: `${fMm(m.contact_L_mm)}×${fMm(m.contact_W_mm)} mm${vc ? '' : `・厚 ${fMm(m.height_mm)} mm`}`,
      ...rLab(segOf(view, vc ? 'vc' : 'block')),
    });
    dims.mL = hdim(
      cx - fpW / 2,
      cx + fpW / 2,
      y + hh + 4 + baseH + 16,
      `${vc ? '均熱板' : '基座'}長 ${fMm(m.contact_L_mm)} mm`,
      [
        [cx - fpW / 2, y + hh],
        [cx + fpW / 2, y + hh],
      ],
    );
    dims.mW = tagNote(cx, y + hh / 2, `${vc ? '均熱板' : '基座'}寬 ${fMm(m.contact_W_mm)} mm（進紙面方向）`);
    dims.mH = vdim(cx - fpW / 2 - 10, y, y + hh, `厚 ${fMm(m.height_mm)} mm`);
    y += hh;
    jointLabel(y);
    y += 5;
    entryW = fpW;
  }

  // ---- Base, spreading, pipes ----
  const baseFull = pos(view.base.L) ? view.base.L * s : 2 * half;
  const baseW = Math.min(2 * half, baseFull);
  const broken = baseFull > 2 * half + 0.5;
  const bx = cx - baseW / 2;
  add('base', R(bx, y, baseW, baseH, 'var(--hp-base)'));
  if (!pos(view.base.L) || !pos(view.base.t)) add('base', missOl(bx, y, baseW, baseH));
  at.baseTop = y;
  let domW = baseW;
  let domDash = false;
  const domain = view.spreading;
  if (domain.mode === 'Manual' && pos(domain.area_mm2)) {
    domW = clamp(Math.sqrt(domain.area_mm2) * s, entryW, baseW);
  }
  if (domain.mode === 'HeatShare') {
    domW = Math.min(baseW, Math.max(entryW * 2.2, entryW + 40));
    domDash = true;
  }
  add(
    'spread',
    <path
      d={`M${r1(cx - entryW / 2)} ${r1(y)} L${r1(cx + entryW / 2)} ${r1(y)} L${r1(cx + domW / 2)} ${r1(y + baseH)} L${r1(cx - domW / 2)} ${r1(y + baseH)} Z`}
      fill={url(ids.heatGrad)}
      stroke={domDash ? 'var(--hp-heat)' : undefined}
      strokeDasharray={domDash ? '4 3' : undefined}
      strokeWidth={domDash ? 1.4 : undefined}
    />,
  );
  if (domain.mode === 'Manual' && !pos(domain.area_mm2)) add('spread', missOl(cx - entryW / 2, y, entryW, baseH));
  dims.spread = hdim(
    cx - domW / 2,
    cx + domW / 2,
    y + baseH + 82,
    domain.mode === 'WholeBase'
      ? `整片底座 ${fMm(view.base.L)} × ${fMm(view.base.W)} mm`
      : domain.mode === 'Manual'
        ? `√A ≈ ${pos(domain.area_mm2) ? fMm(Math.sqrt(domain.area_mm2)) : '—'} mm（每顆 ${fA(domain.area_mm2)} mm²）`
        : '面積由 07 求解後決定',
    [
      [cx - domW / 2, y + baseH],
      [cx + domW / 2, y + baseH],
    ],
  );
  if (m.type === 'EmbeddedHeatPipe' || m.type === 'SmallBaseHeatPipe') {
    const embedded = m.type === 'EmbeddedHeatPipe';
    const pw = embedded ? fpW : Math.max(fpW * 0.7, 24);
    const px0 = cx - pw / 2;
    const px1 = bx + baseW - 4;
    add(
      'pipe',
      <rect className="sh" x={r1(px0)} y={r1(y + 4)} width={r1(px1 - px0)} height="15" rx="7.5" fill={url(ids.wick)} />,
    );
    add(
      'pipe',
      <path
        d={`M${r1(cx + pw / 2 + 6)} ${r1(y + 11.5)} H${r1(px1 - 10)}`}
        stroke="#fff"
        strokeWidth="1.8"
        markerEnd={url(ids.heatArr)}
        opacity=".9"
      />,
    );
    if (missM('pipe')) add('pipe', missOl(px0, y + 4, px1 - px0, 15));
    labs.push({
      layer: 'pipe',
      y: y + 11.5,
      xr: px1,
      t: embedded ? `熱管 ×${view.pipes}` : '熱管',
      s: embedded
        ? `${fMm(m.contact_L_mm)}×${fMm(m.contact_W_mm)} mm／根・並排`
        : '焊在小基座下、帶熱到別處',
      ...rLab(segOf(view, 'pipe')),
    });
    if (embedded) {
      dims.mL = hdim(px0, px0 + pw, y + baseH + 16, `元件下方熱管長 ${fMm(m.contact_L_mm)} mm`, [
        [px0, y + 14],
        [px0 + pw, y + 14],
      ]);
      dims.mW = tagNote(cx, y + baseH / 2 + 6, `單根寬 ${fMm(m.contact_W_mm)} mm × ${view.pipes} 根（進紙面方向並排）`);
    }
  }
  labs.push({
    layer: 'base',
    y: y + baseH * 0.62,
    xr: bx + baseW,
    t: '散熱器底座',
    s: `${fMm(view.base.L)}×${fMm(view.base.W)}×${fMm(view.base.t)} mm・${SPREADING_DOMAIN_LABELS[domain.mode].zh}`,
    r: '05 計算',
    rc: 'later',
  });
  y += baseH;

  // ---- Fins ----
  const finH = 100;
  const nf = clamp(Math.round(baseW / 26), 6, 14);
  const fw = 6;
  const fins: ReactNode[] = Array.from({ length: nf }, (_, i) => (
    <rect
      key={i}
      className="sh"
      x={r1(bx + ((i + 0.5) * baseW) / nf - fw / 2)}
      y={r1(y)}
      width={fw}
      height={finH}
      rx="2"
      fill="var(--hp-fin)"
    />
  ));
  if (broken) {
    const zigzag = (x: number, key: string) => {
      let d = `M${r1(x)} ${r1(at.baseTop - 4)}`;
      for (let k = 0, yy = at.baseTop - 4; yy < y + finH + 4; k++) {
        yy += 8;
        d += ` L${r1(x + (k % 2 ? -5 : 5))} ${r1(yy)}`;
      }
      return (
        <Fragment key={key}>
          <path d={d} stroke="var(--hp-viz-bg)" strokeWidth="5" fill="none" />
          <path d={d} stroke="var(--color-ink-400)" strokeWidth="1" fill="none" />
        </Fragment>
      );
    };
    fins.push(zigzag(bx + 2, 'zl'), zigzag(bx + baseW - 2, 'zr'));
  }
  add('fins', fins);
  labs.push({
    layer: 'fins',
    y: y + finH * 0.45,
    xr: bx + baseW,
    t: '鰭片',
    s: '對流到環境（06 設定）',
    r: '07 計算',
    rc: 'later',
  });
  y += finH;
  add(
    'fins',
    <g>
      {[0, 1, 2].map((i) => {
        const ax = cx - 70 + i * 70;
        return (
          <path
            key={i}
            d={`M${ax} ${r1(y + 4)} q6 8 0 16 q-6 8 0 16`}
            stroke="var(--hp-air)"
            strokeWidth="2"
            fill="none"
            markerEnd={url(ids.airArr)}
          />
        );
      })}
      <text className="svg-txt" x={cx + 110} y={r1(y + 26)}>
        環境空氣
      </text>
    </g>,
  );
  y += 44;

  // ---- Heat flow ----
  let flow: ReactNode = (
    <path
      className="flowline"
      d={`M${r1(at.die.x)} ${r1(at.die.y + 4)} V${r1(at.baseTop + 16)}`}
      markerEnd={url(ids.heatArr)}
    />
  );
  if (path === 'DirectMetal' && contact === 'PerimeterFrame') {
    // No contact in the middle: heat has to reach the frame first.
    const lw = pos(view.metal.perimeter_land_width_mm) ? Math.max(view.metal.perimeter_land_width_mm * s, 5) : 6;
    const side = (x: number) => (
      <path
        key={x}
        className="flowline"
        d={`M${r1(cx)} ${r1(at.die.y)} Q${r1((cx + x) / 2)} ${r1(at.face.y - 6)} ${r1(x)} ${r1(at.face.y)} V${r1(at.baseTop + 16)}`}
        markerEnd={url(ids.heatArr)}
      />
    );
    flow = [side(pkgX + lw / 2), side(pkgX + pkgW - lw / 2)];
  }

  // ---- Where the limit is read ----
  const loc = view.refLoc ?? 'Center';
  const refX = loc === 'Left' ? pkgX + pkgW * 0.15 : loc === 'Right' ? pkgX + pkgW * 0.85 : cx;
  const pt =
    view.limitType === 'Tj'
      ? view.junction
        ? at.die
        : { x: cx, y: (at.pkgTop + at.pkgBot) / 2 }
      : { x: view.limitType === 'Tc' ? cx + Math.min(pkgW * 0.25, 30) : refX, y: at.face.y };
  dims.rjc = view.junction ? vdim(cx + dieW / 2 + 10, at.die.y, at.face.y, `Rjc ${fR(segOf(view, 'rjc')?.R ?? null)} °C/W`, 'right') : null;

  const height = Math.max(y, 420);
  const order: HeatLayer[] = ['fins', 'base', 'spread', 'pipe', 'mount', 'joint', 'tim', 'pcb', 'via', 'coin', 'solder', 'pkg', 'face', 'die', 'exposed'];
  return {
    viewBox: `0 0 ${VIEWBOX_W} ${r1(height)}`,
    layers: bag.ordered(order),
    flow,
    probe: probeTag(pt, view, 16),
    labels: placeLabels(labs, height),
    dim: (key) => (key ? (dims[key] ?? null) : null),
  };
}

// ---------------------------------------------------------------------------
// 3D exploded stack
// ---------------------------------------------------------------------------

interface Slab {
  layer: HeatLayer;
  kind: 'box' | 'fins' | 'ring';
  L: number;
  W: number;
  h: number;
  color?: string;
  lw?: number;
  miss?: boolean;
  hot?: boolean;
  faded?: boolean;
  clipped?: boolean;
  noGap?: boolean;
  inlay?: { L: number; W: number; color: string; layer: HeatLayer };
  vias?: { L: number; W: number };
  outline?: { L: number; W: number };
  die?: { L: number; W: number };
  z0: number;
  z1: number;
}

type Pt = [number, number];

export function draw3D(view: HeatPathView, ids: SvgIds, az: number): Drawing {
  const bag = layerBag();
  const m = view.mount;
  const { L, W, H } = view.pkg;
  const path = view.heatPath;
  const eL = view.sourceFace.L;
  const eW = view.sourceFace.W;
  const A = (az * Math.PI) / 180;
  const cosA = Math.cos(A);
  const sinA = Math.sin(A);
  const sinE = 0.5;
  const cosE = 0.866;
  const P = (x: number, y: number, z: number): Pt => [x * cosA - y * sinA, (x * sinA + y * cosA) * sinE - z * cosE];

  const footprints: Array<number | null> = [L, W];
  if (path === 'Coin') footprints.push(view.coin.L, view.coin.W);
  if (path === 'Board') footprints.push(view.spreadFace.L, view.spreadFace.W);
  if (m.type !== 'Direct' && m.type !== 'EmbeddedHeatPipe') footprints.push(m.contact_L_mm, m.contact_W_mm);
  const maxD = Math.max(...footprints.filter(pos), 4);
  const s = Math.min(150 / maxD, 10);
  const mm = (v: number | null, fallback: number) => (pos(v) ? v * s : fallback);

  const slabs: Slab[] = [];
  const gap = 16;
  let z = 0;
  const push = (slab: Omit<Slab, 'z0' | 'z1'>): Slab => {
    const placed = { ...slab, z0: z, z1: z + slab.h } as Slab;
    z = placed.z1 + (slab.noGap ? 0 : gap);
    slabs.push(placed);
    return placed;
  };

  const baseL = pos(view.base.L) ? view.base.L : maxD * 1.6;
  const baseW = pos(view.base.W) ? view.base.W : maxD * 1.6;
  const visL = Math.min(baseL, maxD * 1.6);
  const visW = Math.min(baseW, maxD * 1.6);
  const clipped = visL < baseL || visW < baseW;
  push({ layer: 'fins', kind: 'fins', L: visL * s, W: visW * s, h: 34, noGap: true });
  push({ layer: 'base', kind: 'box', L: visL * s, W: visW * s, h: 18, color: 'var(--hp-base)', clipped });
  const fpL = mm(m.contact_L_mm, mm(L, 60) + 20);
  const fpW = mm(m.contact_W_mm, mm(W, 60) + 20);
  const missOf = (id: SegmentId) => (segOf(view, id)?.missing.length ?? 0) > 0;
  const jointColor = view.jointTimName == null ? 'var(--hp-dry)' : 'var(--hp-tim)';
  if (m.type === 'Pedestal') {
    if (m.attachment === 'Bolted') push({ layer: 'joint', kind: 'box', L: fpL, W: fpW, h: 3, color: jointColor });
    push({
      layer: 'mount',
      kind: 'box',
      L: fpL,
      W: fpW,
      h: pos(m.height_mm) ? clamp(m.height_mm * 5, 8, 34) : 18,
      color: m.attachment === 'Bolted' ? 'var(--hp-mount)' : 'var(--hp-base)',
      miss: missOf('block'),
    });
  } else if (m.type === 'SmallBaseHeatPipe' || m.type === 'VaporChamber') {
    push({ layer: 'joint', kind: 'box', L: fpL, W: fpW, h: 3, color: jointColor });
    if (m.type === 'VaporChamber') {
      push({ layer: 'pipe', kind: 'box', L: fpL, W: fpW, h: 8, color: 'var(--hp-pipe)', miss: missOf('vc') });
    } else {
      push({
        layer: 'mount',
        kind: 'box',
        L: fpL,
        W: fpW,
        h: pos(m.height_mm) ? clamp(m.height_mm * 4, 8, 26) : 14,
        color: 'var(--hp-mount)',
        miss: missOf('block'),
      });
    }
  }

  const tk = view.tim.kind;
  const timL = path === 'Coin' ? mm(view.coin.L, mm(L, 60) + 20) : path === 'Board' ? mm(view.spreadFace.L, mm(eL, 30) + 10) : mm(L, 60);
  const timWd = path === 'Coin' ? mm(view.coin.W, mm(W, 30) + 20) : path === 'Board' ? mm(view.spreadFace.W, mm(eW, 30) + 10) : mm(W, 60);
  const timColor = tk === 'direct' ? 'var(--hp-dry)' : 'var(--hp-tim)';
  const contact = view.metal.contact_geometry;
  if (path === 'DirectMetal' && contact === 'PerimeterFrame') {
    push({
      layer: 'tim',
      kind: 'ring',
      L: timL,
      W: timWd,
      lw: Math.max((pos(view.metal.perimeter_land_width_mm) ? view.metal.perimeter_land_width_mm : 3) * s, 3),
      h: 4,
      color: timColor,
    });
  } else if (path === 'DirectMetal' && contact === 'CustomArea') {
    const area = view.metal.custom_contact_area_mm2;
    const r = pos(area) && pos(L) && pos(W) ? Math.sqrt(clamp(area / (L * W), 0.04, 1)) : 0.6;
    push({ layer: 'tim', kind: 'box', L: timL * r, W: timWd * r, h: 4, color: timColor });
  } else {
    push({
      layer: 'tim',
      kind: 'box',
      L: timL,
      W: timWd,
      h: tk === 'material' ? clamp(3 + (view.tim.blt ?? 0.1) * 4, 3, 10) : 3,
      color: timColor,
      miss: tk === 'none' || tk === 'missing',
    });
  }

  if (path === 'Coin') {
    const coinL = mm(view.coin.L, mm(L, 60) + 20);
    const coinW = mm(view.coin.W, mm(W, 30) + 20);
    push({
      layer: 'pcb',
      kind: 'box',
      L: coinL + 40,
      W: coinW + 40,
      h: 14,
      color: 'var(--hp-pcb)',
      inlay: { L: coinL, W: coinW, color: 'var(--hp-coin)', layer: 'coin' },
    });
    push({ layer: 'solder', kind: 'box', L: mm(L, 60), W: mm(W, 30), h: 4, color: 'var(--hp-solder)' });
    push({ layer: 'face', kind: 'box', L: mm(L, 60), W: mm(W, 30), h: 3, color: 'var(--hp-face)', noGap: true });
  } else if (path === 'Board') {
    const spL = mm(view.spreadFace.L, mm(eL, 30) + 10);
    const spW = mm(view.spreadFace.W, mm(eW, 30) + 10);
    push({
      layer: 'pcb',
      kind: 'box',
      L: Math.max(spL, mm(L, 40)) + 36,
      W: Math.max(spW, mm(W, 40)) + 36,
      h: 12,
      color: 'var(--hp-pcb)',
      vias: { L: mm(eL, 20), W: mm(eW, 20) },
      outline: { L: spL, W: spW },
      miss: !pos(view.boardThickness),
    });
    push({ layer: 'face', kind: 'box', L: mm(eL, 20), W: mm(eW, 20), h: 3, color: 'var(--hp-face)', miss: !pos(eL) || !pos(eW) });
  } else {
    push({ layer: 'face', kind: 'box', L: mm(L, 60), W: mm(W, 60), h: path === 'DirectMetal' ? 4 : 3, color: 'var(--hp-face)', noGap: true });
  }
  const pkgH = clamp((pos(H) ? H : 2) * (path === 'DirectMetal' ? 1.2 : 6), 10, 40);
  const pk = push({
    layer: 'pkg',
    kind: 'box',
    L: mm(L, 60),
    W: mm(W, 60),
    h: pkgH,
    color: view.junction ? 'var(--hp-pkg)' : 'var(--hp-die)',
    hot: !view.junction,
    miss: !pos(L) || !pos(W),
  });
  if (path === 'TopSurface' && view.junction) z += 18;
  if (path === 'TopSurface') {
    push({ layer: 'pcb', kind: 'box', L: mm(L, 60) + 50, W: mm(W, 60) + 50, h: 10, color: 'var(--hp-pcb)', faded: true });
  }
  // The die floats above its package so it can be seen at all.
  if (view.junction) pk.die = { L: Math.max(pk.L * 0.34, 8), W: Math.max(pk.W * 0.34, 8) };

  const ptsAttr = (pts: Pt[]) => pts.map((p) => `${r1(p[0])},${r1(p[1])}`).join(' ');
  const shade = (pts: Pt[], fill: string, dark: number, faded = false, key?: string) => (
    <Fragment key={key}>
      <polygon className="sh" points={ptsAttr(pts)} fill={fill} opacity={faded ? 0.5 : undefined} />
      {dark > 0 && <polygon points={ptsAttr(pts)} fill="#000" opacity={dark} pointerEvents="none" />}
    </Fragment>
  );
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, fill: string, faded = false, key?: string) => {
    const faces: ReactNode[] = [];
    if (sinA < 0) faces.push(shade([P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)], fill, 0.3, faded, 'a'));
    if (sinA > 0) faces.push(shade([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], fill, 0.3, faded, 'b'));
    if (cosA < 0) faces.push(shade([P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], fill, 0.16, faded, 'c'));
    if (cosA > 0) faces.push(shade([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], fill, 0.16, faded, 'd'));
    faces.push(shade([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], fill, 0, faded, 'e'));
    return <Fragment key={key}>{faces}</Fragment>;
  };
  const top = (x0: number, x1: number, y0: number, y1: number, zz: number, fill: string, extra: Record<string, string | number> = {}, key?: string) => (
    <polygon key={key} className="sh" points={ptsAttr([P(x0, y0, zz), P(x1, y0, zz), P(x1, y1, zz), P(x0, y1, zz)])} fill={fill} {...extra} />
  );
  const missTop = (x0: number, x1: number, y0: number, y1: number, zz: number) => (
    <polygon className="miss-ol" points={ptsAttr([P(x0, y0, zz), P(x1, y0, zz), P(x1, y1, zz), P(x0, y1, zz)])} fill={url(ids.hatchMiss)} />
  );

  const labs: Array<LabelItem & { p: Pt }> = [];
  const anchors: { die?: Pt; pkg?: Pt; baseTop?: Pt } = {};
  const domain = view.spreading;

  for (const sl of slabs) {
    const hx = sl.L / 2;
    const hy = sl.W / 2;
    if (sl.kind === 'fins') {
      const nf = 9;
      const ft = 3;
      const order = [...Array(nf).keys()]
        .map((i) => -hy + ((i + 0.5) * (2 * hy)) / nf)
        .sort((a, b) => a * cosA - b * cosA);
      bag.add('fins', order.map((fy, i) => box(-hx, hx, fy - ft / 2, fy + ft / 2, sl.z0, sl.z1, 'var(--hp-fin)', false, `f${i}`)));
    } else if (sl.kind === 'ring') {
      const lw = sl.lw ?? 3;
      const parts: Array<[number, number, number, number]> = [
        [-hx, hx, -hy, -hy + lw],
        [-hx, hx, hy - lw, hy],
        [-hx, -hx + lw, -hy + lw, hy - lw],
        [hx - lw, hx, -hy + lw, hy - lw],
      ];
      parts.sort((a, b) => P((a[0] + a[1]) / 2, (a[2] + a[3]) / 2, 0)[1] - P((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, 0)[1]);
      bag.add(sl.layer, parts.map((p, i) => box(p[0], p[1], p[2], p[3], sl.z0, sl.z1, sl.color ?? '', false, `r${i}`)));
    } else {
      bag.add(sl.layer, box(-hx, hx, -hy, hy, sl.z0, sl.z1, sl.color ?? '', sl.faded));
      if (sl.hot) bag.add(sl.layer, top(-hx * 0.6, hx * 0.6, -hy * 0.6, hy * 0.6, sl.z1, 'var(--hp-heat)', { opacity: 0.45 }));
      if (sl.miss) bag.add(sl.layer, missTop(-hx, hx, -hy, hy, sl.z1));
    }

    if (sl.layer === 'base') {
      let dL = sl.L;
      let dW = sl.W;
      let dash: Record<string, string | number> = { stroke: 'var(--hp-heat)', strokeOpacity: 0.5, strokeWidth: 1 };
      if (domain.mode === 'Manual' && pos(domain.area_mm2)) {
        const side = Math.sqrt(domain.area_mm2) * s;
        dL = Math.min(side, sl.L);
        dW = Math.min(side, sl.W);
      }
      if (domain.mode === 'HeatShare') {
        dL = Math.min(sl.L, fpL * 1.8);
        dW = Math.min(sl.W, fpW * 1.8);
        dash = { stroke: 'var(--hp-heat)', strokeDasharray: '5 4', strokeWidth: 1.5 };
      }
      bag.add('spread', top(-dL / 2, dL / 2, -dW / 2, dW / 2, sl.z1, url(ids.heatSpot), dash));
      if (domain.mode === 'Manual' && !pos(domain.area_mm2)) bag.add('spread', missTop(-fpL / 2, fpL / 2, -fpW / 2, fpW / 2, sl.z1));
      if (m.type === 'EmbeddedHeatPipe' || m.type === 'SmallBaseHeatPipe') {
        const embedded = m.type === 'EmbeddedHeatPipe';
        const n = embedded ? view.pipes : 1;
        const pw = mm(m.contact_W_mm, 8) * (embedded ? 1 : 0.5);
        const pL0 = -(embedded ? mm(m.contact_L_mm, 40) : fpL) / 2;
        bag.add(
          'pipe',
          Array.from({ length: n }, (_, i) => {
            const yc = (i - (n - 1) / 2) * (pw + 4);
            return top(pL0, hx, yc - pw / 2, yc + pw / 2, sl.z1 + 0.5, url(ids.wick), {}, `p${i}`);
          }),
        );
        if (missOf('pipe')) bag.add('pipe', missTop(pL0, hx, -pw, pw, sl.z1));
        labs.push({
          layer: 'pipe',
          p: P(hx, 0, sl.z1),
          y: 0,
          xr: 0,
          t: embedded ? `熱管 ×${view.pipes}` : '熱管',
          s: `${fMm(m.contact_L_mm)}×${fMm(m.contact_W_mm)} mm`,
          ...rLab(segOf(view, 'pipe')),
        });
      }
      if (sl.clipped) {
        const p1 = P(-hx, hy, sl.z0);
        const p2 = P(hx, hy, sl.z0);
        bag.add(
          'base',
          <text className="svg-txt" x={r1((p1[0] + p2[0]) / 2)} y={r1(Math.max(p1[1], p2[1]) + 52)} textAnchor="middle">
            底座只畫局部（整片 {fMm(view.base.L)} × {fMm(view.base.W)} mm）
          </text>,
        );
      }
    }
    if (sl.inlay) {
      bag.add(sl.inlay.layer, top(-sl.inlay.L / 2, sl.inlay.L / 2, -sl.inlay.W / 2, sl.inlay.W / 2, sl.z1 + 0.3, sl.inlay.color));
      labs.push({
        layer: 'coin',
        p: P(sl.inlay.L / 2, 0, sl.z1),
        y: 0,
        xr: 0,
        t: '銅塊',
        s: `${fMm(view.coin.L)}×${fMm(view.coin.W)}×${fMm(view.coin.t)} mm`,
        ...rLab(segOf(view, 'coin')),
      });
    }
    if (sl.vias) {
      const nx = clamp(Math.round(sl.vias.L / 9), 2, 9);
      const ny = clamp(Math.round(sl.vias.W / 9), 2, 9);
      const dots: ReactNode[] = [];
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          const vx = -sl.vias.L / 2 + ((i + 0.5) * sl.vias.L) / nx;
          const vy = -sl.vias.W / 2 + ((j + 0.5) * sl.vias.W) / ny;
          const p = P(vx, vy, sl.z1 + 0.2);
          dots.push(<ellipse key={`${i}-${j}`} cx={r1(p[0])} cy={r1(p[1])} rx="2.4" ry="1.4" fill="var(--hp-via)" stroke="#fff" strokeWidth=".6" />);
        }
      }
      if (sl.outline) {
        const o = sl.outline;
        dots.push(
          <polygon
            key="outline"
            points={ptsAttr([P(-o.L / 2, -o.W / 2, sl.z1), P(o.L / 2, -o.W / 2, sl.z1), P(o.L / 2, o.W / 2, sl.z1), P(-o.L / 2, o.W / 2, sl.z1)])}
            fill="none"
            stroke="var(--hp-heat)"
            strokeWidth="1.4"
            strokeDasharray="4 3"
          />,
        );
      }
      bag.add('via', dots);
      labs.push({
        layer: 'via',
        p: P(sl.vias.L / 2, sl.vias.W / 2, sl.z1),
        y: 0,
        xr: 0,
        t: '導熱孔',
        s: `k ${view.via.k ?? '—'}・係數 ${view.via.eff ?? '—'}`,
        ...rLab(segOf(view, 'via')),
      });
    }
    if (sl.die) {
      const zz = sl.z1 + 14;
      bag.add(
        'die',
        <>
          {box(-sl.die.L / 2, sl.die.L / 2, -sl.die.W / 2, sl.die.W / 2, zz, zz + 5, 'var(--hp-die)')}
          <path
            d={`M${P(0, 0, zz).map(r1).join(' ')} L${P(0, 0, sl.z1).map(r1).join(' ')}`}
            stroke="var(--hp-die)"
            strokeDasharray="2 3"
            fill="none"
          />
        </>,
      );
      anchors.die = P(0, 0, zz + 5);
      labs.push({
        layer: 'die',
        p: P(sl.die.L / 2, 0, zz + 5),
        y: 0,
        xr: 0,
        t: '晶片（接面）',
        s: '封裝內，畫在上方',
        ...rLab(segOf(view, 'rjc')),
      });
    }
    const corners = [P(-hx, -hy, sl.z1), P(hx, -hy, sl.z1), P(hx, hy, sl.z1), P(-hx, hy, sl.z1)];
    const right = corners.reduce((a, b) => (b[0] > a[0] ? b : a));
    const title = layerTitle3D(sl, view);
    if (title) labs.push({ layer: sl.layer, p: [right[0], right[1] + Math.min(sl.h * cosE, 14) / 2], y: 0, xr: 0, ...title });
    if (sl.layer === 'pkg') anchors.pkg = P(0, 0, (sl.z0 + sl.z1) / 2);
    if (sl.layer === 'base') anchors.baseTop = P(0, 0, sl.z1);
  }

  // Fit the stack into the left 0..400 of the view box.
  const all: Pt[] = [];
  slabs.forEach((sl) => {
    const hx = sl.L / 2;
    const hy = sl.W / 2;
    for (const [x, yy] of [
      [-hx, -hy],
      [hx, -hy],
      [hx, hy],
      [-hx, hy],
    ]) {
      all.push(P(x, yy, sl.z0), P(x, yy, sl.z1));
    }
  });
  if (anchors.die) all.push(anchors.die);
  const minX = Math.min(...all.map((p) => p[0]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const maxY = Math.max(...all.map((p) => p[1]));
  const avail = 380;
  const scale = Math.min(1, avail / (maxX - minX + 20));
  const height = Math.max(440, (maxY - minY) * scale + 110);
  const tx = 18 + (avail - (maxX - minX) * scale) / 2 - minX * scale;
  const ty = 64 - minY * scale;
  const T = (p: Pt): Pt => [p[0] * scale + tx, p[1] * scale + ty];

  const from = anchors.die ?? anchors.pkg;
  const flow =
    from && anchors.baseTop ? (
      <path
        className="flowline"
        d={`M${r1(from[0])} ${r1(from[1])} L${r1(anchors.baseTop[0])} ${r1(anchors.baseTop[1])}`}
        markerEnd={url(ids.heatArr)}
        opacity=".85"
      />
    ) : null;

  const loc = view.refLoc ?? 'Center';
  let probePt: Pt;
  if (view.limitType === 'Tj') probePt = (anchors.die ?? anchors.pkg)!;
  else {
    const ox = loc === 'Left' ? -pk.L * 0.35 : loc === 'Right' ? pk.L * 0.35 : 0;
    probePt = P(view.limitType === 'Tc' ? pk.L * 0.2 : ox, pk.W * 0.25, pk.z0);
  }
  const pp = T(probePt);

  const seen = new Set<HeatLayer>();
  const unique = labs
    .map((label) => {
      const p = T(label.p);
      return { ...label, y: p[1], xr: p[0] };
    })
    .filter((label) => (seen.has(label.layer) ? false : (seen.add(label.layer), true)));

  return {
    viewBox: `0 0 ${VIEWBOX_W} ${r1(height)}`,
    transform: `translate(${r1(tx)} ${r1(ty)}) scale(${scale.toFixed(3)})`,
    layers: bag.ordered(['fins', 'base', 'spread', 'pipe', 'joint', 'mount', 'tim', 'pcb', 'coin', 'via', 'solder', 'face', 'pkg', 'die']),
    flow,
    probe: probeTag({ x: pp[0], y: pp[1] }, view, 30),
    labels: placeLabels(unique, height, 40),
    dim: (key) => dim3D(key, view, slabs, P, az, ids),
  };
}

function layerTitle3D(sl: Slab, view: HeatPathView): Omit<LabelItem, 'layer' | 'y' | 'xr'> | null {
  const m = view.mount;
  switch (sl.layer) {
    case 'pkg':
      return {
        t: view.junction ? (view.heatPath === 'DirectMetal' ? '本體' : '封裝本體') : '本體（熱源）',
        s: `${fMm(view.pkg.L)}×${fMm(view.pkg.W)}×${fMm(view.pkg.H)} mm`,
      };
    case 'face':
      return {
        t: PATH_FACE_LABEL[view.heatPath],
        s: `${fA(view.sourceArea)} mm²`,
        r: '',
        rc: pos(view.sourceArea) ? '' : 'miss',
      };
    case 'solder':
      return {
        t: '焊料',
        s: `${fMm(view.solder.t)} mm・有效 ${ok(view.solder.voiding) ? Math.round(view.solder.voiding * 100) : '—'}%`,
        ...rLab(segOf(view, 'solder')),
      };
    case 'pcb':
      return view.heatPath === 'TopSurface'
        ? { t: 'PCB', s: '元件裝在這面朝下', r: '不在熱路徑', rc: 'later' }
        : {
            t: 'PCB',
            s: view.heatPath === 'Board' ? `板厚 ${fMm(view.boardThickness)} mm・虛線＝擴散面` : '銅塊嵌在板中',
          };
    case 'tim':
      return {
        t: view.tim.kind === 'direct' ? '乾式接觸' : 'TIM',
        s:
          view.tim.kind === 'material'
            ? `${view.tim.name}・BLT ${fMm(view.tim.blt)} mm`
            : view.heatPath === 'DirectMetal'
              ? { FullBase: '完整底面', PerimeterFrame: '外圍框', CustomArea: '自訂面積' }[view.metal.contact_geometry]
              : timSubtitle(view),
        ...rLab(segOf(view, 'tim')),
      };
    case 'mount':
      return {
        t: m.type === 'Pedestal' ? '凸台' : '小基座',
        s: `${fMm(m.contact_L_mm)}×${fMm(m.contact_W_mm)}×${fMm(m.height_mm)} mm`,
        ...rLab(segOf(view, 'block')),
      };
    case 'joint':
      return {
        t: '接合面',
        s: view.jointTimName ? `BLT ${fMm(m.joint_blt_mm)} mm` : '乾接觸',
        ...rLab(segOf(view, 'joint')),
      };
    case 'pipe':
      return { t: '均熱板', s: `${fMm(m.contact_L_mm)}×${fMm(m.contact_W_mm)} mm`, ...rLab(segOf(view, 'vc')) };
    case 'base':
      return {
        t: '散熱器底座',
        s: `${SPREADING_DOMAIN_LABELS[view.spreading.mode].zh}・橘色＝擴散範圍`,
        r: '05 計算',
        rc: 'later',
      };
    case 'fins':
      return { t: '鰭片', s: '06 設定', r: '07 計算', rc: 'later' };
    default:
      return null;
  }
}

function dim3D(
  key: DimKey | null,
  view: HeatPathView,
  slabs: Slab[],
  P: (x: number, y: number, z: number) => Pt,
  az: number,
  ids: SvgIds,
): ReactNode {
  if (!key) return null;
  const find = (layer: HeatLayer) => slabs.find((sl) => sl.layer === layer);
  const edge = (sl: Slab | undefined, which: 'L' | 'W' | 'H', text: string) => {
    if (!sl) return null;
    const hx = sl.L / 2;
    const hy = sl.W / 2;
    let a: Pt;
    let b: Pt;
    if (which === 'L') {
      const yy = Math.cos((az * Math.PI) / 180) > 0 ? hy : -hy;
      a = P(-hx, yy, sl.z1);
      b = P(hx, yy, sl.z1);
    } else if (which === 'W') {
      const xx = Math.sin((az * Math.PI) / 180) > 0 ? hx : -hx;
      a = P(xx, -hy, sl.z1);
      b = P(xx, hy, sl.z1);
    } else {
      const corner = (
        [
          [-hx, -hy],
          [hx, -hy],
          [hx, hy],
          [-hx, hy],
        ] as Array<[number, number]>
      )
        .map(([x, y]) => P(x, y, sl.z0))
        .reduce((p, q) => (q[1] > p[1] ? q : p));
      a = corner;
      b = [corner[0], corner[1] - (sl.z1 - sl.z0) * 0.866];
    }
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const tw = textW(text, 11.5) + 12;
    return (
      <g className="dim">
        <line x1={r1(a[0])} y1={r1(a[1])} x2={r1(b[0])} y2={r1(b[1])} strokeWidth="3" />
        <line
          x1={r1(a[0])}
          y1={r1(a[1])}
          x2={r1(b[0])}
          y2={r1(b[1])}
          markerStart={url(ids.arr)}
          markerEnd={url(ids.arr)}
        />
        <rect x={r1(mx - tw / 2)} y={r1(my + 6)} width={r1(tw)} height="16" rx="4" />
        <text x={r1(mx)} y={r1(my + 18)} textAnchor="middle">
          {text}
        </text>
      </g>
    );
  };
  const m = view.mount;
  switch (key) {
    case 'pkgL':
      return edge(find('pkg'), 'L', `L ${fMm(view.pkg.L)} mm`);
    case 'pkgW':
      return edge(find('pkg'), 'W', `W ${fMm(view.pkg.W)} mm`);
    case 'pkgH':
      return edge(find('pkg'), 'H', `H ${fMm(view.pkg.H)} mm`);
    case 'eL':
      return edge(find('face'), 'L', `E-PAD 長 ${fMm(view.sourceFace.L)}`);
    case 'eW':
      return edge(find('face'), 'W', `E-PAD 寬 ${fMm(view.sourceFace.W)}`);
    case 'boardT':
      return edge(find('pcb'), 'H', `t ${fMm(view.boardThickness)} mm`);
    case 'blt':
      return edge(find('tim'), 'H', `BLT ${view.tim.kind === 'material' ? fMm(view.tim.blt) : '—'} mm`);
    case 'mL':
      return edge(find('mount') ?? find('pipe'), 'L', `長 ${fMm(m.contact_L_mm)} mm`);
    case 'mW':
      return edge(find('mount') ?? find('pipe'), 'W', `寬 ${fMm(m.contact_W_mm)} mm`);
    case 'mH':
      return edge(find('mount'), 'H', `高 ${fMm(m.height_mm)} mm`);
    case 'landW':
      return edge(find('tim'), 'W', `邊寬 ${fMm(view.metal.perimeter_land_width_mm)} mm`);
    default:
      return null;
  }
}
