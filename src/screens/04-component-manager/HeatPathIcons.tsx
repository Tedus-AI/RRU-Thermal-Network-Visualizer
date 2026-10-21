/**
 * Tile icons and short names for the heat path and mount choices in Screen 04.
 *
 * Each icon is the same stack the drawing shows, a size smaller, in the same
 * layer colours — so the tile picked and the picture beside it read as one.
 */

import type { ReactNode } from 'react';

import type { HeatPathType, MountType } from '@/domain/component';

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

const ICONS: Record<HeatPathType | MountType, ReactNode> = {
  Coin: (
    <>
      <rect x="18" y="5" width="28" height="9" rx="1.5" fill="var(--hp-pkg)" />
      <rect x="18" y="14" width="28" height="2.5" fill="var(--hp-solder)" />
      <rect x="3" y="16.5" width="58" height="7" fill="var(--hp-pcb)" />
      <rect x="14" y="16.5" width="36" height="7" fill="var(--hp-coin)" />
      <rect x="14" y="23.5" width="36" height="2.5" fill="var(--hp-tim)" />
      <rect x="1" y="26" width="62" height="7" fill="var(--hp-base)" />
    </>
  ),
  Board: (
    <>
      <rect x="20" y="6" width="24" height="8" rx="1.5" fill="var(--hp-pkg)" />
      <rect x="24" y="14" width="16" height="2" fill="var(--hp-face)" />
      <rect x="3" y="16" width="58" height="7" fill="var(--hp-pcb)" />
      <g fill="var(--hp-via)">
        <rect x="25" y="16" width="2" height="7" />
        <rect x="31" y="16" width="2" height="7" />
        <rect x="37" y="16" width="2" height="7" />
      </g>
      <rect x="17" y="23" width="30" height="3" fill="var(--hp-tim)" />
      <rect x="1" y="26" width="62" height="7" fill="var(--hp-base)" />
    </>
  ),
  TopSurface: (
    <>
      <rect x="3" y="3" width="58" height="6" fill="var(--hp-pcb)" />
      <g fill="var(--hp-solder)">
        <circle cx="22" cy="10.5" r="1.4" />
        <circle cx="28" cy="10.5" r="1.4" />
        <circle cx="34" cy="10.5" r="1.4" />
        <circle cx="40" cy="10.5" r="1.4" />
      </g>
      <rect x="18" y="12" width="28" height="9" rx="1.5" fill="var(--hp-pkg)" />
      <rect x="18" y="20" width="28" height="2.2" fill="var(--hp-face)" />
      <rect x="18" y="22.2" width="28" height="3" fill="var(--hp-tim)" />
      <rect x="1" y="26" width="62" height="7" fill="var(--hp-base)" />
    </>
  ),
  DirectMetal: (
    <>
      <rect x="8" y="4" width="48" height="16" rx="2" fill="var(--hp-pkg)" />
      <rect x="8" y="20" width="48" height="2.5" fill="var(--hp-face)" />
      <rect x="8" y="22.5" width="48" height="3" fill="var(--hp-tim)" />
      <rect x="1" y="26" width="62" height="7" fill="var(--hp-base)" />
    </>
  ),
  Direct: (
    <>
      <rect x="20" y="6" width="24" height="9" rx="1.5" fill="var(--hp-pkg)" />
      <rect x="20" y="15" width="24" height="3" fill="var(--hp-tim)" />
      <rect x="2" y="18" width="60" height="9" fill="var(--hp-base)" />
    </>
  ),
  Pedestal: (
    <>
      <rect x="22" y="2" width="20" height="8" rx="1.5" fill="var(--hp-pkg)" />
      <rect x="22" y="10" width="20" height="2.5" fill="var(--hp-tim)" />
      <path d="M19 12.5h26v6H62v9H2v-9h17z" fill="var(--hp-base)" />
    </>
  ),
  SmallBaseHeatPipe: (
    <>
      <rect x="22" y="2" width="20" height="7" rx="1.5" fill="var(--hp-pkg)" />
      <rect x="22" y="9" width="20" height="2.5" fill="var(--hp-tim)" />
      <rect x="17" y="11.5" width="30" height="6" fill="var(--hp-mount)" />
      <rect x="2" y="18" width="60" height="9" fill="var(--hp-base)" />
      <rect x="20" y="18.5" width="42" height="4" rx="2" fill="var(--hp-pipe)" />
    </>
  ),
  EmbeddedHeatPipe: (
    <>
      <rect x="20" y="4" width="24" height="9" rx="1.5" fill="var(--hp-pkg)" />
      <rect x="20" y="13" width="24" height="3" fill="var(--hp-tim)" />
      <rect x="2" y="16" width="60" height="11" fill="var(--hp-base)" />
      <rect x="18" y="16.5" width="44" height="4" rx="2" fill="var(--hp-pipe)" />
    </>
  ),
  VaporChamber: (
    <>
      <rect x="22" y="2" width="20" height="7" rx="1.5" fill="var(--hp-pkg)" />
      <rect x="22" y="9" width="20" height="2.5" fill="var(--hp-tim)" />
      <rect x="8" y="11.5" width="48" height="5" rx="1" fill="var(--hp-pipe)" />
      <rect x="2" y="18" width="60" height="9" fill="var(--hp-base)" />
    </>
  ),
};

export function StackIcon({ kind, className }: { kind: HeatPathType | MountType; className?: string }) {
  return (
    <svg viewBox="0 0 64 34" aria-hidden className={className}>
      {ICONS[kind]}
    </svg>
  );
}
