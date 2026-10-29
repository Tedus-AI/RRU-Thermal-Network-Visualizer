/**
 * Screens 05 and 06 follow Screen 04's component list.
 *
 * A component deleted in 04 is taken out of the thermal graph — every node and
 * edge it owns, its port wiring — and out of 06's boundary assignments, in
 * every scenario. Before this, its subgraph stayed in 05 for good (Generate
 * from Preferences only rebuilds the parts that are there) and its junction
 * kept its stored power, so a part the engineer had deleted still heated the
 * solve in 07 and still showed as a surface in 06.
 *
 * Two ways in:
 * - `pruneDeletedComponents` — the delete itself (`componentStore`), and
 *   05's Generate.
 * - `startComponentDeletionSync` — whenever the loaded component list and the
 *   loaded graph belong to the same project and disagree. That is what cleans
 *   a project saved before this existed, the first time it is opened.
 */

import { boundaryPortIdOf, orphanedComponentIds } from '@/thermal/graph/componentPruning';
import { useBoundaryStore } from './boundaryStore';
import { useNetworkStore } from './networkStore';

export interface PruneResult {
  components: number;
  nodes: number;
  edges: number;
  boundary: number;
}

/** Removes the given components from the graph and from 06. No-op unless the graph of `projectId` is loaded. */
export function pruneDeletedComponents(projectId: string, componentIds: string[]): PruneResult | null {
  const net = useNetworkStore.getState();
  if (!net.network || net.projectId !== projectId || componentIds.length === 0) return null;
  const { nodes, edges } = net.pruneComponents(componentIds);
  const boundary = useBoundaryStore.getState().dropPorts(projectId, nodes.map(boundaryPortIdOf));
  return { components: componentIds.length, nodes: nodes.length, edges, boundary };
}

/**
 * The components the graph still holds but the list does not. Null when the
 * two are not the same project's, or the list is empty — an empty list is as
 * likely a load that has not happened as a project with nothing in it, and
 * pruning on it would empty the graph.
 */
export function deletedComponentsInGraph(
  componentProjectId: string | null,
  componentIds: string[],
): string[] | null {
  const net = useNetworkStore.getState();
  if (!componentProjectId || componentIds.length === 0) return null;
  if (!net.network || net.projectId !== componentProjectId) return null;
  const orphans = orphanedComponentIds(net.network, new Set(componentIds));
  return orphans.length > 0 ? orphans : null;
}

export function describePrune(result: PruneResult): string {
  const parts = [`${result.nodes} 個節點`];
  if (result.boundary > 0) parts.push(`04 的 ${result.boundary} 個邊界設定`);
  return `已從熱路徑移除 03 刪除的 ${result.components} 個元件（${parts.join('、')}）。`;
}

let started = false;

/**
 * Watches the component list and the graph. Idempotent; returns an unsubscribe.
 * `read` and `subscribe` are the component store's (passed in: that store
 * imports this module), `onPruned` says what was removed.
 */
export function startComponentDeletionSync(
  read: () => { projectId: string | null; ids: string[] },
  subscribe: (listener: () => void) => () => void,
  onPruned: (result: PruneResult) => void,
): () => void {
  if (started) return () => {};
  started = true;
  let scheduled = false;

  const check = () => {
    scheduled = false;
    const { projectId, ids } = read();
    const orphans = deletedComponentsInGraph(projectId, ids);
    if (!orphans || !projectId) return;
    const result = pruneDeletedComponents(projectId, orphans);
    if (result && result.nodes + result.boundary > 0) onPruned(result);
  };
  // After the change that triggered it has settled: two stores load one after
  // the other, and the check needs both.
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(check);
  };

  const offComponents = subscribe(schedule);
  const offNetwork = useNetworkStore.subscribe(schedule);
  schedule();
  return () => {
    offComponents();
    offNetwork();
    started = false;
  };
}
