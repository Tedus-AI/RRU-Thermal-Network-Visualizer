/**
 * Card ① 熱網路: the network generated from 04's thermal paths.
 *
 * Its everyday job is one button — 依 04 產生 — and the reminder that says
 * when 04 has changed something the network was built from. The counts say
 * whether the network is whole; the hand tools are behind 「進階編修」.
 */

import { ChevronDown, RefreshCw, Sparkles, Wrench } from 'lucide-react';

import { Button } from '@/ui/primitives';
import { staleComponentNames } from '@/thermal/graph/staleLinkedEdges';
import type { ThermalNetwork } from '@/thermal/types';

import { AdvancedEditor } from './AdvancedEditor';
import { WorkspaceCard, type CardTone } from './WorkspaceCard';
import type { ThermalPathBuilder } from './useThermalPathBuilder';

function Count({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-surface-muted px-2 py-1.5">
      <p className={`tabular text-[14px] leading-tight font-bold ${warn ? 'text-warn-600' : 'text-ink-900'}`}>
        {value}
      </p>
      <p className="text-[10px] text-ink-400">{label}</p>
    </div>
  );
}

export function NetworkCard({
  builder,
  network,
  open,
  onToggle,
}: {
  builder: ThermalPathBuilder;
  network: ThermalNetwork;
  open: boolean;
  onToggle: () => void;
}) {
  const { editing, enabledComponents, kpis, readOnly, requiresReview, setEditing, setShowGenerate, staleEdges } =
    builder;
  const isEmpty = Object.keys(network.nodes).length === 0;
  const allModeled = kpis.componentsModeled >= kpis.componentsTotal;
  const staleComponents = staleComponentNames(staleEdges);

  const tone: CardTone = isEmpty || requiresReview || !allModeled ? 'warn' : 'ok';
  const status = isEmpty
    ? '尚未產生'
    : requiresReview
      ? '04 有改過'
      : `${kpis.componentsModeled} / ${kpis.componentsTotal} 種元件`;

  return (
    <WorkspaceCard
      id="card-network"
      index={1}
      title="熱網路"
      subtitle="依 04 的散熱路徑產生"
      status={status}
      tone={tone}
      open={open}
      onToggle={onToggle}
    >
      <div className="flex flex-col gap-2.5">
        {requiresReview && !isEmpty && (
          <p className="rounded-md border border-warn-500/40 bg-warn-100/70 px-2.5 py-1.5 text-[11px] leading-relaxed text-warn-600" data-review-note>
            04 改過會影響熱網路的欄位（數量、TIM、散熱路徑、幾何、啟用、新增或刪除元件）。按「依 04 重新產生」更新熱網路。
          </p>
        )}
        {staleEdges.length > 0 && !readOnly && (
          <button
            type="button"
            onClick={() => setShowGenerate(true)}
            title={staleEdges
              .map(
                (entry) =>
                  `${entry.component_name} · ${entry.edge_id}：${entry.stored_C_per_W?.toFixed(3) ?? '未解'} → ${entry.resolved_C_per_W?.toFixed(3) ?? '未解'} °C/W`,
              )
              .join('\n')}
            className="flex items-start gap-1.5 rounded-md border border-warn-500/40 bg-warn-100/70 px-2.5 py-1.5 text-left text-[11px] leading-relaxed text-warn-600 hover:bg-warn-100"
          >
            <RefreshCw size={13} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {staleComponents.length} 種元件的 {staleEdges.length} 個熱阻已過期：01／04 的數值改過，圖上還是舊的熱阻（07
              求解已經用新的值）。點這裡重新產生。
            </span>
          </button>
        )}

        {isEmpty ? (
          <p className="text-[11.5px] leading-relaxed text-ink-500">
            還沒有熱網路。按「依 04 產生」，每顆元件會依 04 設定的散熱路徑建好節點與熱阻，並接到散熱器底座。
          </p>
        ) : (
          <div className="grid grid-cols-5 gap-1.5" data-network-counts>
            <Count
              label="元件種類"
              value={`${kpis.componentsModeled}/${kpis.componentsTotal}`}
              warn={!allModeled}
            />
            <Count label="節點" value={kpis.nodes} />
            <Count label="連線" value={kpis.edges} />
            <Count label="未接的埠" value={kpis.unconnectedPorts} warn={kpis.unconnectedPorts > 0} />
            <Count label="未解熱阻" value={kpis.unresolvedRth} warn={kpis.unresolvedRth > 0} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isEmpty || requiresReview || staleEdges.length > 0 ? 'primary' : 'secondary'}
            icon={<Sparkles size={14} aria-hidden />}
            className="h-8"
            disabled={readOnly || enabledComponents.length === 0}
            title={enabledComponents.length === 0 ? '04 還沒有啟用的元件' : undefined}
            onClick={() => setShowGenerate(true)}
          >
            {isEmpty ? '依 04 產生' : '依 04 重新產生'}
          </Button>
          <Button
            className="h-8"
            icon={<Wrench size={14} aria-hidden />}
            trailingIcon={
              <ChevronDown size={13} aria-hidden className={`transition-transform ${editing ? '' : '-rotate-90'}`} />
            }
            aria-pressed={editing}
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            進階編修
          </Button>
        </div>

        {editing && <AdvancedEditor builder={builder} network={network} />}
      </div>
    </WorkspaceCard>
  );
}
