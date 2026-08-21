import { describe, expect, it } from 'vitest';

import {
  STRUCTURE_PRESETS,
  buildSharedStructure,
  presetZones,
  zoneKeyOf,
} from './sharedStructure';

/**
 * Screen 04 asks which shared structure a component attaches to; Screen 05
 * builds that structure. If the two disagree, a component points at a zone the
 * graph does not have and `suggestedZoneFor` quietly returns null — the
 * component simply never gets wired, with nothing said.
 *
 * These pin the picker's vocabulary to the graph's.
 */
describe('presetZones matches what the structure actually builds', () => {
  for (const preset of STRUCTURE_PRESETS) {
    it(`offers exactly the zones ${preset} creates`, () => {
      const built = buildSharedStructure(preset).zones;
      const offered = presetZones(preset);

      expect(offered).toHaveLength(built.length);
      for (const zone of built) {
        const match = offered.find((candidate) => zone.id.endsWith(candidate.key));
        expect(match, `no key offered for built zone ${zone.id}`).toBeDefined();
        // The label the user picks is the label the graph node carries.
        expect(match!.name).toBe(zone.name);
      }
    });
  }

  it('offers a Main Base on a single machined casting — the common RRU case', () => {
    expect(presetZones('SINGLE_MAIN_BASE').map((zone) => zone.key)).toEqual(['MAIN_BASE']);
  });

  // The old hardcoded list was exactly this preset's, which is why the other
  // five could not be expressed at all.
  it('still offers the five functional zones', () => {
    expect(presetZones('FUNCTIONAL_ZONES').map((zone) => zone.key)).toEqual([
      'RF_LEFT',
      'RF_RIGHT',
      'DIGITAL',
      'POWER',
      'FILTER',
    ]);
  });

  it('offers nothing for a custom structure, which is drawn by hand', () => {
    expect(presetZones('CUSTOM')).toEqual([]);
    expect(buildSharedStructure('CUSTOM').zones).toEqual([]);
  });
});

describe('zoneKeyOf', () => {
  it('reads the key back off a built zone id', () => {
    const [zone] = buildSharedStructure('SINGLE_MAIN_BASE').zones;
    expect(zoneKeyOf(zone.id, 'SINGLE_MAIN_BASE')).toBe('MAIN_BASE');
  });

  it('returns null for a node that names no zone of this preset', () => {
    expect(zoneKeyOf('NODE_FIN_ROOT', 'SINGLE_MAIN_BASE')).toBeNull();
    // A real zone, but not one this structure has.
    expect(zoneKeyOf('NODE_ZONE_RF_LEFT', 'SINGLE_MAIN_BASE')).toBeNull();
  });
});

/**
 * Every preset ends at the same heat-sink tail. BASE and FIN are shared by
 * every component, which is exactly why they are not zone choices.
 */
describe('the heat sink tail is shared, not chosen', () => {
  for (const preset of STRUCTURE_PRESETS.filter((entry) => entry !== 'CUSTOM')) {
    it(`${preset} ends at HSK base, fin root, fin surface and ambient`, () => {
      const ids = buildSharedStructure(preset).nodes.map((node) => node.id);
      for (const tail of [
        'NODE_HSK_BASE',
        'NODE_FIN_ROOT',
        'NODE_FIN_SURFACE',
        'NODE_AMBIENT_PLACEHOLDER',
      ]) {
        expect(ids).toContain(tail);
      }
      // And none of them is offered as somewhere to attach a component.
      const zoneKeys = presetZones(preset).map((zone) => zone.key);
      expect(zoneKeys).not.toContain('HSK_BASE');
      expect(zoneKeys).not.toContain('FIN_ROOT');
    });
  }
});
