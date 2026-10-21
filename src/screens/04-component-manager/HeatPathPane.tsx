/**
 * The right half of the Screen 04 inspector: the stack-up drawing of the
 * selected part and its resistance chain.
 *
 * The form beside it reports which field has the caret (`focus`) and which
 * card the pointer is over (`hover`); this pane lights up that layer and draws
 * the dimension the field sets. Clicking a layer, a label or a chain segment
 * goes the other way, to the card that sets it (`onPickLayer`).
 *
 * A focus change only restyles what is drawn — the elements keep their keys —
 * so a click that starts on a layer ends on the same element and is not lost.
 */

import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';

import { HEAT_PATH_SHORT, MOUNT_SHORT } from './HeatPathIcons';
import {
  draw2D,
  draw3D,
  LAYER_COLOR,
  SvgDefs,
  svgIds,
  type DimKey,
} from './heatPathDrawing';
import {
  RELATED_LAYERS,
  formatR,
  type ChainSegment,
  type HeatLayer,
  type HeatPathView,
} from './heatPathModel';

export interface PathFocus {
  layer: HeatLayer | null;
  dim: DimKey | null;
}

const DEFAULT_AZ = 35;

export function HeatPathPane({
  view,
  focus,
  hover,
  onHover,
  onPickLayer,
}: {
  view: HeatPathView;
  focus: PathFocus;
  hover: HeatLayer | null;
  onHover: (layer: HeatLayer | null) => void;
  onPickLayer: (layer: HeatLayer) => void;
}) {
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const [az, setAz] = useState(DEFAULT_AZ);
  const ids = svgIds(useId());
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const drawing = mode === '2d' ? draw2D(view, ids) : draw3D(view, ids, az);
  const active = focus.layer ?? hover;
  const lit = new Set<HeatLayer>(active ? RELATED_LAYERS[active] : []);
  const cls = (layer: HeatLayer, base: string) => `${base}${lit.has(layer) ? ' hl' : ''}`;

  const pick = (target: EventTarget) => {
    if (suppressClick.current) return;
    const layer = (target as Element).closest?.('[data-layer]')?.getAttribute('data-layer');
    if (layer) onPickLayer(layer as HeatLayer);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (mode !== '3d') return;
    drag.current = { x: event.clientX, moved: false };
    suppressClick.current = false;
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    if (!state.moved && Math.abs(dx) <= 3) return;
    if (!state.moved) {
      state.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setAz((current) => (current + dx * 0.6 + 360) % 360);
    state.x = event.clientX;
  };
  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const state = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // A drag that rotated the view is not also a click on a layer.
    if (state?.moved) {
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
  };

  const content = (
    <>
      {drawing.layers.map((group) => (
        <g key={group.layer} className={cls(group.layer, 'ly')} data-layer={group.layer}>
          {group.node}
        </g>
      ))}
      {drawing.flow}
      <g>{drawing.dim(focus.dim)}</g>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-bold text-ink-900">散熱路徑圖</h3>
          <p className="text-[11px] text-ink-500">
            {HEAT_PATH_SHORT[view.heatPath].name}・{MOUNT_SHORT[view.mount.type]}・
            {view.junction ? '接面型' : '本體型'}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="圖的顯示方式"
          className="inline-flex overflow-hidden rounded-md border border-line-strong bg-surface"
        >
          {(
            [
              ['2d', '剖面'],
              ['3d', '立體'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`h-7 border-r border-line px-3 text-[12px] last:border-r-0 ${
                mode === value
                  ? 'bg-accent-600 font-semibold text-white'
                  : 'text-ink-700 hover:bg-surface-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="hp-stage relative min-h-[420px] flex-1">
        <svg
          className={`hp-svg absolute inset-0${active ? ' focusing' : ''}`}
          role="img"
          aria-label="散熱路徑疊構圖"
          viewBox={drawing.viewBox}
          preserveAspectRatio="xMidYMid meet"
          style={{ touchAction: mode === '3d' ? 'none' : undefined }}
          onClick={(event) => pick(event.target)}
          onMouseOver={(event) => {
            if (focus.layer) return;
            const layer = (event.target as Element)
              .closest('[data-layer]')
              ?.getAttribute('data-layer') as HeatLayer | null;
            if ((layer ?? null) !== hover) onHover(layer ?? null);
          }}
          onMouseLeave={() => {
            if (hover) onHover(null);
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <SvgDefs ids={ids} />
          {drawing.transform ? <g transform={drawing.transform}>{content}</g> : content}
          <g className="ly keep" data-layer="probe">
            {drawing.probe}
          </g>
          {drawing.labels.map((label, index) => (
            <g key={`${label.layer}-${index}`} className={cls(label.layer, 'lab')} data-layer={label.layer}>
              {label.node}
            </g>
          ))}
        </svg>
        <p className="pointer-events-none absolute bottom-2.5 left-3 max-w-[calc(100%-150px)] text-[11px] text-ink-400">
          {mode === '2d'
            ? '剖面沿長度 L；厚度放大不依比例，寬度依比例。'
            : '拖曳可旋轉；各層分開畫（爆炸圖），長寬依比例。'}
        </p>
        {mode === '3d' && (
          <div className="absolute right-2.5 bottom-2.5 flex gap-1">
            <button
              type="button"
              title="向左轉 30°"
              aria-label="向左轉 30°"
              onClick={() => setAz((current) => (current + 330) % 360)}
              className="flex h-7 min-w-7 items-center justify-center rounded-md border border-line-strong bg-surface px-2 text-ink-700 hover:border-ink-400"
            >
              <RotateCcw size={13} aria-hidden />
            </button>
            <button
              type="button"
              title="向右轉 30°"
              aria-label="向右轉 30°"
              onClick={() => setAz((current) => (current + 30) % 360)}
              className="flex h-7 min-w-7 items-center justify-center rounded-md border border-line-strong bg-surface px-2 text-ink-700 hover:border-ink-400"
            >
              <RotateCw size={13} aria-hidden />
            </button>
            <button
              type="button"
              title="回到預設角度"
              onClick={() => setAz(DEFAULT_AZ)}
              className="h-7 rounded-md border border-line-strong bg-surface px-2 text-[12px] text-ink-700 hover:border-ink-400"
            >
              重設
            </button>
          </div>
        )}
      </div>

      <HeatPathChain view={view} lit={lit} onPickLayer={onPickLayer} />
    </div>
  );
}

const LIGHT_SEGMENTS = new Set<HeatLayer>(['tim', 'joint', 'solder', 'base']);

function segmentColor(segment: ChainSegment): string {
  return segment.dry ? 'var(--hp-dry)' : LAYER_COLOR[segment.layer];
}

/** The resistance chain: one bar segment per step, sized by its share. */
export function HeatPathChain({
  view,
  lit,
  onPickLayer,
}: {
  view: HeatPathView;
  lit: Set<HeatLayer>;
  onPickLayer: (layer: HeatLayer) => void;
}) {
  const segments = view.segments;
  const maxR = Math.max(...segments.map((segment) => segment.R ?? 0), 0.0001);
  // A missing step still needs room to say what it lacks; with nothing resolved
  // beside it, it is the bar.
  const missingGrow = segments.some((segment) => segment.R != null) ? 0.25 : 1;
  const series = segments.filter((segment) => !segment.parallel && !segment.later && segment.R != null);
  const total = series.reduce((sum, segment) => sum + (segment.R ?? 0), 0);
  const refName = view.limitType === 'Tj' ? '接面' : '散熱面';
  const later = segments.filter((segment) => segment.later).map((segment) => segment.name);
  const parallel = segments.filter((segment) => segment.parallel).map((segment) => segment.name);

  return (
    <section className="flex flex-col gap-1.5 border-t border-line bg-surface px-3.5 pt-2.5 pb-3" aria-label="熱阻鏈">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="text-[12.5px] font-bold text-ink-900">熱阻鏈（單顆）</h3>
        <span className="tabular ml-auto text-[12px] text-ink-700">
          {view.missing.length > 0 ? (
            <span className="font-bold text-danger-600">
              缺 {view.missing.join('、')}，無法估算
            </span>
          ) : view.refR != null ? (
            <>
              {refName} → 底座表面 <b className="text-[13px] text-ink-900">{formatR(view.refR)} °C/W</b>
              {view.dT != null && (
                <>
                  ・單顆 {view.powerW} W → 溫升{' '}
                  <b className="text-[13px] text-ink-900">{view.dT.toFixed(1)} °C</b>
                </>
              )}
            </>
          ) : null}
        </span>
      </div>

      <div className="flex h-[26px] overflow-hidden rounded-md border border-line-strong" role="group" aria-label="熱阻鏈">
        {segments.map((segment) => {
          const missing = segment.missing.length > 0;
          const state = missing
            ? 'miss'
            : segment.later
              ? 'later'
              : LIGHT_SEGMENTS.has(segment.layer) && !segment.dry
                ? 'light'
                : '';
          const grow = segment.R != null ? Math.max(segment.R / maxR, 0.0001) : missingGrow;
          const label = missing
            ? `缺 ${segment.missing[0]}`
            : segment.later
              ? `${segment.name} 05`
              : `${segment.name}${segment.parallel ? ' ∥' : ''}`;
          const tip = missing
            ? `${segment.name}：缺 ${segment.missing.join('、')}`
            : segment.later
              ? `${segment.name}：${segment.note ?? '由 05 計算'}`
              : `${segment.name}${segment.parallel ? '（並聯支路）' : ''}：${formatR(segment.R)} °C/W${segment.note ? `（${segment.note}）` : ''}`;
          return (
            <button
              key={segment.id}
              type="button"
              className={`hp-seg ${state}${lit.has(segment.layer) ? ' is-hot' : ''}`}
              style={{ ['--c' as string]: segmentColor(segment), flex: `${grow} 1 0` }}
              title={tip}
              onClick={() => onPickLayer(segment.layer)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-500">
        {segments
          .filter((segment) => segment.R != null)
          .map((segment) => (
            <li key={segment.id} className="inline-flex items-center gap-1.5">
              <span
                className="hp-chip"
                style={{ ['--c' as string]: segmentColor(segment), width: 9, height: 9 }}
              />
              {segment.name}
              {segment.parallel ? '（並聯）' : ''}{' '}
              <b className="tabular font-semibold text-ink-900">{formatR(segment.R)}</b>
              {!segment.parallel && total > 0 && (
                <span className="tabular">{Math.round((100 * (segment.R ?? 0)) / total)}%</span>
              )}
            </li>
          ))}
      </ul>

      <p className="text-[11px] leading-relaxed text-ink-400">
        {view.baseMax != null && (
          <>
            限溫 {view.limitType} {view.limit} °C → 底座表面最高約{' '}
            <b className="font-semibold text-ink-700">{view.baseMax.toFixed(1)} °C</b>（估算）。
          </>
        )}
        不含：{later.join('、')}
        {parallel.length > 0 && `；${parallel.join('、')}是並聯支路，與底座擴散一起由 05 求解`}
        、鰭片對流（05／07）。
      </p>
    </section>
  );
}
