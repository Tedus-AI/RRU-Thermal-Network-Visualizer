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
 */

import { useState } from 'react';
import { ChevronRight, CornerDownRight } from 'lucide-react';

import type {
  ResultTreeEdgeRow,
  ResultTreeGroupRow,
  ResultTreeNodeRow,
} from './resultViewModel';
import { NODE_ROLE_LABELS, num, rth, signed } from './resultViewModel';

const GRID = 'grid grid-cols-[minmax(11rem,1.6fr)_5rem_4.5rem_5rem_6rem_5rem_5.5rem] items-center gap-x-2';

function MarginCell({
  margin_C,
  status,
}: {
  margin_C: number | null;
  status: 'pass' | 'over' | 'na';
}) {
  if (margin_C == null) return <span className="text-right text-ink-400">N/A</span>;
  return (
    <span
      className={`text-right font-bold tabular ${
        status === 'over' ? 'text-danger-600' : 'text-ok-600'
      }`}
    >
      {signed(margin_C, 1)}
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
      className={`${GRID} w-full border-b border-line/60 py-1 pr-2 pl-11 text-left text-[11px] last:border-b-0 hover:bg-surface-muted ${
        selected ? 'bg-accent-50' : ''
      }`}
    >
      <span className="flex min-w-0 items-center gap-1 text-ink-500">
        <CornerDownRight size={11} className="shrink-0 text-ink-400" />
        <span className="truncate">{edge.name}</span>
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
      </span>
      <span className="text-right text-ink-400">—</span>
      <span className="text-right tabular text-ink-700">
        {edge.delta_T_C != null ? num(edge.delta_T_C, 1) : 'N/A'}
      </span>
      <span className="text-right tabular text-ink-700">
        {edge.heat_flow_W != null ? num(edge.heat_flow_W, 1) : 'N/A'}
      </span>
      <span className="text-right tabular text-ink-700">{rth(edge.rth_C_per_W)}</span>
      <span className="text-right text-ink-400">—</span>
      <span className="text-right text-ink-400">—</span>
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
        className={`${GRID} w-full border-b border-line/60 text-[11px] ${
          selectedNodeId === row.node.id ? 'bg-accent-50' : ''
        }`}
      >
        <span className="flex min-w-0 items-center gap-0.5">
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
            className="min-w-0 flex-1 truncate py-1 text-left font-semibold text-ink-800 hover:text-accent-700"
          >
            {row.node.name}
            {row.fixed && (
              <span className="ml-1 text-[9px] font-bold text-accent-600">FIXED</span>
            )}
          </button>
        </span>
        <span className="text-right font-bold tabular text-ink-900">
          {num(row.temperature_C, 1)}
        </span>
        <span className="text-right tabular text-ink-500">
          {num(row.delta_to_ambient_C, 1)}
        </span>
        <span className="text-right tabular text-ink-500">
          {row.power_W > 0 ? num(row.power_W, 2) : '—'}
        </span>
        <span className="text-right text-ink-400">—</span>
        <span className="text-right tabular text-ink-500">{num(row.limit_C, 0)}</span>
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
}: {
  groups: ResultTreeGroupRow[];
  hasSolution: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
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
    <div className="min-w-[46rem]">
      <div
        className={`${GRID} sticky top-0 z-10 border-b border-line bg-surface-muted py-1.5 pr-2 pl-2 text-[10px] font-bold text-ink-500`}
      >
        <span>Component · Node · Path / 元件・節點・路徑</span>
        <span className="text-right">T (°C)</span>
        <span className="text-right">ΔT (K)</span>
        <span className="text-right">Q (W)</span>
        <span className="text-right">Rth (°C/W)</span>
        <span className="text-right">Limit</span>
        <span className="text-right">Margin</span>
      </div>

      {groups.map((group) => {
        const open = openGroups.has(group.id);
        return (
          <div key={group.id}>
            <button
              type="button"
              onClick={() => toggle(openGroups, setOpenGroups, group.id)}
              aria-expanded={open}
              className={`${GRID} w-full border-b border-line bg-surface py-1.5 pr-2 pl-2 text-left text-[11.5px] hover:bg-surface-muted`}
            >
              <span className="flex min-w-0 items-center gap-1">
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
                <span className="shrink-0 text-[10px] text-ink-400">
                  · {group.nodes.length}
                </span>
              </span>
              <span className="text-right font-bold tabular text-ink-900">
                {num(group.peak_C, 1)}
              </span>
              <span className="text-right text-ink-400">—</span>
              <span className="text-right tabular text-ink-700">
                {group.power_W > 0 ? num(group.power_W, 2) : '—'}
              </span>
              <span className="text-right text-ink-400">—</span>
              <span className="text-right tabular text-ink-500">{num(group.limit_C, 0)}</span>
              <MarginCell margin_C={group.margin_C} status={group.status} />
            </button>

            {open &&
              group.nodes.map((node) => (
                <NodeRow
                  key={node.id}
                  node={node}
                  expanded={openNodes.has(node.id)}
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

      <p className="px-2 py-2 text-[10px] leading-relaxed text-ink-400">
        {hasSolution
          ? 'A group shows its hottest node and its tightest margin — the reason to open it. A negative Q means heat flows against the drawn arrow, which is a valid result. Limits come from the component records; ranking is Screen 08.'
          : 'Rth is read from the topology; temperatures, Q and ΔT appear after a solve.'}
        <span className="block">
          {hasSolution
            ? '群組列顯示其最高溫節點與最緊餘裕；Q 為負代表流向與圖示相反，屬合法結果。限制值來自元件資料，排序與優先級屬於 08。'
            : '熱阻來自拓樸；溫度、Q 與 ΔT 於求解後才會出現。'}
        </span>
      </p>
    </div>
  );
}
