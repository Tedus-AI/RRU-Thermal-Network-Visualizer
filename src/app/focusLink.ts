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
 *
 * Selecting the object is still not the whole journey. An edge inspector has
 * five tabs and a boundary profile a dozen dimensions, so the link also carries
 * WHICH FIELD — as the DOM id the receiving screen already gives that input —
 * and `revealField` opens whatever holds it, scrolls it into the middle of the
 * view, puts the caret in it and flashes it. "Contact area" then lands on the
 * contact-area box, which is what "Edit in" ought to have meant all along.
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
  /** Any screen — reveal the input with this DOM id once the object is open. */
  field: 'focusField',
} as const;

export interface FocusTarget {
  screen: '04' | '05' | '06';
  edge_id?: string;
  node_id?: string;
  component_id?: string;
  /** DOM id of the input to reveal — `param-thickness_mm`, `bc-fin-finGap_mm`. */
  field?: string;
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
  if (target.field) params.set(FOCUS_PARAM.field, target.field);
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

/** How long to keep looking for the field, and how long it stays lit. */
const REVEAL_TRIES = 40;
const REVEAL_INTERVAL_MS = 100;
const FLASH_MS = 2600;

/**
 * Scroll to an input, put the caret in it, and light it up.
 *
 * It polls rather than looking once: the field usually appears a beat later
 * than the arrival — the object has to be selected, its inspector rendered and,
 * on Screen 05, the right tab opened — and a single `getElementById` on the
 * frame the route changes would find nothing every time. Four seconds of
 * looking, then it gives up quietly; a link that lands on the right screen is
 * still most of the answer.
 *
 * The flash is what makes it readable. Focus alone moves a caret the reader is
 * not watching for, and on a form of a dozen boxes that is indistinguishable
 * from having landed on the wrong one.
 */
export function revealField(elementId: string): () => void {
  let tries = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flash: ReturnType<typeof setTimeout> | undefined;
  let lit: HTMLElement | null = null;

  const tick = () => {
    const element = document.getElementById(elementId);
    if (!element) {
      if (tries++ < REVEAL_TRIES) timer = setTimeout(tick, REVEAL_INTERVAL_MS);
      return;
    }
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
      element.focus({ preventScroll: true });
      if (element instanceof HTMLInputElement) element.select();
    }
    element.classList.add('field-flash');
    lit = element;
    flash = setTimeout(() => element.classList.remove('field-flash'), FLASH_MS);
  };

  tick();

  return () => {
    if (timer) clearTimeout(timer);
    if (flash) clearTimeout(flash);
    lit?.classList.remove('field-flash');
  };
}
