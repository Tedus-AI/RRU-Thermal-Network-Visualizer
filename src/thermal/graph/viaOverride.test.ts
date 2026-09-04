/**
 * A component may state its own via numbers.
 *
 * `via_effective_k_W_mK` and `via_efficiency` are project constants (01 §4) —
 * one via stack-up serves the whole board — so the Board template links both to
 * `materials.*` and the inspector showed them read-only. That is the right
 * default and the wrong ceiling: a part sitting over a locally denser via field
 * is a real arrangement, and the project number cannot describe it.
 *
 * The override lives on the heat path's own `parameters`, which is already an
 * open record, so it travels with the path that uses it and adds no field to
 * the component. Absent means inherit — the same shape as the TIM bond line.
 */

import { describe, expect, it } from 'vitest';

import { createComponent, type Component } from '@/domain/component';
import { defaultMaterials } from '@/domain/materials';

import { readLinkedInput } from './networkBuilder';

function boardComponent(parameters: Record<string, unknown> = {}): Component {
  const base = createComponent({
    id: 'CMP_PA',
    name: 'GTRB384608FC',
    category: 'RF',
    qty: 1,
    power_W: 53,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-09-04T00:00:00.000Z',
    },
  });
  return {
    ...base,
    thermal_spec: {
      ...base.thermal_spec,
      heat_path: { type: 'Board', parameters: parameters as never },
    },
  };
}

const MATERIALS = defaultMaterials();
const K = 'materials.via_effective_k_W_mK';
const EFF = 'materials.via_efficiency';

describe('where the via numbers come from', () => {
  it('inherits the project values when the component states nothing', () => {
    const component = boardComponent();

    expect(readLinkedInput(component, K, MATERIALS)).toBe(MATERIALS.via_effective_k_W_mK.value);
    expect(readLinkedInput(component, EFF, MATERIALS)).toBe(MATERIALS.via_efficiency.value);
  });

  it('takes the component’s own value when it states one', () => {
    const component = boardComponent({ via_effective_k_W_mK: 55, via_efficiency: 0.75 });

    expect(readLinkedInput(component, K, MATERIALS)).toBe(55);
    expect(readLinkedInput(component, EFF, MATERIALS)).toBe(0.75);
  });

  it('overrides one without disturbing the other', () => {
    const component = boardComponent({ via_effective_k_W_mK: 55 });

    expect(readLinkedInput(component, K, MATERIALS)).toBe(55);
    expect(readLinkedInput(component, EFF, MATERIALS)).toBe(MATERIALS.via_efficiency.value);
  });

  /** Clearing the field stores null, which has to read as "inherit again". */
  it('falls back to the project when the override is cleared', () => {
    const component = boardComponent({ via_effective_k_W_mK: null, via_efficiency: null });

    expect(readLinkedInput(component, K, MATERIALS)).toBe(MATERIALS.via_effective_k_W_mK.value);
    expect(readLinkedInput(component, EFF, MATERIALS)).toBe(MATERIALS.via_efficiency.value);
  });

  /**
   * Zero is the dangerous one. A zero conductivity or a zero derate would take
   * the whole via path to infinite resistance — silently, and from a field the
   * engineer probably meant to leave empty. It reads as "not stated".
   */
  it('refuses zero and negatives, which would silently kill the path', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const component = boardComponent({ via_effective_k_W_mK: bad, via_efficiency: bad });
      expect(readLinkedInput(component, K, MATERIALS), String(bad)).toBe(
        MATERIALS.via_effective_k_W_mK.value,
      );
      expect(readLinkedInput(component, EFF, MATERIALS), String(bad)).toBe(
        MATERIALS.via_efficiency.value,
      );
    }
  });

  it('ignores a value of the wrong type', () => {
    const component = boardComponent({ via_effective_k_W_mK: '55', via_efficiency: true });

    expect(readLinkedInput(component, K, MATERIALS)).toBe(MATERIALS.via_effective_k_W_mK.value);
    expect(readLinkedInput(component, EFF, MATERIALS)).toBe(MATERIALS.via_efficiency.value);
  });
});
