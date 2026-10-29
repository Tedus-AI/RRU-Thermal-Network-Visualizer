/**
 * Tile icons and short names for the heat path and mount choices in Screen 04.
 *
 * Each icon is the same stack the drawing shows, a size smaller, in the same
 * layer colours and drawn by the same solids (`isoSolid`), at the drawing's
 * default turn — so the tile picked and the picture beside it read as one.
 * The sizes are a sketch of the build, not the part's dimensions.
 */

import type { ReactNode } from 'react';

import type { HeatPathType, MountType } from '@/domain/component';
import { solidKit, type Pt } from './isoSolid';

export const HEAT_PATH_SHORT: Record<HeatPathType, { name: string; sub: string }> = {
  Coin: { name: '銅塊焊接', sub: '往下・PA 常用' },
  Board: { name: '板級導熱孔', sub: '往下・經 PCB' },
  TopSurface: { name: '元件表面', sub: '頂面朝散熱器' },
  DirectMetal: { name: '金屬散熱面', sub: '底板・法蘭・模組' },
};

export const MOUNT_SHORT: Record<MountType, string> = {
  Direct: '直接貼合',
  Pedestal: '凸台',
  SmallBaseHeatPipe: '小基座＋熱管',
  EmbeddedHeatPipe: '底座埋熱管',
  VaporChamber: '均熱板',
};

const AZ = (35 * Math.PI) / 180;
const SIN = Math.sin(AZ);
const COS = Math.cos(AZ);
const project = (x: number, y: number, z: number): Pt => [x * COS - y * SIN, (x * SIN + y * COS) * 0.5 - z * 0.866];
const kit = solidKit(project, SIN, COS);
const EDGE = 'rgba(15, 27, 48, 0.45)';

/** One layer of a tile: a block `L` × `W` × `h` from `z`, centred on (`cx`, `cy`). */
interface Block {
  L: number;
  W: number;
  z: number;
  h: number;
  fill: string;
  cx?: number;
  cy?: number;
  r?: number;
  faded?: boolean;
  /** Drawn as a face flush with the surface it sits in (a coin, an embedded pipe). */
  flush?: boolean;
  /** Via barrels seen on its top face, `cols` × `rows` across the middle `L` × `W`. */
  vias?: { cols: number; rows: number; L: number; W: number };
}

type Layer = Omit<Block, 'z'> & {
  /** Sits directly on the layer below instead of floating a gap above it. */
  on?: boolean;
};

/**
 * Stacks a tile's layers bottom to top, each a gap above the last (as the 3D view floats them),
 * except where a layer sits `on` the one below; a `flush` face lies in the top of the last solid.
 */
function stack(layers: Layer[], gap = 4): Block[] {
  let top = 0;
  return layers.map((layer, i) => {
    if (layer.flush) return { ...layer, z: top };
    const z = i === 0 || layer.on ? top : top + gap;
    top = z + layer.h;
    return { ...layer, z };
  });
}

const BASE = (h = 5): Layer => ({ L: 60, W: 40, h, fill: 'var(--hp-base)', r: 2 });
const PKG = (L: number, W: number, h = 5): Layer => ({ L, W, h, fill: 'var(--hp-pkg)', r: 1 });
const TIM = (L: number, W: number): Layer => ({ L, W, h: 1.4, fill: 'var(--hp-tim)' });

const STACKS: Record<HeatPathType | MountType, Block[]> = {
  Coin: stack([
    BASE(),
    TIM(34, 26),
    { L: 50, W: 34, h: 3.5, fill: 'var(--hp-pcb)', r: 1.5 },
    { L: 34, W: 26, h: 0, fill: 'var(--hp-coin)', flush: true },
    { L: 24, W: 12, h: 1.2, fill: 'var(--hp-solder)' },
    { ...PKG(24, 12), on: true },
  ]),
  Board: stack([
    BASE(),
    TIM(36, 28),
    { L: 50, W: 34, h: 3.5, fill: 'var(--hp-pcb)', r: 1.5, vias: { cols: 3, rows: 2, L: 14, W: 9 } },
    { L: 16, W: 12, h: 0.8, fill: 'var(--hp-face)' },
    { ...PKG(22, 16), on: true },
  ]),
  TopSurface: stack([
    BASE(),
    TIM(26, 20),
    { L: 26, W: 20, h: 0.8, fill: 'var(--hp-face)', on: true },
    { ...PKG(26, 20), on: true },
    { L: 50, W: 34, h: 3, fill: 'var(--hp-pcb)', r: 1.5, faded: true },
  ]),
  DirectMetal: stack([
    BASE(),
    TIM(44, 30),
    { L: 44, W: 30, h: 0.8, fill: 'var(--hp-face)' },
    { ...PKG(44, 30, 9), r: 2, on: true },
  ]),
  Direct: stack([BASE(6), TIM(24, 18), { ...PKG(24, 18), on: true }]),
  Pedestal: stack([BASE(), { L: 28, W: 22, h: 5, fill: 'var(--hp-base)', r: 1.5, on: true }, TIM(22, 16), { ...PKG(22, 16), on: true }]),
  SmallBaseHeatPipe: stack([
    BASE(),
    { L: 44, W: 6, h: 2.4, fill: 'var(--hp-pipe)', cx: 8, r: 2.4, on: true },
    { L: 30, W: 22, h: 4, fill: 'var(--hp-mount)', r: 1.5, on: true },
    TIM(22, 16),
    { ...PKG(22, 16), on: true },
  ]),
  EmbeddedHeatPipe: stack([
    BASE(6),
    { L: 44, W: 5, h: 0, fill: 'var(--hp-pipe)', cx: 6, cy: -4.5, r: 2.4, flush: true },
    { L: 44, W: 5, h: 0, fill: 'var(--hp-pipe)', cx: 6, cy: 4.5, r: 2.4, flush: true },
    TIM(24, 18),
    { ...PKG(24, 18), on: true },
  ]),
  VaporChamber: stack([BASE(), { L: 48, W: 32, h: 3, fill: 'var(--hp-pipe)', r: 1.5 }, TIM(22, 16), { ...PKG(22, 16), on: true }]),
};

function drawBlock(block: Block, key: number): ReactNode {
  const x0 = (block.cx ?? 0) - block.L / 2;
  const x1 = x0 + block.L;
  const y0 = (block.cy ?? 0) - block.W / 2;
  const y1 = y0 + block.W;
  if (block.flush) {
    const face = kit.rounded(x0, x1, y0, y1, block.r ?? 0.8).map((p) => project(p[0], p[1], block.z + 0.05));
    return <path key={key} d={kit.pathD(face)} fill={block.fill} stroke={EDGE} strokeWidth={0.6} strokeLinejoin="round" />;
  }
  const solid = kit.box(x0, x1, y0, y1, block.z, block.z + block.h, block.fill, block.faded, String(key), block.r ?? 0.6, EDGE);
  if (!block.vias) return solid;
  const { cols, rows, L, W } = block.vias;
  const top = block.z + block.h;
  const barrels = Array.from({ length: cols * rows }, (_, i) => {
    const vx = -L / 2 + ((i % cols) + 0.5) * (L / cols);
    const vy = -W / 2 + (Math.floor(i / cols) + 0.5) * (W / rows);
    return kit.pathD(kit.circle(vx, vy, 1.6, 12).map((p) => project(p[0], p[1], top)));
  });
  return (
    <g key={key}>
      {solid}
      <path d={barrels.join('')} fill="var(--hp-via)" stroke="#fff" strokeWidth={0.4} />
    </g>
  );
}

/** Fits a stack into the 64 × 34 tile: every block's corners, projected, inside a 1.5-unit margin. */
function fitOf(blocks: Block[]): string {
  const points = blocks.flatMap((b) =>
    [-1, 1].flatMap((sx) =>
      [-1, 1].flatMap((sy) => [b.z, b.z + b.h].map((z) => project((b.cx ?? 0) + (sx * b.L) / 2, (b.cy ?? 0) + (sy * b.W) / 2, z))),
    ),
  );
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((64 - 3) / (maxX - minX), (34 - 3) / (maxY - minY));
  const tx = 32 - ((minX + maxX) / 2) * scale;
  const ty = 17 - ((minY + maxY) / 2) * scale;
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(3)})`;
}

const ICONS = Object.fromEntries(
  (Object.keys(STACKS) as Array<HeatPathType | MountType>).map((kind) => [
    kind,
    <g key={kind} transform={fitOf(STACKS[kind])}>
      {STACKS[kind].map(drawBlock)}
    </g>,
  ]),
) as Record<HeatPathType | MountType, ReactNode>;

export function StackIcon({ kind, className }: { kind: HeatPathType | MountType; className?: string }) {
  return (
    <svg viewBox="0 0 64 34" aria-hidden className={className}>
      {ICONS[kind]}
    </svg>
  );
}
