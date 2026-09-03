/**
 * An embedded heat pipe has to state how many pipes.
 *
 * The count is read twice, and both readings move the answer the same way: the
 * branch is `R_one_pipe / pipes`, and the copper carved out of the contact face
 * is `L x W x pipes` — the area the parallel aluminium branch does NOT get to
 * spread through. Blank, it silently became one pipe: a number nobody stated,
 * halving the pipe's conductance and handing the aluminium a face twice its
 * real size.
 *
 * Found on a real XCZU67DR: two 6.5 mm pipes quoted at 0.13 °C/W each is a
 * 0.065 branch and 455 mm² of copper. Read as one pipe it is 0.130 and 227.5.
 */

import { describe, expect, it } from 'vitest';

import { createComponent, emptyMount, type Component } from './component';
import { statusOf, validateComponent } from './componentReadiness';

function withMount(mount: Partial<ReturnType<typeof emptyMount>>): Component {
  const base = createComponent({
    id: 'CMP_FPGA',
    name: 'XCZU67DR',
    category: 'Digital',
    qty: 1,
    power_W: 35,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-09-03T00:00:00.000Z',
    },
  });
  return {
    ...base,
    thermal_spec: {
      ...base.thermal_spec,
      mount: { ...emptyMount('EmbeddedHeatPipe'), ...mount },
    },
  };
}

const pipeCountIssues = (component: Component) =>
  validateComponent(component).filter((issue) => issue.field === 'mount.heat_pipe_count');

describe('embedded heat pipe count', () => {
  it('is an error when left blank', () => {
    const issues = pipeCountIssues(
      withMount({ type: 'EmbeddedHeatPipe', contact_L_mm: 35, contact_W_mm: 6.5 }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message_zh).toContain('熱管數量');
    expect(statusOf(withMount({ type: 'EmbeddedHeatPipe' }))).toBe('ERROR');
  });

  it('is satisfied by a whole number of pipes', () => {
    expect(
      pipeCountIssues(withMount({ type: 'EmbeddedHeatPipe', heat_pipe_count: 2 })),
    ).toEqual([]);
  });

  it('rejects a fraction of a pipe, and none at all', () => {
    for (const count of [0, 1.5, -1]) {
      const issues = pipeCountIssues(
        withMount({ type: 'EmbeddedHeatPipe', heat_pipe_count: count }),
      );
      expect(issues, `count ${count}`).toHaveLength(1);
      expect(issues[0].severity).toBe('error');
    }
  });

  /** Only the embedded mount reads a count, so only it may demand one. */
  it('says nothing about a mount that has no pipes', () => {
    for (const type of ['Direct', 'Pedestal', 'VaporChamber'] as const) {
      const component = withMount({ type });
      expect(pipeCountIssues(component), type).toEqual([]);
    }
  });
});
