/**
 * "Edit in 05" as a link that actually lands on the field.
 *
 * Screen 08 names the input behind a resistance and the screen that owns it.
 * Naming it is half an answer: the reader still has to arrive on that screen,
 * find the edge among eighty-five, and open it. So the name is a link, and the
 * link carries which object to select — the receiving screen selects it on
 * arrival, which opens the inspector the field lives in.
 *
 * One query parameter per kind of object rather than one generic `id`, because
 * a node id and an edge id are not interchangeable and a screen reading the
 * wrong one would silently select nothing. The parameter is consumed and
 * removed on arrival, so a reload or a back-and-forward does not re-select
 * something the engineer has since navigated away from.
 */

import type { NavigateFunction } from 'react-router-dom';

import { projectPath } from './navigation';

export const FOCUS_PARAM = {
  /** Screen 05 — select this graph edge and open its inspector. */
  edge: 'focusEdge',
  /** Screen 06 — select the boundary port on this graph node. */
  node: 'focusNode',
  /** Screen 04 — select this component. */
  component: 'focusComponent',
} as const;

export interface FocusTarget {
  screen: '04' | '05' | '06';
  edge_id?: string;
  node_id?: string;
  component_id?: string;
}

const SCREEN_PATH: Record<FocusTarget['screen'], string> = {
  '04': 'components',
  '05': 'thermal-path',
  '06': 'boundary',
};

/** The route a lever's "Edit in" cell points at, selection included. */
export function focusHref(projectId: string, target: FocusTarget): string {
  const path = projectPath(projectId, SCREEN_PATH[target.screen]);
  const params = new URLSearchParams();
  if (target.screen === '05' && target.edge_id) params.set(FOCUS_PARAM.edge, target.edge_id);
  if (target.screen === '06' && target.node_id) params.set(FOCUS_PARAM.node, target.node_id);
  if (target.screen === '04' && target.component_id) {
    params.set(FOCUS_PARAM.component, target.component_id);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Read a focus parameter once and take it out of the URL.
 *
 * Removal is `replace`, so it does not add a history entry the back button
 * would have to walk through — the engineer came from Screen 08 and back should
 * return them there.
 */
export function consumeFocus(
  params: URLSearchParams,
  key: string,
  navigate: NavigateFunction,
): string | null {
  const value = params.get(key);
  if (!value) return null;
  const next = new URLSearchParams(params);
  next.delete(key);
  const query = next.toString();
  navigate({ search: query ? `?${query}` : '' }, { replace: true });
  return value;
}
