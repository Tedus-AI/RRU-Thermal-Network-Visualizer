/**
 * Every component's temperature, limit and margin — the list 07 求解與結果
 * opens on (07 §59).
 *
 * It was a window behind an orange button on 07 and a yellow one on 09, both
 * opening the same table, ordered the way Screen 04 lists parts: the tightest
 * part sat second from the bottom. It is on the page now, tightest first.
 *
 * The temperature is the one the margin is judged at — the node holding the
 * limit (Tj, Tc or Ts) — so temperature, limit and margin on a row agree. The
 * hottest node of a Tc part is its junction, and showing that beside a case
 * limit read 96.6 against 95 on a row marked passing.
 *
 * A row is a way into the graph: selecting one focuses that part's path, the
 * hottest instance of it. The arrow at the end opens 08 on it. Its own nodes
 * open under it; edges and heat flows are the full table's.
 */

import { Fragment, useState } from 'react';
import { ChevronRight, Crosshair, Table2 } from 'lucide-react';

import { LIMIT_TYPE_LABELS } from '@/domain/component';

import {
  MARGIN_STATUS_LABELS,
  NODE_ROLE_LABELS,
  num,
  signed,
  type MarginStatus,
  type ResultTreeGroupRow,
} from './resultViewModel';

const STATUS_PILL: Record<Exclude<MarginStatus, 'na'>, string> = {
  pass: 'border-ok-500/50 bg-ok-100 text-ok-600',
  warn: 'border-warn-500/50 bg-warn-100 text-warn-600',
  over: 'border-danger-500 bg-danger-600 text-white',
};

const MARGIN_TEXT: Record<MarginStatus, string> = {
  pass: 'text-ok-600',
  warn: 'text-warn-600',
  over: 'text-danger-600',
  na: 'text-ink-400',
};

function LimitCell({ limit_C, limit_type }: { limit_C: number | null; limit_type: string | null }) {
  if (limit_C == null) return <span className="text-ink-400">—</span>;
  const label = limit_type ? LIMIT_TYPE_LABELS[limit_type as keyof typeof LIMIT_TYPE_LABELS] : null;
  return (
    <span className="whitespace-nowrap tabular text-ink-700">
      {num(limit_C, 0)}
      {limit_type && (
        <span
          className="ml-1 text-[10px] font-semibold text-ink-400"
          title={label ? `限溫是${label.zh}` : undefined}
        >
          {limit_type}
        </span>
      )}
    </span>
  );
}

function StatusPill({ status }: { status: MarginStatus }) {
  if (status === 'na') return <span className="text-[11px] text-ink-400">—</span>;
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10.5px] leading-none font-bold whitespace-nowrap ${STATUS_PILL[status]}`}
    >
      {MARGIN_STATUS_LABELS[status].zh}
    </span>
  );
}

export function ComponentResultsPanel({
  groups,
  hasSolution,
  stale,
  failed,
  selectedId,
  onSelect,
  onOpenBottleneck,
  canOpenBottleneck,
  onOpenFullTable,
}: {
  /** Already in `componentResultOrder`. */
  groups: ResultTreeGroupRow[];
  hasSolution: boolean;
  stale: boolean;
  failed: boolean;
  /** The component whose path the graph is focused on, if any. */
  selectedId: string | null;
  onSelect: (group: ResultTreeGroupRow) => void;
  onOpenBottleneck: (group: ResultTreeGroupRow) => void;
  /** 08 reads a current, balanced solve; without one the arrows are off. */
  canOpenBottleneck: boolean;
  onOpenFullTable: () => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set<string>());
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const attention = groups.filter((group) => group.status === 'warn' || group.status === 'over').length;

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface"
      aria-labelledby="component-results-title"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2">
        <h2 id="component-results-title" className="text-[13px] font-bold text-ink-900">
          元件結果
        </h2>
        <span className="text-[11px] text-ink-400">
          依餘裕排序・{groups.length} 種
          {hasSolution && attention > 0 && (
            <span className="ml-1 font-semibold text-warn-600">・{attention} 種要注意</span>
          )}
        </span>
        <button
          type="button"
          onClick={onOpenFullTable}
          title="每個節點的溫度、每段連線的溫差、熱流與熱阻；可輸出 PDF"
          className="ml-auto flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-[11px] font-semibold text-ink-700 hover:bg-surface-muted"
        >
          <Table2 size={13} aria-hidden />
          完整結果表
        </button>
      </header>

      {!hasSolution ? (
        <p className="px-4 py-8 text-center text-[12px] leading-relaxed text-ink-500">
          {stale
            ? '熱網路或情境在上次求解後改過，結果已失效。按上方「重新求解」。'
            : failed
              ? '上次求解失敗，原因在熱網路左下角的求解訊息。'
              : '還沒有求解結果。按上方「求解」，每顆元件的溫度與餘裕會列在這裡。'}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed border-collapse text-[12px]">
            <colgroup>
              <col />
              <col style={{ width: 62 }} />
              <col style={{ width: 62 }} />
              <col style={{ width: 54 }} />
              <col style={{ width: 50 }} />
              <col style={{ width: 30 }} />
            </colgroup>
            <thead>
              <tr className="text-[10.5px] font-semibold text-ink-500">
                <th scope="col" className="sticky top-0 z-[1] border-b border-line bg-surface-muted px-2 py-1.5 text-left">
                  元件
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-[1] border-b border-line bg-surface-muted px-1.5 py-1.5 text-right"
                  title="限溫位置（Tj／Tc／Ts）的溫度，與限溫、餘裕同一個點"
                >
                  溫度 °C
                </th>
                <th scope="col" className="sticky top-0 z-[1] border-b border-line bg-surface-muted px-1.5 py-1.5 text-right">
                  限溫
                </th>
                <th scope="col" className="sticky top-0 z-[1] border-b border-line bg-surface-muted px-1.5 py-1.5 text-right">
                  餘裕
                </th>
                <th scope="col" className="sticky top-0 z-[1] border-b border-line bg-surface-muted px-1.5 py-1.5 text-left">
                  狀態
                </th>
                <th scope="col" className="sticky top-0 z-[1] border-b border-line bg-surface-muted">
                  <span className="sr-only">瓶頸分析</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const expanded = open.has(group.id);
                const selected = selectedId === group.id;
                return (
                  <Fragment key={group.id}>
                    <tr
                      data-component-row={group.id}
                      data-selected={selected || undefined}
                      onClick={() => onSelect(group)}
                      className={`cursor-pointer border-b border-line ${
                        selected ? 'bg-accent-50' : 'hover:bg-surface-muted'
                      }`}
                    >
                      <td className="py-1.5 pr-1 pl-1">
                        <span className="flex min-w-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggle(group.id);
                            }}
                            aria-expanded={expanded}
                            aria-label={`${expanded ? '收合' : '展開'} ${group.name} 的節點`}
                            className="flex size-5 shrink-0 items-center justify-center rounded text-ink-400 hover:bg-surface hover:text-ink-700"
                          >
                            <ChevronRight size={12} className={expanded ? 'rotate-90' : ''} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelect(group);
                            }}
                            aria-pressed={selected}
                            title={selected ? '再點一次回到全部熱網路' : '在右邊熱網路只看這顆的路徑'}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="block truncate font-semibold text-ink-900" title={group.name}>
                              {group.name}
                            </span>
                            {group.subtitle && (
                              <span className="block truncate text-[10.5px] text-ink-400">{group.subtitle}</span>
                            )}
                          </button>
                        </span>
                      </td>
                      <td
                        className="px-1.5 py-1.5 text-right font-bold tabular text-ink-900"
                        title={
                          group.peak_C != null && group.judged_C != null && group.peak_C !== group.judged_C
                            ? `最熱節點 ${num(group.peak_C, 1)} °C`
                            : undefined
                        }
                      >
                        {num(group.judged_C ?? group.peak_C, 1)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right">
                        <LimitCell limit_C={group.limit_C} limit_type={group.limit_type} />
                      </td>
                      <td className={`px-1.5 py-1.5 text-right font-bold tabular ${MARGIN_TEXT[group.status]}`}>
                        {group.margin_C == null ? '—' : signed(group.margin_C, 1)}
                      </td>
                      <td className="px-1.5 py-1.5">
                        <StatusPill status={group.status} />
                      </td>
                      <td className="py-1.5 pr-1 text-center">
                        <button
                          type="button"
                          disabled={!canOpenBottleneck || group.judged_node_id == null}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenBottleneck(group);
                          }}
                          aria-label={`${group.name} 瓶頸分析`}
                          title={
                            group.judged_node_id == null
                              ? '沒有限溫，08 沒有可分析的餘裕'
                              : `到 08 看 ${group.name} 的熱阻鏈`
                          }
                          className="inline-flex size-6 items-center justify-center rounded text-ink-400 hover:bg-accent-50 hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Crosshair size={13} aria-hidden />
                        </button>
                      </td>
                    </tr>
                    {expanded &&
                      group.nodes.map((entry) => {
                        const role = NODE_ROLE_LABELS[entry.row.node.type] ?? NODE_ROLE_LABELS.custom;
                        return (
                          <tr key={entry.id} className="border-b border-line bg-canvas text-[11.5px]">
                            <td className="py-1 pr-1 pl-7">
                              <span className="block truncate text-ink-700" title={entry.row.node.name}>
                                {entry.row.node.name}
                                <span className="ml-1 text-[10px] text-ink-400">{role.zh}</span>
                              </span>
                            </td>
                            <td className="px-1.5 py-1 text-right tabular text-ink-700">
                              {num(entry.row.temperature_C, 1)}
                            </td>
                            <td className="px-1.5 py-1 text-right">
                              <LimitCell
                                limit_C={entry.row.limit_C}
                                limit_type={entry.row.node.limit_type ?? null}
                              />
                            </td>
                            <td className={`px-1.5 py-1 text-right tabular ${MARGIN_TEXT[entry.row.status]}`}>
                              {entry.row.margin_C == null ? '' : signed(entry.row.margin_C, 1)}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {groups.length === 0 && (
            <p className="px-4 py-6 text-center text-[12px] text-ink-400">這個熱網路沒有元件。</p>
          )}
        </div>
      )}

      <p className="shrink-0 border-t border-line px-3 py-1.5 text-[10.5px] leading-relaxed text-ink-400">
        溫度是限溫位置（Tj／Tc／Ts）的溫度，所以溫度、限溫、餘裕三格對得起來。點一列，右邊熱網路只看它的路徑；
        <Crosshair size={10} className="mx-0.5 inline" aria-hidden />
        到 08 瓶頸分析。
      </p>
    </section>
  );
}
