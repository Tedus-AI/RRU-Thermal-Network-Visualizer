/**
 * "Edit in 05" as a link that lands on the field.
 *
 * The two things that would break it silently: a screen reading the wrong
 * parameter and selecting nothing, and the parameter surviving in the URL so a
 * reload re-selects something the engineer has navigated away from. Both are
 * asserted here rather than left to a browser pass.
 */

import { describe, expect, it, vi } from 'vitest';

import { FOCUS_PARAM, consumeFocus, focusHref } from './focusLink';

describe('focusHref', () => {
  it('sends an edge to Screen 05', () => {
    expect(focusHref('P1', { screen: '05', edge_id: 'EDGE_A_B' })).toBe(
      '/project/P1/thermal-path?focusEdge=EDGE_A_B',
    );
  });

  it('sends a node to Screen 06', () => {
    expect(focusHref('P1', { screen: '06', node_id: 'NODE_FIN' })).toBe(
      '/project/P1/boundary?focusNode=NODE_FIN',
    );
  });

  it('sends a component to Screen 04', () => {
    expect(focusHref('P1', { screen: '04', component_id: 'CMP_1' })).toBe(
      '/project/P1/components?focusComponent=CMP_1',
    );
  });

  /** An id for the wrong screen is not smuggled through under another name. */
  it('drops an id the destination screen does not read', () => {
    expect(focusHref('P1', { screen: '05', node_id: 'NODE_FIN' })).toBe('/project/P1/thermal-path');
    expect(focusHref('P1', { screen: '06', edge_id: 'EDGE_A_B' })).toBe('/project/P1/boundary');
  });

  it('escapes a project id that needs it', () => {
    expect(focusHref('a b/c', { screen: '04', component_id: 'X' })).toBe(
      '/project/a%20b%2Fc/components?focusComponent=X',
    );
  });
});

describe('consumeFocus', () => {
  it('returns the value and takes it out of the URL without a history entry', () => {
    const navigate = vi.fn();
    const params = new URLSearchParams(`${FOCUS_PARAM.edge}=E1`);

    expect(consumeFocus(params, FOCUS_PARAM.edge, navigate as never)).toBe('E1');
    expect(navigate).toHaveBeenCalledWith({ search: '' }, { replace: true });
  });

  it('leaves the other parameters alone', () => {
    const navigate = vi.fn();
    const params = new URLSearchParams(`tab=source&${FOCUS_PARAM.node}=N1`);

    expect(consumeFocus(params, FOCUS_PARAM.node, navigate as never)).toBe('N1');
    expect(navigate).toHaveBeenCalledWith({ search: '?tab=source' }, { replace: true });
  });

  it('does nothing at all when the parameter is absent', () => {
    const navigate = vi.fn();
    expect(consumeFocus(new URLSearchParams('tab=source'), FOCUS_PARAM.edge, navigate as never)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
