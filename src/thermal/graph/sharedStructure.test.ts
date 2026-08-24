import { describe, expect, it } from 'vitest';

import { normalizeZoneKey, UNASSIGNED_ZONE } from '@/domain/component';
import { resolvePortTarget, suggestedZoneFor } from './networkBuilder';
import { structureNodeId } from './idFactory';
import {
  STRUCTURE_PRESETS,
  buildSharedStructure,
  presetZones,
  zoneKeyOf,
} from './sharedStructure';

describe('supported HSK structures', () => {
  it('exposes only the two product structures', () => {
    expect(STRUCTURE_PRESETS).toEqual(['SINGLE_MAIN_BASE', 'DUAL_HSK_BASE']);
  });

  it('rejects removed preset identifiers instead of keeping hidden compatibility', () => {
    expect(() =>
      buildSharedStructure('FUNCTIONAL_ZONES' as Parameters<typeof buildSharedStructure>[0]),
    ).toThrow('Unsupported HSK structure preset');
  });

  for (const preset of STRUCTURE_PRESETS) {
    it(`keeps ${preset} picker targets identical to its graph zones`, () => {
      const built = buildSharedStructure(preset).zones;
      const offered = presetZones(preset);

      expect(offered).toHaveLength(built.length);
      for (const zone of built) {
        const key = zoneKeyOf(zone.id, preset);
        const match = offered.find((candidate) => candidate.key === key);
        expect(match, `no key offered for built zone ${zone.id}`).toBeDefined();
        expect(match!.name).toBe(zone.name);
      }
    });
  }

  it('uses the physical HSK key directly for the single structure', () => {
    expect(presetZones('SINGLE_MAIN_BASE').map((zone) => zone.key)).toEqual(['HSK_BASE']);
    expect(buildSharedStructure('SINGLE_MAIN_BASE').zones.map((zone) => zone.id)).toEqual([
      'NODE_HSK_BASE',
    ]);
  });

  it('provides exact RF and Digital attachment targets for the dual structure', () => {
    const structure = buildSharedStructure('DUAL_HSK_BASE');
    expect(presetZones('DUAL_HSK_BASE').map((zone) => zone.key)).toEqual([
      'RF_HSK_BASE',
      'DIGITAL_HSK_BASE',
    ]);
    expect(structure.zones.map((zone) => zone.id)).toEqual([
      'NODE_RF_HSK_BASE',
      'NODE_DIGITAL_HSK_BASE',
    ]);
  });
});

describe('independent heat-sink tails', () => {
  it('builds one combined base/fin-root plane for the shared HSK', () => {
    const structure = buildSharedStructure('SINGLE_MAIN_BASE');
    expect(structure.nodes.map((node) => node.id)).toEqual([
      'NODE_HSK_BASE',
      'NODE_FIN_SURFACE',
      'NODE_AMBIENT_PLACEHOLDER',
    ]);
    expect(structure.nodes.filter((node) => node.boundary_role === 'placeholder')).toHaveLength(1);
  });

  it('builds two isolated HSK → fin → ambient paths', () => {
    const structure = buildSharedStructure('DUAL_HSK_BASE');
    const ids = structure.nodes.map((node) => node.id);
    expect(ids).toEqual([
      'NODE_RF_HSK_BASE',
      'NODE_RF_FIN_SURFACE',
      'NODE_RF_AMBIENT_PLACEHOLDER',
      'NODE_DIGITAL_HSK_BASE',
      'NODE_DIGITAL_FIN_SURFACE',
      'NODE_DIGITAL_AMBIENT_PLACEHOLDER',
    ]);
    expect(structure.nodes.filter((node) => node.boundary_role === 'placeholder')).toHaveLength(2);
    expect(structure.edges).toHaveLength(4);

    const crossLinks = structure.edges.filter(
      (edge) =>
        (edge.from.includes('RF_') && edge.to.includes('DIGITAL_')) ||
        (edge.from.includes('DIGITAL_') && edge.to.includes('RF_')),
    );
    expect(crossLinks).toEqual([]);
  });

  it('does not confuse RF_HSK_BASE with the shorter HSK_BASE key', () => {
    expect(zoneKeyOf('NODE_RF_HSK_BASE', 'DUAL_HSK_BASE')).toBe('RF_HSK_BASE');
    expect(zoneKeyOf('NODE_DIGITAL_HSK_BASE', 'DUAL_HSK_BASE')).toBe('DIGITAL_HSK_BASE');
    expect(zoneKeyOf('NODE_RF_FIN_SURFACE', 'DUAL_HSK_BASE')).toBeNull();
  });
});

/**
 * The preset rework renamed the single-base zone key from `MAIN_BASE` to
 * `HSK_BASE`. `suggestedZoneFor` matches the stored key against the built zone
 * ids exactly, so a project saved before the rename kept a key that matches
 * nothing — and nothing said so. Generate produced the structure and the
 * subgraphs and then left every port unconnected, with no error to explain it.
 */
describe('a component saved before the zone-key rename', () => {
  it('still points at the base it was pointing at', () => {
    expect(normalizeZoneKey('MAIN_BASE')).toBe('HSK_BASE');
    expect(normalizeZoneKey('Main Base')).toBe('HSK_BASE');
  });

  it('resolves to the zone the single-base structure actually builds', () => {
    const [zone] = buildSharedStructure('SINGLE_MAIN_BASE').zones;
    const legacy = { architecture_prep: { preferred_base_zone: normalizeZoneKey('MAIN_BASE') } };
    expect(suggestedZoneFor(legacy as never, [zone.id])).toBe(zone.id);
  });

  it('leaves every other key exactly as stored', () => {
    for (const key of ['HSK_BASE', 'RF_HSK_BASE', 'DIGITAL_HSK_BASE']) {
      expect(normalizeZoneKey(key)).toBe(key);
    }
    expect(normalizeZoneKey('')).toBe(UNASSIGNED_ZONE);
    expect(normalizeZoneKey(null)).toBe(UNASSIGNED_ZONE);
  });
});

/**
 * Generate used to build the structure and every component subgraph and then
 * stop, telling the engineer to wire all the ports by hand — including on a
 * single shared HSK, where there is exactly one place the heat can go and so
 * nothing to decide.
 */
describe('resolvePortTarget', () => {
  const withZone = (zone: string) =>
    ({ architecture_prep: { preferred_base_zone: zone } }) as never;

  it('follows the zone the engineer chose in Screen 04', () => {
    const zones = buildSharedStructure('DUAL_HSK_BASE').zones.map((zone) => zone.id);
    const target = resolvePortTarget(withZone('RF_HSK_BASE'), zones);
    expect(target).toEqual({ zoneId: structureNodeId('RF_HSK_BASE'), reason: 'preferred' });
  });

  it('wires an unassigned component to the only base there is', () => {
    const zones = buildSharedStructure('SINGLE_MAIN_BASE').zones.map((zone) => zone.id);
    const target = resolvePortTarget(withZone(UNASSIGNED_ZONE), zones);
    expect(target).toEqual({ zoneId: structureNodeId('HSK_BASE'), reason: 'sole_base' });
  });

  // Two bases IS a choice about where the part sits, and guessing it would put
  // a component's whole chain on the wrong heat sink without saying so.
  it('refuses to guess when the structure offers more than one base', () => {
    const zones = buildSharedStructure('DUAL_HSK_BASE').zones.map((zone) => zone.id);
    expect(resolvePortTarget(withZone(UNASSIGNED_ZONE), zones)).toBeNull();
  });

  it('refuses when a stated preference names no zone this structure built', () => {
    const zones = buildSharedStructure('DUAL_HSK_BASE').zones.map((zone) => zone.id);
    expect(resolvePortTarget(withZone('SOMETHING_ELSE'), zones)).toBeNull();
  });

  it('carries a legacy key through to the sole base by preference, not by luck', () => {
    const zones = buildSharedStructure('SINGLE_MAIN_BASE').zones.map((zone) => zone.id);
    const target = resolvePortTarget(withZone(normalizeZoneKey('MAIN_BASE')), zones);
    expect(target?.reason).toBe('preferred');
  });

  it('has nothing to offer before a structure exists', () => {
    expect(resolvePortTarget(withZone('HSK_BASE'), [])).toBeNull();
  });
});
