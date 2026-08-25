import { describe, expect, it } from 'vitest';

import { buildSharedStructure } from '@/thermal/graph/sharedStructure';
import type { NodeType, ThermalNode } from '@/thermal/types';

import {
  STRUCTURAL_NODE_TYPES,
  allowsSourcePower,
  hasStrayStructuralPower,
  nodeRoleMode,
} from './nodeRole';

function node(type: NodeType, extra: Partial<ThermalNode> = {}): ThermalNode {
  return {
    id: 'N',
    name: 'N',
    type,
    power_W: 0,
    temperature_C: null,
    temperature_source: null,
    boundary_type: null,
    ...extra,
  };
}

const fromTemplate = (type: NodeType, extra: Partial<ThermalNode> = {}) =>
  node(type, { origin: { kind: 'template' }, component_ref: 'CMP_X', ...extra });

describe('node role mode', () => {
  it('treats the end of the path as a boundary', () => {
    expect(nodeRoleMode(node('ambient'))).toBe('boundary');
    // A placeholder is a boundary whatever its type says.
    expect(nodeRoleMode(node('custom', { boundary_role: 'placeholder' }))).toBe('boundary');
  });

  it('treats every structural type as structure', () => {
    for (const type of STRUCTURAL_NODE_TYPES) {
      expect(nodeRoleMode(node(type))).toBe('structure');
    }
  });

  /**
   * The bug this module exists for. The shared structure builds these nodes,
   * so the old `origin.kind === 'template'` gate let them through as fully
   * editable — and `buildSolveInput` injects the power of every node.
   */
  it('locks power on the nodes the shared structure actually builds', () => {
    for (const preset of ['SINGLE_MAIN_BASE', 'DUAL_HSK_BASE'] as const) {
      for (const built of buildSharedStructure(preset).nodes) {
        expect(allowsSourcePower(built)).toBe(false);
        expect(['boundary', 'structure']).toContain(nodeRoleMode(built));
      }
    }
  });

  /**
   * Structure outranks origin on purpose: DIRECT_METAL gives a component a
   * `housing` node, and that must not offer a source power either.
   */
  it('keeps structure ahead of where the node came from', () => {
    expect(nodeRoleMode(fromTemplate('housing'))).toBe('structure');
    expect(nodeRoleMode(node('heat_sink_base', { origin: { kind: 'manual' } }))).toBe('structure');
  });

  it('separates a component heat source from a component passive node', () => {
    expect(nodeRoleMode(fromTemplate('junction', { power_W: 45, limit_C: 125 }))).toBe(
      'derived_source',
    );
    expect(nodeRoleMode(fromTemplate('tim_interface'))).toBe('derived_passive');
    // A limit with no power still counts as source data worth showing.
    expect(nodeRoleMode(fromTemplate('case', { limit_C: 110 }))).toBe('derived_source');
  });

  it('leaves a hand-drawn node fully editable', () => {
    expect(nodeRoleMode(node('custom', { origin: { kind: 'manual' } }))).toBe('manual');
    expect(allowsSourcePower(node('custom', { origin: { kind: 'manual' } }))).toBe(true);
    // A custom node is the escape hatch for a busbar or a cable loss, so it is
    // deliberately NOT in the structural set even though it often is structure.
    expect(STRUCTURAL_NODE_TYPES.has('custom')).toBe(false);
  });

  it('only ever allows power on a hand-drawn node', () => {
    expect(allowsSourcePower(node('ambient'))).toBe(false);
    expect(allowsSourcePower(node('heat_sink_base'))).toBe(false);
    expect(allowsSourcePower(fromTemplate('junction', { power_W: 45 }))).toBe(false);
    expect(allowsSourcePower(fromTemplate('tim_interface'))).toBe(false);
  });

  /** Stored data is shown and flagged, never silently zeroed. */
  it('flags power stranded on structure instead of hiding it', () => {
    expect(hasStrayStructuralPower(node('heat_sink_base', { power_W: 12 }))).toBe(true);
    expect(hasStrayStructuralPower(node('ambient', { power_W: 3 }))).toBe(true);
    expect(hasStrayStructuralPower(node('heat_sink_base'))).toBe(false);
    // A real source is not "stray".
    expect(hasStrayStructuralPower(fromTemplate('junction', { power_W: 45 }))).toBe(false);
  });
});
