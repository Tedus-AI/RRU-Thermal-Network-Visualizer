/**
 * Importing a project straight out of AI-Thermal's shared `thermal_db.json`.
 *
 * The fixture is the real StarKcore-12L from the 2026-09-21 backup (four RF, four
 * digital and the power module, with their TH/ME rows and TIM models), plus a
 * `pcb_thickness` the backup predates. These tests run the real pipeline end to
 * end: parse → map → stage → apply, and check each part arrives as an engineer
 * would have entered it by hand — not just that some numbers moved.
 */

import { describe, expect, it } from 'vitest';

import { metalBaseSourceModel, type Component } from '@/domain/component';
import { defaultMaterials, DIRECT_CONTACT_TIM_ID, type MaterialDefaults } from '@/domain/materials';
import { sourced } from '@/domain/sourcedValue';

import fixture from './__fixtures__/aiThermalStarkcore.json';
import { applyImport } from './applyImport';
import { autoMapColumns } from './autoMapColumns';
import { buildStagingRows } from './buildStagingRows';
import {
  AI_THERMAL_HEADERS,
  aiThermalSpecKey,
  listAiThermalProjects,
  parseAiThermalDb,
  parseAiThermalProject,
  parseAiThermalSize,
  type AiThermalDb,
  type AiThermalScope,
} from './parseAiThermal';
import { CANONICAL_FIELDS, IGNORE_COLUMN, type StagingRow } from './types';

const ALL: AiThermalScope = { lists: ['RF', 'Digital', 'PWR'], includeExcluded: false };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function db(edit?: (raw: typeof fixture) => void): AiThermalDb {
  const raw = clone(fixture);
  edit?.(raw);
  const parsed = parseAiThermalDb(raw);
  if (!parsed) throw new Error('fixture did not parse');
  return parsed;
}

function run(
  source: AiThermalDb,
  scope: AiThermalScope = ALL,
  materials: MaterialDefaults = defaultMaterials(),
): { rows: StagingRow[]; components: Component[] } {
  const table = parseAiThermalProject(source, 'StarKcore-12L', scope, materials);
  const mapping = autoMapColumns(table.headers);
  const rows = buildStagingRows({ table, mapping, existingComponents: [] });
  const { components } = applyImport({
    existing: [],
    rows,
    sessionPolicy: 'SKIP',
    source: {
      source_type: 'AIThermal',
      source_project_id: 'StarKcore-12L',
      source_project_name: 'StarKcore-12L',
      source_file: 'SharePoint：ToolDatabase/thermal_db.json',
    },
    materials,
  });
  return { rows, components };
}

const by = (list: Component[], name: string) => {
  const found = list.find((c) => c.name === name);
  if (!found) throw new Error(`no component ${name}`);
  return found;
};
const rowOf = (rows: StagingRow[], name: string) => rows.find((r) => r.name === name)!;

describe('reading the database', () => {
  it('accepts the shared file and rejects anything else', () => {
    expect(parseAiThermalDb(null)).toBeNull();
    expect(parseAiThermalDb({ rf_data: [] })).toBeNull();
    expect(parseAiThermalDb({ projects: [] })).toBeNull();
    expect(parseAiThermalDb({ projects: {} })).toEqual({ projects: {}, tim_library: {} });
  });

  it('lists projects with their counts, exclusions and board thicknesses', () => {
    const [summary] = listAiThermalProjects(db());
    expect(summary).toMatchObject({
      id: 'StarKcore-12L',
      name: 'StarKcore-12L',
      counts: { RF: 4, Digital: 4, PWR: 1 },
      excluded: 1,
      excludedBy: { RF: 0, Digital: 1, PWR: 0 },
      pcb: { RF: 2.2, Digital: 2 },
    });
  });

  it('reads sizes and keys the way AI-Thermal writes them', () => {
    expect(parseAiThermalSize('35*35')).toEqual({ L: 35, W: 35 });
    expect(parseAiThermalSize('7.3×5.3')).toEqual({ L: 7.3, W: 5.3 });
    expect(parseAiThermalSize('12')).toEqual({ L: 12, W: 12 });
    expect(parseAiThermalSize('')).toBeNull();
    expect(parseAiThermalSize('0*5')).toBeNull();
    expect(aiThermalSpecKey('Cavity Filter(SC12L)')).toBe('Cavity_Filter(SC12L)');
    expect(aiThermalSpecKey('A/B C')).toBe('A-B_C');
  });
});

describe('the table', () => {
  it('maps every canonical column by itself and leaves the preserved ones unmapped', () => {
    const mapping = autoMapColumns(AI_THERMAL_HEADERS);
    expect(mapping.slice(0, CANONICAL_FIELDS.length)).toEqual([...CANONICAL_FIELDS]);
    expect(mapping.slice(CANONICAL_FIELDS.length).every((m) => m === IGNORE_COLUMN)).toBe(true);
  });

  it('leaves out what 5G-RRU excluded, unless asked — and then it arrives switched off', () => {
    expect(run(db()).components.map((c) => c.name)).not.toContain('Q6505-PSMQC094N10NS2');
    const all = run(db(), { ...ALL, includeExcluded: true }).components;
    expect(by(all, 'Q6505-PSMQC094N10NS2').enabled).toBe(false);
    expect(all.filter((c) => c.name !== 'Q6505-PSMQC094N10NS2').every((c) => c.enabled)).toBe(true);
  });

  it('imports only the lists in scope', () => {
    const { components } = run(db(), { lists: ['PWR'], includeExcluded: false });
    expect(components.map((c) => c.name)).toEqual(['Power Module(H48SA50030NRDH)']);
  });

  it('does not treat TH/ME hidden rows as excluded', () => {
    // The backup hides the driver, the circulators and the filter from the TH/ME
    // list — they have no boss to spec — and they are real heat sources.
    const names = run(db()).components.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['B11G3338N81D-Driver', 'Circulators(SC12L)', 'Cavity Filter(SC12L)']),
    );
  });
});

describe('each part, as an engineer would have entered it', () => {
  const { rows, components } = run(db());

  it('Final PA on a copper coin', () => {
    const pa = by(components, 'GTRB384608FC-Final');
    expect(pa).toMatchObject({ category: 'RF', qty: 4 });
    expect(pa.power_W.value).toBe(52.99);
    const s = pa.thermal_spec;
    expect(s.heat_path.type).toBe('Coin');
    expect(s.heat_path_confirmed).toBe(true);
    expect(s.r_jc_C_per_W?.value).toBe(1.5);
    expect(s.limit_C?.value).toBe(225);
    // Type "Final PA" → Tj by the shared rule, but nobody stated it.
    expect(s.limit_type).toBe('Tj');
    expect(s.limit_type_confirmed).toBe(false);
    expect(s.geometry).toMatchObject({ package_L_mm: 20.57, package_W_mm: 9.78, package_H_mm: 3.78 });
    expect(s.geometry.needs_review).toBeFalsy();
    expect(s.tim.tim_id).toBe('TIM_GREASE');
    // icToHSK "直觸" is not a gap → the material's own bond line.
    expect(s.tim.blt_mm).toBeNull();
    expect(s.mount?.type).toBe('Direct');
    expect(pa.architecture_prep.template_preference).toBe('BOTTOM_COOL_COIN');
    expect(pa.provenance).toMatchObject({ source_type: 'AIThermal', ref_origin_project: 'StarKcore-12L' });
  });

  it('Driver through board vias: E-PAD, the RF board thickness, bare metal contact', () => {
    const drv = by(components, 'B11G3338N81D-Driver');
    const s = drv.thermal_spec;
    expect(s.heat_path.type).toBe('Board');
    expect(s.geometry).toMatchObject({
      package_L_mm: 12,
      package_W_mm: 7,
      package_H_mm: 2.1,
      source_L_mm: 9.8,
      source_W_mm: 4.8,
      board_thickness_mm: 2.2,
    });
    expect(s.tim.tim_id).toBe(DIRECT_CONTACT_TIM_ID);
    expect(drv.metadata?.['板厚來源']).toBe('AI-Thermal RF PCB 板厚');
    // "None" is a stated absence of TIM, not a missing one.
    expect(rowOf(rows, 'B11G3338N81D-Driver').issues.map((i) => i.field)).not.toContain('TIM_Type');
  });

  it('Circulators: Rjc 0 becomes a body source, never an Rjc of 0', () => {
    const cr = by(components, 'Circulators(SC12L)');
    const s = cr.thermal_spec;
    expect(s.heat_path.type).toBe('Board');
    expect(metalBaseSourceModel(s)).toBe('SurfaceBodyBased');
    expect(s.r_jc_C_per_W).toBeNull();
    expect(s.limit_type).toBe('Tc');
    expect(s.geometry).toMatchObject({ source_L_mm: 10, source_W_mm: 10, board_thickness_mm: 2.2 });
    expect(rowOf(rows, 'Circulators(SC12L)').issues.map((i) => i.field)).not.toContain('R_jc');
  });

  it('Cavity filter: Filter category, metal face, body source', () => {
    const f = by(components, 'Cavity Filter(SC12L)');
    expect(f.category).toBe('Filter');
    const s = f.thermal_spec;
    expect(s.heat_path.type).toBe('DirectMetal');
    // "None" says nothing about the path, so it is inferred and left to confirm.
    expect(s.heat_path_confirmed).toBe(false);
    expect(metalBaseSourceModel(s)).toBe('SurfaceBodyBased');
    expect(s.package_type).toBe('Cavity Filter');
    expect(s.limit_type).toBe('Tc');
    expect(s.tim.tim_id).toBe(DIRECT_CONTACT_TIM_ID);
  });

  it('FPGA: the TH/ME path beats a stale shared Board_Type, and the boss waits in the Pedestal memory', () => {
    const fpga = by(components, 'XCZU67DR-FFVE1156');
    const s = fpga.thermal_spec;
    // Board_Type is still "None" in the shared record; TH/ME says IC top.
    expect(s.heat_path.type).toBe('TopSurface');
    expect(s.heat_path_confirmed).toBe(true);
    expect(s.r_jc_C_per_W?.value).toBe(0.16);
    expect(s.geometry).toMatchObject({ package_L_mm: 35, package_W_mm: 35, package_H_mm: 3.86 });
    // No "T-Putty 910" in this project → its type, with the 0.5 mm gap (the
    // project's Putty compresses to 0.3).
    expect(s.tim.tim_id).toBe('TIM_PUTTY');
    expect(s.tim.blt_mm?.value).toBe(0.5);
    expect(s.mount?.type).toBe('Direct');
    expect(s.mount_by_type?.Pedestal).toMatchObject({ contact_L_mm: 35, contact_W_mm: 35 });
    expect(fpga.metadata).toMatchObject({ 'TIM 型號': 'T-Putty 910', '凸台大小(mm)': '35 × 35' });
  });

  it('Si5518: keyed by its TH/ME name, the digital board thickness, via data preserved', () => {
    const clk = by(components, 'U850-Si5518');
    const s = clk.thermal_spec;
    expect(s.heat_path.type).toBe('Board');
    expect(s.geometry).toMatchObject({ source_L_mm: 8.6, source_W_mm: 8.6, board_thickness_mm: 2 });
    expect(clk.metadata).toMatchObject({ 'Thermal Via 內徑(mil)': '8', 'Thermal Via 數量': '134' });
  });

  it('DDR and the power module: case-limited bodies on the top surface', () => {
    const ddr = by(components, '2GB_DDR').thermal_spec;
    expect(ddr.heat_path.type).toBe('TopSurface');
    expect(metalBaseSourceModel(ddr)).toBe('SurfaceBodyBased');
    expect(ddr.limit_type).toBe('Tc');
    const pm = by(components, 'Power Module(H48SA50030NRDH)');
    expect(pm.category).toBe('Power');
    expect(pm.thermal_spec.package_type).toBe('Module');
    expect(pm.thermal_spec.geometry).toMatchObject({ package_L_mm: 61, package_W_mm: 57.9, package_H_mm: 12.9 });
  });

  it('no row is blocked', () => {
    expect(rows.filter((r) => r.status === 'ERROR')).toEqual([]);
  });
});

describe('choices that depend on the target project', () => {
  it('matches the TIM model by name when this project has it', () => {
    const materials = defaultMaterials();
    materials.tim.push({ id: 'TIM_CAT_1', name: 'T-Putty 910', k_W_mK: sourced(9.1), blt_mm: sourced(0.5) });
    const { components } = run(db(), ALL, materials);
    const s = by(components, 'XCZU67DR-FFVE1156').thermal_spec;
    expect(s.tim.tim_id).toBe('TIM_CAT_1');
    // Same bond line as the material → inherited, not a per-part override.
    expect(s.tim.blt_mm).toBeNull();
  });

  it('falls back from AI-Thermal board thickness to the 5G-RRU row, then to t_PCB', () => {
    const noPcb = run(db((raw) => delete (raw.projects['StarKcore-12L'] as { pcb_thickness?: unknown }).pcb_thickness)).components;
    // The 5G-RRU row says Thick(mm) 2 for its Thermal Via driver.
    expect(by(noPcb, 'B11G3338N81D-Driver').thermal_spec.geometry.board_thickness_mm).toBe(2);
    expect(by(noPcb, 'B11G3338N81D-Driver').metadata?.['板厚來源']).toBe('5G-RRU 元件板厚');
    const onlyGlobal = run(
      db((raw) => {
        const p = raw.projects['StarKcore-12L'] as Record<string, unknown>;
        delete p.pcb_thickness;
        (p.rf_data as Record<string, unknown>[]).forEach((c) => delete c['Thick(mm)']);
        (p.global_params as Record<string, unknown>).t_PCB = 1.6;
      }),
    ).components;
    expect(by(onlyGlobal, 'B11G3338N81D-Driver').thermal_spec.geometry.board_thickness_mm).toBe(1.6);
  });

  it('a stated limit reference arrives confirmed', () => {
    const { components } = run(
      db((raw) => {
        (raw.projects['StarKcore-12L'].rf_data[0] as Record<string, unknown>).Limit_Ref = 'Tc';
      }),
    );
    const s = by(components, 'GTRB384608FC-Final').thermal_spec;
    expect(s.limit_type).toBe('Tc');
    expect(s.limit_type_confirmed).toBe(true);
  });

  it('an unrecognised old heat direction is inferred, not guessed as a decision', () => {
    const { components } = run(
      db((raw) => {
        const specs = raw.projects['StarKcore-12L'].thermal_specs as Record<string, Record<string, unknown>>;
        specs['XCZU67DR-FFVE1156'].heatDirection = 'IC bot';
      }),
    );
    const s = by(components, 'XCZU67DR-FFVE1156').thermal_spec;
    // Digital infers Board; nothing confirmed it.
    expect(s.heat_path.type).toBe('Board');
    expect(s.heat_path_confirmed).toBe(false);
  });
});
