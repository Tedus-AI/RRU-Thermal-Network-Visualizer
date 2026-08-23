import { describe, expect, it } from 'vitest';

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
