/**
 * Node temperatures and edge heat flows, as one table.
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
 * Three kinds of row, and telling them apart
 *
 * Opening one component adds twenty rows, and when every row was the same
 * weight on the same background the reader could not see where that component
 * ended and the next began — "一展開就感覺有點亂，全部搞在一起". Depth alone
 * does not carry it: a 24 px indent is invisible against a 1100 px row.
 *
 * So each component is its own `<tbody>`, and three signals run together:
 *
 *   - a status RAIL, one continuous coloured stripe down the left of every row
 *     in the block, which both bounds the block and says whether the part is
 *     inside its limit;
 *   - a GROUND, changing per depth — the group header on the muted tint, its
 *     nodes on white, their edges on the canvas grey, so an edge reads as
 *     inset into the node above it;
 *   - a GAP, a spacer row closing an open block, which is the signal the eye
 *     actually catches when scrolling.
 *
 * ---------------------------------------------------------------------------
 * Why an edge has no columns
 *
 * It used to have. Seven columns served all three kinds of row, and two could
 * only ever be filled by one kind: `Rth` exists on edges alone and the rise
 * above ambient on nodes alone, so the ordinary view was two columns of dashes.
 * Giving the columns to the nodes fixed that and left a second problem — the
 * edge's own numbers, right-aligned, landed under `Q`, `LIMIT` and `MARGIN`
 * and read as though they belonged to them.
 *
 * An edge row now spans the whole table and lays out its own content, with its
 * three numbers immediately after the name it belongs to. It is a connection,
 * not a node: it has a drop, a flow and a resistance, and none of those is the
 * column it was sitting under.
 */

import { useState } from 'react';

import { LIMIT_TYPE_LABELS, type LimitType } from '@/domain/component';
import { ChevronRight, CornerDownRight } from 'lucide-react';
import { ColumnResizer, useColumnWidths } from '@/ui/ResizableColumns';

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
 * function oklab". The export failed on a browser run for exactly this, and the
 * failure is invisible from a unit test, so `resultTable.test.tsx` guards it.
 */

const COLUMNS = [
  { id: 'name', label: 'Component · Node · Path', zh: '元件・節點・路徑', align: 'text-left' },
  { id: 't', label: 'T', unit: '°C', zh: '溫度', align: 'text-right' },
  { id: 'q', label: 'Q', unit: 'W', zh: '功率', align: 'text-right' },
  { id: 'limit', label: 'Limit', zh: '限制值', align: 'text-right' },
  { id: 'margin', label: 'Margin', zh: '餘裕', align: 'text-right' },
] as const;

const COLUMN_DEFAULTS = { name: 420, t: 92, q: 92, limit: 116, margin: 112 };

/**
 * The sized columns, plus one filler that takes whatever the panel has spare.
 *
 * `table-fixed` needs every width stated for a dragged column to hold, and a
 * table of stated widths stops where they stop — 832 px of table adrift in an
 * 1180 px window, with the columns huddled to the left. A final column with no
 * width absorbs the slack instead, so the table fills its panel at any size and
 * the five real columns keep exactly the widths they were given.
 */
const SPAN = COLUMNS.length + 1;

/** The rail down a block, by the tightest margin under it. */
const RAIL: Record<'pass' | 'over' | 'na', string> = {
  pass: 'var(--color-ok-500)',
  over: 'var(--color-danger-500)',
  na: 'var(--color-line-strong)',
};

/** Every row in a block carries the rail, so the stripe is continuous. */
function railStyle(status: 'pass' | 'over' | 'na') {
  return { borderLeft: `3px solid ${RAIL[status]}` };
}

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
  if (limit_C == null) return <span className="text-ink-400">—</span>;
  return (
    <span className="tabular text-ink-500">
      {num(limit_C, 0)}
      {limit_type && (
        <span
          // `leading-none` on every badge: the table sets a generous line
          // height for html2canvas, and at 9 px that pushed the glyphs clean
          // out of the badge, which rasterized as an empty coloured pill.
          className="ml-1 rounded bg-surface-muted px-1 py-0.5 text-[9px] leading-none font-bold text-ink-400"
          title={`${LIMIT_TYPE_LABELS[limit_type].en} / ${LIMIT_TYPE_LABELS[limit_type].zh}`}
        >
          {limit_type}
        </span>
      )}
    </span>
  );
}

/**
 * Over limit is a filled pill, inside is plain text.
 *
 * Colour alone carried this, and the two greens and two reds of a long table
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
  if (margin_C == null) return <span className="text-ink-400">—</span>;
  if (status === 'over') {
    return (
      <span className="inline-block rounded bg-danger-600 px-1.5 py-0.5 text-[11px] leading-none font-bold tabular text-white">
        {signed(margin_C, 1)}
      </span>
    );
  }
  return <span className="font-bold tabular text-ok-600">{signed(margin_C, 1)}</span>;
}

/**
 * One number and its unit, as a chip on an edge row.
 *
 * `inline-block` and inline children, NOT flex. html2canvas does not size a
 * flex container the way the browser does: in the rasterized PDF every chip
 * drew its text straight through its own rounded border, the box sized to
 * something narrower than the text inside it. Ordinary inline flow it gets
 * right, and the chips look the same on screen either way.
 */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-block shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 whitespace-nowrap">
      <span className="mr-1 text-[9px] leading-none font-semibold tracking-wide text-ink-400 uppercase">
        {label}
      </span>
      <span className="text-[11px] leading-none font-semibold tabular text-ink-700">{value}</span>
    </span>
  );
}

function EdgeRow({
  edge,
  status,
  selected,
  onSelect,
}: {
  edge: ResultTreeEdgeRow;
  status: 'pass' | 'over' | 'na';
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      // A drop and an outflow read differently: one explains the node above it,
      // the other says where its heat goes next.
      title={`${edge.outgoing ? 'to' : 'from'} ${edge.counterpart_name}`}
      className={`cursor-pointer ${selected ? 'bg-accent-50' : 'bg-canvas hover:bg-accent-50'}`}
    >
      {/* Spanning, because an edge has no temperature, no limit and no margin,
          and its own three numbers are not the columns it would sit under. */}
      <td colSpan={SPAN} className="py-1.5 pr-3 pl-14" style={railStyle(status)}>
        <span className="flex items-center gap-2">
          <CornerDownRight size={11} className="shrink-0 text-ink-400" />
          {/* Fixed width, not `max-w`: the chips after it are a column of their
              own, and letting the name size them left every row's numbers at a
              different x. `py` on top of the truncation, because an
              `overflow: hidden` box exactly one line tall is what clipped the
              descenders off every Chinese edge label in the rasterized PDF. */}
          <span className="w-[21rem] shrink-0 truncate py-0.5 text-[11px] text-ink-500">
            {edge.name}
            <span className="ml-1 text-ink-400">
              {edge.outgoing ? '→' : '←'} {edge.counterpart_name}
            </span>
          </span>
          {edge.rth_origin === 'boundary_scenario' && (
            <span className="shrink-0 rounded bg-accent-100 px-1 py-0.5 text-[9px] leading-none font-bold text-accent-700">
              06
            </span>
          )}
          {edge.rth_origin === 'spreading_biot' && (
            <span className="shrink-0 rounded bg-warn-100 px-1 py-0.5 text-[9px] leading-none font-bold text-warn-600">
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
        </span>
      </td>
    </tr>
  );
}

function NodeRows({
  node,
  status,
  expanded,
  selectedNodeId,
  selectedEdgeId,
  onToggle,
  onSelectNode,
  onSelectEdge,
}: {
  node: ResultTreeNodeRow;
  status: 'pass' | 'over' | 'na';
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
      <tr
        className={`border-t border-line ${
          selectedNodeId === row.node.id ? 'bg-accent-50' : 'bg-surface hover:bg-surface-muted'
        }`}
      >
        <td className="py-1.5 pr-2 pl-2" style={railStyle(status)}>
          <span className="flex items-center gap-1">
            {node.edges.length > 0 ? (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.node.name}`}
                className="ml-5 flex size-4 shrink-0 items-center justify-center rounded text-ink-400 hover:bg-surface-muted hover:text-ink-700"
              >
                <ChevronRight size={11} className={expanded ? 'rotate-90' : ''} />
              </button>
            ) : (
              <span className="ml-5 size-4 shrink-0" />
            )}
            <button
              type="button"
              onClick={onSelectNode}
              title={`${row.node.id} · ${role.label} / ${role.zh}`}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-accent-700"
            >
              <span className="min-w-0 truncate text-[12px] font-semibold text-ink-800">
                {row.node.name}
              </span>
              <span className="shrink-0 text-[9.5px] font-medium text-ink-400">{role.label}</span>
              {row.fixed && (
                <span className="shrink-0 rounded bg-accent-100 px-1 py-0.5 text-[9px] leading-none font-bold text-accent-700">
                  FIXED
                </span>
              )}
            </button>
          </span>
        </td>
        <td className="py-1.5 pr-3 text-right text-[12px] font-bold tabular text-ink-900">
          {num(row.temperature_C, 1)}
        </td>
        <td className="py-1.5 pr-3 text-right text-[12px] tabular text-ink-500">
          {row.power_W > 0 ? num(row.power_W, 2) : '—'}
        </td>
        <td className="py-1.5 pr-3 text-right text-[12px]">
          <LimitCell limit_C={row.limit_C} limit_type={row.node.limit_type} />
        </td>
        <td className="py-1.5 pr-3 text-right text-[12px]">
          <MarginCell margin_C={row.margin_C} status={row.status} />
        </td>
        <td />
      </tr>

      {expanded &&
        node.edges.map((edge) => (
          <EdgeRow
            key={edge.id}
            edge={edge}
            status={status}
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
   * than a print-only copy — two renderings of one table drift, and the one
   * that drifts is the one nobody looks at until it is in a report.
   */
  forceExpanded?: boolean;
}) {
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [openNodes, setOpenNodes] = useState<ReadonlySet<string>>(() => new Set<string>());
  const { widths, startResize } = useColumnWidths('07.results', COLUMN_DEFAULTS);

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

  const total = COLUMNS.reduce((sum, column) => sum + (widths[column.id] ?? 0), 0);

  return (
    // An explicit, generous line height, because html2canvas places text from
    // the line box rather than from the element box: at the browser's default
    // `normal` it sliced the bottom third off every row of the exported PDF
    // while the same markup rendered correctly on screen. 2 rather than 1.5,
    // because the rows that survived that first correction and still clipped
    // were the Chinese ones — a CJK glyph fills more of its em box than the
    // Latin the default was tuned against.
    <div className="leading-[2]" data-result-table>
      {/* `table-fixed` so the colgroup widths are authoritative: under the
          default auto layout a width is only a suggestion, and a dragged
          column springs back the moment the content disagrees. */}
      <table className="table-fixed border-collapse" style={{ width: '100%', minWidth: total }}>
        <colgroup>
          {COLUMNS.map((column) => (
            <col key={column.id} style={{ width: widths[column.id] }} />
          ))}
          <col />
        </colgroup>
        <thead>
          <tr className="bg-surface-muted">
            {COLUMNS.map((column, index) => (
              <th
                key={column.id}
                scope="col"
                // Descending z across the row. The resize handle sits ASTRIDE
                // the seam, so it overflows into the next header; with one
                // shared z-index that neighbour won — later sibling, same
                // layer — and the handle was unclickable on every column.
                style={{ zIndex: COLUMNS.length - index + 10 }}
                className={`sticky top-0 border-b border-line-strong bg-surface-muted px-3 py-2 text-[9.5px] font-bold tracking-wide text-ink-500 uppercase ${column.align}`}
              >
                {column.label}
                {'unit' in column && column.unit && (
                  <span className="ml-1 font-semibold text-ink-400">{column.unit}</span>
                )}
                {!forceExpanded && (
                  <ColumnResizer
                    id={column.id}
                    labelEn={column.label}
                    labelZh={column.zh}
                    onResize={startResize}
                  />
                )}
              </th>
            ))}
            <th
              scope="col"
              aria-hidden
              className="sticky top-0 border-b border-line-strong bg-surface-muted"
            />
          </tr>
        </thead>

        {groups.map((group) => {
          const open = forceExpanded || openGroups.has(group.id);
          return (
            <tbody key={group.id} data-result-block={group.id}>
              <tr
                className="cursor-pointer border-t-[3px] border-line-strong bg-surface-muted hover:bg-canvas"
                onClick={() => toggle(openGroups, setOpenGroups, group.id)}
                data-result-block-header
              >
                <td className="py-2 pr-2 pl-2" style={railStyle(group.status)}>
                  <span className="flex items-center gap-1.5">
                    <ChevronRight
                      size={13}
                      className={`shrink-0 text-ink-500 ${open ? 'rotate-90' : ''}`}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate text-[12.5px] font-bold text-ink-900">
                      {group.name}
                    </span>
                    {group.subtitle && (
                      <span className="shrink-0 truncate text-[10px] text-ink-400">
                        {group.subtitle}
                      </span>
                    )}
                    <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-[9.5px] leading-none font-bold text-ink-500">
                      {group.nodes.length}
                    </span>
                  </span>
                </td>
                <td className="py-2 pr-3 text-right text-[13px] font-bold tabular text-ink-900">
                  {num(group.peak_C, 1)}
                </td>
                <td className="py-2 pr-3 text-right text-[12px] font-semibold tabular text-ink-700">
                  {group.power_W > 0 ? num(group.power_W, 2) : '—'}
                </td>
                <td className="py-2 pr-3 text-right text-[12px]">
                  <LimitCell limit_C={group.limit_C} limit_type={group.limit_type} />
                </td>
                <td className="py-2 pr-3 text-right text-[12px]">
                  <MarginCell margin_C={group.margin_C} status={group.status} />
                </td>
                <td />
              </tr>

              {open &&
                group.nodes.map((node) => (
                  <NodeRows
                    key={node.id}
                    node={node}
                    status={group.status}
                    expanded={forceExpanded || openNodes.has(node.id)}
                    selectedNodeId={selectedNodeId}
                    selectedEdgeId={selectedEdgeId}
                    onToggle={() => toggle(openNodes, setOpenNodes, node.id)}
                    onSelectNode={() => onSelectNode(node.id)}
                    onSelectEdge={onSelectEdge}
                  />
                ))}

              {/* The gap is what the eye actually catches while scrolling: it
                  says this component is finished before the next name is read.
                  Only under an OPEN block — a list of closed groups reads
                  better tight. */}
              {open && (
                <tr aria-hidden data-result-block-gap>
                  <td colSpan={SPAN} className="h-2 bg-canvas p-0" />
                </tr>
              )}
            </tbody>
          );
        })}
      </table>

      {!hasSolution && (
        <p className="px-3 py-3 text-center text-[11px] text-ink-400">
          Temperatures and heat flows appear after a solve. / 求解後才會顯示溫度與熱流。
        </p>
      )}
    </div>
  );
}
