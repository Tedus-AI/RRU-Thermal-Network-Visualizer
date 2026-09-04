/**
 * Node temperatures and edge heat flows, as one tree.
 *
 * These were two tables side by side. The split was along the wrong seam: a
 * node's temperature and the drop across the edge feeding it answer the same
 * question, and reading them meant copying a node id from one table and
 * scanning the other for the edges that mention it. Here the drop sits directly
 * under the node it produced, and both sit under the component they belong to.
 *
 * Ordering is the component order from Screen 04 and then node id — never
 * "worst first". Ranking is Screen 08's job (07 §44–§46), and a table that
 * quietly sorted by margin would be doing it here.
 *
 * ---------------------------------------------------------------------------
 * Why an edge is not a row in the same grid
 *
 * It used to be. Seven columns served all three kinds of row, and two of them
 * could only ever be filled by one kind: `Rth` exists on edges alone, and the
 * rise above ambient on nodes alone. On the view an engineer actually reads —
 * groups open, nodes closed — that is two full columns of em dashes, and the
 * report shipped looking like it had failed to compute half of itself.
 *
 * A node and an edge are different things and are now shaped differently. The
 * grid carries what every node has (temperature, dissipation, limit, margin);
 * an edge carries its own three numbers inline, where they read as a sentence
 * about that connection rather than as three lonely cells under headings that
 * mean something else. Nothing was dropped: ΔT and Rth are both still on
 * screen, on the row they belong to.
 */

import { useState } from 'react';

import { LIMIT_TYPE_LABELS, type LimitType } from '@/domain/component';
import { ChevronRight, CornerDownRight } from 'lucide-react';

import type {
  ResultTreeEdgeRow,
  ResultTreeGroupRow,
  ResultTreeNodeRow,
} from './resultViewModel';
import { NODE_ROLE_LABELS, num, rth, signed } from './resultViewModel';

/*
 * No `/NN` opacity modifiers anywhere below.
 *
 * Tailwind v4 compiles `border-line/50` to `color-mix(in oklab, …)`, and
 * html2canvas 1.4.1 — which rasterizes this table into the PDF, because jsPDF
 * has no CJK glyphs — throws on it: "Attempting to parse an unsupported color
 * function oklab". The export failed on the first browser run for exactly this,
 * and the failure is invisible from a unit test, so `resultTable.test.tsx`
 * guards it.
 */

/** Name, then the four numbers every node row can actually fill. */
const GRID =
  'grid grid-cols-[minmax(13rem,1.9fr)_5.5rem_5.5rem_6rem_6rem] items-center gap-x-3';

/** The rail down the left of a group, coloured by its tightest margin. */
const STATUS_RAIL: Record<'pass' | 'over' | 'na', string> = {
  pass: 'bg-ok-500',
  over: 'bg-danger-500',
  na: 'bg-line-strong',
};

/**
 * The limit, with the temperature it is stated against.
 *
 * A Tc part shows its junction in the T column and its CASE in the margin, so
 * a row can legitimately read 96.9 against a limit of 95 and still be passing.
 * Naming the type is what makes that readable rather than alarming.
 */
function LimitCell({
  limit_C,
  limit_type,
}: {
  limit_C: number | null;
  limit_type: LimitType | null | undefined;
}) {
  if (limit_C == null) return <span className="text-right text-ink-400">—</span>;
  return (
    <span className="text-right tabular text-ink-500">
      {num(limit_C, 0)}
      {limit_type && (
        <span
          className="ml-1 rounded bg-surface-muted px-1 py-px text-[9px] font-bold text-ink-400"
          title={`${LIMIT_TYPE_LABELS[limit_type].en} / ${LIMIT_TYPE_LABELS[limit_type].zh}`}
        >
          {limit_type}
        </span>
      )}
    </span>
  );
}

/**
 * Over limit is a pill, inside is plain text.
 *
 * Colour alone carries this today, and the two greens and reds of a long table
 * are hard to tell apart at a glance. Filling only the failures means the eye
 * finds them without reading, and a passing table stays quiet.
 */
function MarginCell({
  margin_C,
  status,
}: {
  margin_C: number | null;
  status: 'pass' | 'over' | 'na';
}) {
  if (margin_C == null) return <span className="text-right text-ink-400">—</span>;
  if (status === 'over') {
    return (
      <span className="flex justify-end">
        <span className="rounded bg-danger-600 px-1.5 py-px text-[11px] font-bold tabular text-white">
          {signed(margin_C, 1)}
        </span>
      </span>
    );
  }
  return (
    <span className="text-right font-bold tabular text-ok-600">{signed(margin_C, 1)}</span>
  );
}

/** One number and its unit, as a chip on an edge row. */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1 rounded bg-surface-muted px-1.5 py-0.5">
      <span className="text-[9px] font-semibold tracking-wide text-ink-400 uppercase">
        {label}
      </span>
      <span className="text-[11px] font-semibold tabular text-ink-700">{value}</span>
    </span>
  );
}

function EdgeRow({
  edge,
  selected,
  onSelect,
}: {
  edge: ResultTreeEdgeRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      // A drop and an outflow read differently: one explains the node above it,
      // the other says where its heat goes next.
      title={`${edge.outgoing ? 'to' : 'from'} ${edge.counterpart_name}`}
      className={`flex w-full items-center gap-2 border-b border-line py-1 pr-3 pl-14 text-left last:border-b-0 hover:bg-surface-muted ${
        selected ? 'bg-accent-50' : ''
      }`}
    >
      <CornerDownRight size={11} className="shrink-0 text-ink-400" />
      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-500">
        {edge.name}
        <span className="ml-1 text-ink-400">
          {edge.outgoing ? '→' : '←'} {edge.counterpart_name}
        </span>
      </span>
      {edge.rth_origin === 'boundary_scenario' && (
        <span className="shrink-0 rounded bg-accent-100 px-1 text-[9px] font-bold text-accent-700">
          06
        </span>
      )}
      {edge.rth_origin === 'spreading_biot' && (
        <span className="shrink-0 rounded bg-warn-100 px-1 text-[9px] font-bold text-warn-600">
          Bi
        </span>
      )}
      <Metric
        label="ΔT"
        value={edge.delta_T_C != null ? `${num(edge.delta_T_C, 1)} K` : 'N/A'}
      />
      <Metric
        label="Q"
        value={edge.heat_flow_W != null ? `${num(edge.heat_flow_W, 1)} W` : 'N/A'}
      />
      <Metric label="Rth" value={`${rth(edge.rth_C_per_W)} °C/W`} />
    </button>
  );
}

function NodeRow({
  node,
  expanded,
  selectedNodeId,
  selectedEdgeId,
  onToggle,
  onSelectNode,
  onSelectEdge,
}: {
  node: ResultTreeNodeRow;
  expanded: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onToggle: () => void;
  onSelectNode: () => void;
  onSelectEdge: (edgeId: string) => void;
}) {
  const { row } = node;
  const role = NODE_ROLE_LABELS[row.node.type] ?? NODE_ROLE_LABELS.custom;

  return (
    <>
      <div
        className={`${GRID} w-full border-b border-line pr-3 text-[11.5px] ${
          selectedNodeId === row.node.id ? 'bg-accent-50' : 'hover:bg-surface-muted'
        }`}
      >
        <span className="flex min-w-0 items-center gap-1">
          {node.edges.length > 0 ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.node.name}`}
              className="ml-6 flex size-4 shrink-0 items-center justify-center rounded text-ink-400 hover:bg-surface-muted hover:text-ink-700"
            >
              <ChevronRight size={11} className={expanded ? 'rotate-90' : ''} />
            </button>
          ) : (
            <span className="ml-6 size-4 shrink-0" />
          )}
          <button
            type="button"
            onClick={onSelectNode}
            title={`${row.node.id} · ${role.label} / ${role.zh}`}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left hover:text-accent-700"
          >
            <span className="min-w-0 truncate font-semibold text-ink-800">{row.node.name}</span>
            <span className="shrink-0 text-[9.5px] font-medium text-ink-400">{role.label}</span>
            {row.fixed && (
              <span className="shrink-0 rounded bg-accent-100 px-1 text-[9px] font-bold text-accent-700">
                FIXED
              </span>
            )}
          </button>
        </span>
        <span className="text-right font-bold tabular text-ink-900">
          {num(row.temperature_C, 1)}
        </span>
        <span className="text-right tabular text-ink-500">
          {row.power_W > 0 ? num(row.power_W, 2) : '—'}
        </span>
        <LimitCell limit_C={row.limit_C} limit_type={row.node.limit_type} />
        <MarginCell margin_C={row.margin_C} status={row.status} />
      </div>

      {expanded &&
        node.edges.map((edge) => (
          <EdgeRow
            key={edge.id}
            edge={edge}
            selected={selectedEdgeId === edge.id}
            onSelect={() => onSelectEdge(edge.id)}
          />
        ))}
    </>
  );
}

export function ResultTree({
  groups,
  hasSolution,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  forceExpanded = false,
}: {
  groups: ResultTreeGroupRow[];
  hasSolution: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  /**
   * Everything open, for the PDF. The export renders THIS component rather
   * than a print-only copy of it — two renderings of one table drift, and the
   * one that drifts is the one nobody looks at until it is in a report.
   */
  forceExpanded?: boolean;
}) {
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [openNodes, setOpenNodes] = useState<ReadonlySet<string>>(() => new Set<string>());

  const toggle = (
    set: ReadonlySet<string>,
    apply: (next: ReadonlySet<string>) => void,
    id: string,
  ) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    apply(next);
  };

  if (groups.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-[12px] text-ink-400">
        No nodes to report. / 沒有可回報的節點。
      </p>
    );
  }

  return (
    // An explicit, generous line height, because html2canvas places text from
    // the line box rather than from the element box: at the browser's default
    // `normal` it sliced the bottom third off every row of the exported PDF
    // while the same markup rendered correctly on screen. 2 rather than 1.5,
    // because the rows that survived that first correction and still clipped
    // were the Chinese ones — a CJK glyph fills more of its em box than the
    // Latin the default was tuned against.
    <div className="min-w-[46rem] leading-[2]">
      <div
        className={`${GRID} sticky top-0 z-10 border-b border-line-strong bg-surface-muted py-2 pr-3 pl-3 text-[9.5px] font-bold tracking-wide text-ink-500 uppercase`}
      >
        <span>Component · Node · Path</span>
        <span className="text-right">
          T <span className="font-semibold text-ink-400">°C</span>
        </span>
        <span className="text-right">
          Q <span className="font-semibold text-ink-400">W</span>
        </span>
        <span className="text-right">Limit</span>
        <span className="text-right">Margin</span>
      </div>

      {groups.map((group) => {
        const open = forceExpanded || openGroups.has(group.id);
        return (
          <div key={group.id} className="relative border-b border-line last:border-b-0">
            {/* The rail is the table's only always-on status signal: it says
                which components are in trouble before a single number is
                read, and it stays visible while the group is scrolled. */}
            <span
              aria-hidden
              className={`absolute top-0 bottom-0 left-0 w-[3px] ${STATUS_RAIL[group.status]}`}
            />
            <button
              type="button"
              onClick={() => toggle(openGroups, setOpenGroups, group.id)}
              aria-expanded={open}
              className={`${GRID} w-full border-b border-line bg-surface py-2 pr-3 pl-3 text-left text-[12px] hover:bg-surface-muted`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <ChevronRight
                  size={13}
                  className={`shrink-0 text-ink-400 ${open ? 'rotate-90' : ''}`}
                />
                <span className="min-w-0 truncate font-bold text-ink-900">{group.name}</span>
                {group.subtitle && (
                  <span className="shrink-0 truncate text-[10px] text-ink-400">
                    {group.subtitle}
                  </span>
                )}
                <span className="shrink-0 rounded-full bg-surface-muted px-1.5 text-[9.5px] font-semibold text-ink-400">
                  {group.nodes.length}
                </span>
              </span>
              <span className="text-right text-[13px] font-bold tabular text-ink-900">
                {num(group.peak_C, 1)}
              </span>
              <span className="text-right font-semibold tabular text-ink-700">
                {group.power_W > 0 ? num(group.power_W, 2) : '—'}
              </span>
              <LimitCell limit_C={group.limit_C} limit_type={group.limit_type} />
              <MarginCell margin_C={group.margin_C} status={group.status} />
            </button>

            {open &&
              group.nodes.map((node) => (
                <NodeRow
                  key={node.id}
                  node={node}
                  expanded={forceExpanded || openNodes.has(node.id)}
                  selectedNodeId={selectedNodeId}
                  selectedEdgeId={selectedEdgeId}
                  onToggle={() => toggle(openNodes, setOpenNodes, node.id)}
                  onSelectNode={() => onSelectNode(node.id)}
                  onSelectEdge={onSelectEdge}
                />
              ))}
          </div>
        );
      })}

      {!hasSolution && (
        <p className="px-3 py-3 text-center text-[11px] text-ink-400">
          Temperatures and heat flows appear after a solve. / 求解後才會顯示溫度與熱流。
        </p>
      )}
    </div>
  );
}
