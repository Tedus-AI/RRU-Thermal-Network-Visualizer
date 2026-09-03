/**
 * Copying a project's components into another project must not lose the design.
 *
 * Reported after duplicating STARKCORE into a project called TEST and importing
 * its components through Screen 02: a wall of warnings and one red ERROR the
 * source project never had. The cause was not validation — it was that the
 * eighteen-column table could not carry the component model, so every field
 * without a column was re-guessed or dropped.
 *
 * The XCZU67DR is the whole case in one part. It arrived with:
 *
 *   - no mount at all, so its two embedded heat pipes — the route ~83 % of its
 *     heat actually takes — became a Direct mount
 *   - `limit_type` re-guessed to `Tj` and marked unconfirmed, when the source
 *     had settled it
 *   - `heat_path.parameters` and `heat_path_confirmed` gone
 *   - `tim.contact_area_mode` reset
 *   - `preferred_base_zone` gone
 *
 * And the re-guess CONTRADICTED what survived: on a body-sourced part the
 * derived model came through intact while the limit type was inferred back to
 * `Tj`, so Screen 02 raised "表面/本體熱源模型必須使用表面參考溫度…不可使用 Tj" —
 * an error manufactured entirely by the importer's own loss.
 *
 * These tests run the real pipeline end to end: parse → map → stage → apply.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createComponent,
  emptyMount,
  mountSpec,
  type Component,
} from '@/domain/component';
import { defaultMaterials } from '@/domain/materials';
import { saveComponents } from '@/data/persistence';
import { withValue } from '@/domain/sourcedValue';

import { applyImport } from './applyImport';
import { autoMapColumns } from './autoMapColumns';
import { buildStagingRows } from './buildStagingRows';
import { CARRIED_SPEC_COLUMN } from './carriedSpec';
import { parseExistingProject } from './parseExistingProject';

const SOURCE = 'PRJ_STARKCORE';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    key: () => null,
    length: 0,
  });
});

/** The real XCZU67DR, as the STARKCORE save holds it. */
function fpga(): Component {
  const base = createComponent({
    id: 'CMP_XCZU67DR',
    name: 'XCZU67DR',
    category: 'Digital',
    qty: 1,
    power_W: 35,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-08-26T06:02:38.520Z',
    },
  });
  return {
    ...base,
    notes: 'Vendor Rjc from the XCZU67DR datasheet, table 4.',
    thermal_spec: {
      ...base.thermal_spec,
      limit_type: 'Tj',
      limit_type_confirmed: true,
      limit_C: withValue(base.thermal_spec.limit_C, 100),
      limit_reference_note: '',
      r_jc_C_per_W: withValue(base.thermal_spec.r_jc_C_per_W, 0.16),
      package_type: 'BGA',
      geometry: {
        ...base.thermal_spec.geometry,
        package_L_mm: 35,
        package_W_mm: 35,
        package_H_mm: 3.66,
      },
      heat_path: { type: 'TopSurface', parameters: { lid_k_W_mK: 390 } },
      heat_path_confirmed: true,
      tim: { ...base.thermal_spec.tim, tim_id: null, contact_area_mode: 'custom' },
      mount: {
        ...emptyMount('EmbeddedHeatPipe'),
        contact_L_mm: 35,
        contact_W_mm: 6.5,
        heat_pipe_count: 2,
        heat_pipe_R_C_per_W: 0.13,
      },
    },
    architecture_prep: {
      ...base.architecture_prep,
      preferred_base_zone: 'Digital',
      template_preference: 'TOP_COOL_LID',
      thermal_profile_status: 'Ready',
    },
  } as Component;
}

/** parse → map → stage → apply, exactly as Screen 02 runs it. */
function importInto(existing: Component[], components: Component[]) {
  saveComponents(SOURCE, components);
  const table = parseExistingProject(
    SOURCE,
    { categories: ['RF', 'Digital', 'Power', 'Filter', 'Other'], includeHidden: true },
    defaultMaterials(),
  );
  const mapping = autoMapColumns(table.headers);
  const rows = buildStagingRows({ table, mapping, existingComponents: existing });
  return {
    rows,
    ...applyImport({
      existing,
      rows,
      sessionPolicy: 'REPLACE',
      source: {
        source_type: 'ExistingProject',
        source_project_id: SOURCE,
        source_project_name: 'FR1 RRU STARKCORE 12L',
        source_file: null,
      },
      materials: defaultMaterials(),
    }),
  };
}

describe('copying components into a new project', () => {
  it('brings the mount across — the route most of the heat takes', () => {
    const { components } = importInto([], [fpga()]);
    const mount = mountSpec(components[0].thermal_spec);

    expect(mount.type).toBe('EmbeddedHeatPipe');
    expect(mount.contact_L_mm).toBe(35);
    expect(mount.contact_W_mm).toBe(6.5);
    expect(mount.heat_pipe_count).toBe(2);
    expect(mount.heat_pipe_R_C_per_W).toBe(0.13);
  });

  /**
   * The one red ERROR in the report. `inferLimitType` re-guesses from category
   * and name, and its guess can contradict a heat path that survived intact.
   */
  it('keeps a limit type the source had already settled, still confirmed', () => {
    const { components } = importInto([], [fpga()]);

    expect(components[0].thermal_spec.limit_type).toBe('Tj');
    expect(components[0].thermal_spec.limit_type_confirmed).toBe(true);
  });

  it('keeps the heat path with its parameters, and its confirmation', () => {
    const { components } = importInto([], [fpga()]);

    expect(components[0].thermal_spec.heat_path).toEqual({
      type: 'TopSurface',
      parameters: { lid_k_W_mK: 390 },
    });
    expect(components[0].thermal_spec.heat_path_confirmed).toBe(true);
  });

  it('keeps the TIM contact-area mode', () => {
    const { components } = importInto([], [fpga()]);

    expect(components[0].thermal_spec.tim.contact_area_mode).toBe('custom');
  });

  it('carries the base zone and template preference', () => {
    const { components } = importInto([], [fpga()]);

    expect(components[0].architecture_prep.preferred_base_zone).toBe('Digital');
    expect(components[0].architecture_prep.template_preference).toBe('TOP_COOL_LID');
  });

  /**
   * Readiness is not a preference: it is Screen 05's word on a graph the new
   * project has not built. Carrying it would claim a part was wired up when
   * nothing is.
   */
  it('resets Screen 05 readiness, which the new project has not earned', () => {
    const { components } = importInto([], [fpga()]);

    expect(components[0].architecture_prep.thermal_profile_status).toBe('Not Assigned');
  });

  it('keeps the engineer’s notes', () => {
    const { components } = importInto([], [fpga()]);

    expect(components[0].notes).toContain('table 4');
  });

  it('imports without errors, which is what the report was full of', () => {
    const { result, rows } = importInto([], [fpga()]);

    expect(result.errors).toBe(0);
    expect(result.imported).toBe(1);
    expect(rows[0].issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  /** A disabled part is in the table only because Import Scope asked for it. */
  it('keeps a part the source had switched off switched off', () => {
    const off = { ...fpga(), enabled: false };

    expect(importInto([], [off]).components[0].enabled).toBe(false);
  });

  /**
   * The payload describes the component's own fields, so it belongs in them.
   * "Preserved Source Fields" is for values this tool does NOT model.
   */
  it('does not leave the payload sitting in metadata', () => {
    const { components } = importInto([], [fpga()]);

    expect(components[0].metadata?.[CARRIED_SPEC_COLUMN]).toBeUndefined();
  });

  it('still records the lineage the spec asks for', () => {
    const { components } = importInto([], [fpga()]);

    expect(components[0].provenance.ref_origin_project).toBe(SOURCE);
    expect(components[0].provenance.ref_origin_id).toBe('CMP_XCZU67DR');
  });

  /**
   * "Direct contact" is a decision, not a material: no TIM, metal on metal.
   * It has no name to put in the TIM_Type column, so it came back as "no TIM
   * stated" and Screen 04 warned that the interface resistance could not be
   * computed — when Screen 01's bare contact conductance computes it exactly.
   * Five of the nine STARKCORE parts are built that way.
   */
  it('keeps a stated direct contact, which has no name to export', () => {
    const direct = fpga();
    direct.thermal_spec.tim = { ...direct.thermal_spec.tim, tim_id: 'TIM_DIRECT_CONTACT' };

    const { components } = importInto([], [direct]);

    expect(components[0].thermal_spec.tim.tim_id).toBe('TIM_DIRECT_CONTACT');
  });

  /**
   * A real material is the target project's to own. Its id means nothing here,
   * so an unmatched name stays unmatched rather than inventing a library row —
   * `_unmatched_tim` in metadata is what recovers it.
   */
  it('does not invent a material the target library does not have', () => {
    const exotic = fpga();
    exotic.thermal_spec.tim = { ...exotic.thermal_spec.tim, tim_id: 'TIM_VENDOR_X' };

    const { components } = importInto([], [exotic]);

    expect(components[0].thermal_spec.tim.tim_id).toBeNull();
  });

  /** The mapped columns are what the engineer reviewed, so they still win. */
  it('lets a reviewed column override the carried payload', () => {
    saveComponents(SOURCE, [fpga()]);
    const table = parseExistingProject(
      SOURCE,
      { categories: ['Digital'], includeHidden: true },
      defaultMaterials(),
    );
    const mapping = autoMapColumns(table.headers);
    const rows = buildStagingRows({ table, mapping, existingComponents: [] });
    rows[0].power_W = 42;

    const { components } = applyImport({
      existing: [],
      rows,
      sessionPolicy: 'REPLACE',
      source: {
        source_type: 'ExistingProject',
        source_project_id: SOURCE,
        source_project_name: 'STARKCORE',
        source_file: null,
      },
      materials: defaultMaterials(),
    });

    expect(components[0].power_W.value).toBe(42);
    // …and the carried half still arrived.
    expect(mountSpec(components[0].thermal_spec).heat_pipe_count).toBe(2);
  });
});

describe('a source with no carried payload', () => {
  /**
   * A spreadsheet, a paste or a CSV has no `_ref_spec` column, and nothing
   * about its path may change: those fields genuinely are unknown there, and
   * inventing a mount or confirming a limit type would be worse than a gap.
   */
  it('still infers, and still leaves the inference unconfirmed', () => {
    const table = {
      headers: ['Component', 'Category', 'Qty', 'Power(W)', 'Heat_Path'],
      rows: [['Some PA', 'RF', '4', '52.99', 'MetalBase']],
      sourceName: 'sheet.csv',
    };
    const mapping = autoMapColumns(table.headers);
    const rows = buildStagingRows({ table, mapping, existingComponents: [] });

    const { components } = applyImport({
      existing: [],
      rows,
      sessionPolicy: 'REPLACE',
      source: {
        source_type: 'CSV',
        source_project_id: null,
        source_project_name: null,
        source_file: 'sheet.csv',
      },
      materials: defaultMaterials(),
    });

    expect(components[0].thermal_spec.limit_type_confirmed).toBe(false);
    expect(mountSpec(components[0].thermal_spec).type).toBe('Direct');
    expect(components[0].architecture_prep.preferred_base_zone).toBe('Unassigned');
  });
});
