/**
 * How much hotter the air can get — the conclusion that replaced Screen 09.
 *
 * The panel here used to be a Temperature Distribution Summary: average, P95,
 * a count of nodes above a warning line, and a button through to Screen 09.
 * Every one of those was a statistic over NODES, which is a count of how finely
 * the network happens to be drawn — one part in the STARKCORE model is twenty
 * nodes and another is three — so none of them described the machine.
 *
 * This does. It is the only reading on the screen that is not "at this air
 * temperature", and the specification the machine is built to is written as a
 * range, so it is the one that says whether the design has anywhere left to go.
 */

import { Thermometer, TriangleAlert } from 'lucide-react';

import { EngineeringInfo } from '@/ui/FieldLabel';
import type { AmbientHeadroom } from '@/thermal/analysis/ambientHeadroom';

import { num } from './overviewViewModel';
import { T10 } from './tooltips';

export function AmbientHeadroomPanel({ headroom }: { headroom: AmbientHeadroom | null }) {
  if (!headroom) {
    return (
      <p className="py-4 text-[12px] text-ink-500">
        No part in this network carries a temperature limit, so there is no headroom to report.
        <span className="ml-1">此網路沒有任何元件設定溫度上限，因此無法計算環溫餘裕。</span>
      </p>
    );
  }

  const over = headroom.headroom_C < 0;
  const tight = !over && headroom.headroom_C < 5;
  const tone = over ? 'text-danger-600' : tight ? 'text-warn-600' : 'text-ok-600';

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Max Ambient"
          zh="最高可用環溫"
          value={`${num(headroom.max_ambient_C, 1)} °C`}
          tone={tone}
          explanation={T10.maxAmbient}
        />
        <Stat label="At Ambient" zh="目前環溫" value={`${num(headroom.ambient_C, 1)} °C`} />
        <Stat
          label="Headroom"
          zh="環溫餘裕"
          value={`${headroom.headroom_C >= 0 ? '+' : ''}${num(headroom.headroom_C, 1)} °C`}
          tone={tone}
        />
        <Stat
          label="Parts With Limits"
          zh="有上限的元件"
          value={`${headroom.limited_node_count}`}
        />
      </div>

      <p className="text-[12px] text-ink-700">
        <span className={`font-bold ${tone}`}>
          {over ? 'Over limit already' : `Up to ${num(headroom.max_ambient_C, 1)} °C ambient`}
        </span>
        <span className="ml-1">
          — set by <span className="font-semibold">{headroom.worst_node_name}</span> at{' '}
          {num(headroom.worst_temperature_C, 1)} °C against its {num(headroom.worst_limit_C, 0)} °C
          limit.
        </span>
        <span className="mt-0.5 block text-[11px] text-ink-500">
          由 {headroom.worst_node_name} 決定：{num(headroom.worst_temperature_C, 1)} °C，上限{' '}
          {num(headroom.worst_limit_C, 0)} °C。
        </span>
      </p>

      {/* The one condition that makes the arithmetic unsafe, said on the screen
          rather than left in a doc comment. */}
      {!headroom.assumes_uniform_rise && (
        <p className="flex items-start gap-1.5 rounded-md border border-warn-600/40 bg-warn-600/5 px-2.5 py-1.5 text-[11px] text-warn-600">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          <span>
            A node is pinned to a fixed temperature, which does not warm with the air — read this
            as an estimate.
            <span className="ml-1 block text-ink-500">
              網路中有固定溫度節點，不隨環溫上升，此數值僅供估算。
            </span>
          </span>
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  zh,
  value,
  tone = 'text-ink-900',
  explanation,
}: {
  label: string;
  zh: string;
  value: string;
  tone?: string;
  explanation?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-surface-muted px-2.5 py-2">
      <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-700">
        <Thermometer size={12} className="shrink-0 text-ink-400" />
        <span className="min-w-0 truncate">{label}</span>
        {explanation && <EngineeringInfo zh={explanation} label={label} />}
      </span>
      <span className="block truncate text-[10px] text-ink-400">{zh}</span>
      <span className={`block truncate text-[15px] leading-tight font-bold tabular ${tone}`}>
        {value}
      </span>
    </div>
  );
}
