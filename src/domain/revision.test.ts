import { describe, expect, it } from 'vitest';

import {
  createComponentRevisionSet,
  createRevision,
  hydrateComponentRevisionSet,
  hydrateSourceRevision,
  legacyRevision,
} from './revision';

describe('source revisions', () => {
  it('creates opaque revisions that advance even within the same millisecond', () => {
    const first = createRevision('project', 1_700_000_000_000);
    const second = createRevision('project', 1_700_000_000_000);

    expect(first).toMatch(/^rev:project:/);
    expect(second).toMatch(/^rev:project:/);
    expect(second).not.toBe(first);
  });

  it('hydrates a stable fallback for a pre-Phase-1 record', () => {
    const first = legacyRevision('network', '2026-08-12T09:00:00.000Z');
    const second = legacyRevision('network', '2026-08-12T09:00:00.000Z');

    expect(first).toBe(second);
    expect(first).toMatch(/^legacy:network:/);
  });

  it('keeps the three component clocks independent', () => {
    const current = createComponentRevisionSet();
    const hydrated = hydrateComponentRevisionSet(
      {
        component_revision: createRevision('component'),
        solver_input_revision: current.solver_input_revision,
        limit_revision: createRevision('limit'),
      },
      'fallback',
    );

    expect(hydrated.component_revision).not.toBe(current.component_revision);
    expect(hydrated.solver_input_revision).toBe(current.solver_input_revision);
    expect(hydrated.limit_revision).not.toBe(current.limit_revision);
  });

  it('fills every source clock without overwriting a stored clock', () => {
    const storedProject = createRevision('project');
    const hydrated = hydrateSourceRevision(
      { project_revision: storedProject },
      'legacy-solution',
    );

    expect(hydrated.project_revision).toBe(storedProject);
    expect(hydrated.component_revision).toMatch(/^legacy:component:/);
    expect(hydrated.solver_input_revision).toMatch(/^legacy:solver_input:/);
    expect(hydrated.limit_revision).toMatch(/^legacy:limit:/);
    expect(hydrated.network_revision).toMatch(/^legacy:network:/);
    expect(hydrated.scenario_revision).toMatch(/^legacy:scenario:/);
  });
});
