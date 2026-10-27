/**
 * The link to AI-Thermal (`aiThermalLink.ts`): what an import locks, how 04
 * takes a field over, and what 「從 AI-Thermal 更新」 offers and writes.
 *
 * Runs on the real StarKcore-12L fixture through the real pipeline, so a
 * change to how a field is imported shows up here as a change in what is locked.
 */

import { describe, expect, it } from 'vitest';

import type { Component } from '@/domain/component';
import { defaultMaterials } from '@/domain/materials';
import { withValue } from '@/domain/sourcedValue';
import {
  aiChangesFor,
  aiLinkOf,
  aiLockedChanges,
  aiPlanPending,
  aiValueOf,
  applyAiPlan,
  isAiFirstLink,
  isAiLocked,
  linkedAiProjects,
  planAiUpdate,
  relockAiField,
  unlockAiField,
} from '@/domain/aiThermalLink';
import { bulkAiSkips, bulkPatchFor } from '@/screens/04-component-manager/modals';

import fixture from './__fixtures__/aiThermalStarkcore.json';
import { applyImport } from './applyImport';
import { autoMapColumns } from './autoMapColumns';
import { buildStagingRows } from './buildStagingRows';
import { freshAiThermalComponents } from './aiThermalFresh';
import { parseAiThermalDb, parseAiThermalProject, type AiThermalDb } from './parseAiThermal';

const PROJECT = 'StarKcore-12L';
const materials = defaultMaterials();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Raw = typeof fixture;
type RawComp = Record<string, unknown>;

function db(edit?: (raw: Raw) => void): AiThermalDb {
  const raw = clone(fixture);
  edit?.(raw);
  const parsed = parseAiThermalDb(raw);
  if (!parsed) throw new Error('fixture did not parse');
  return parsed;
}

const lists = (raw: Raw) => {
  const p = raw.projects[PROJECT] as unknown as Record<string, RawComp[]>;
  return [...p.rf_data, ...p.digital_data, ...p.pwr_data];
};
const comp = (raw: Raw, name: string) => lists(raw).find((c) => c.Component === name)!;

/** Gives every AI-Thermal component an id, the way current AI-Thermal stores them. */
const withCids = (raw: Raw) => lists(raw).forEach((c, i) => (c._cid = `cid-${i}`));

function importFrom(
  source: AiThermalDb,
  existing: Component[] = [],
  sourceType: 'AIThermal' | 'CSV' = 'AIThermal',
): Component[] {
  const table = parseAiThermalProject(source, PROJECT, { lists: ['RF', 'Digital', 'PWR'], includeExcluded: false }, materials);
  const rows = buildStagingRows({ table, mapping: autoMapColumns(table.headers), existingComponents: existing });
  return applyImport({
    existing,
    rows,
    sessionPolicy: 'MERGE_NON_EMPTY',
    source: {
      source_type: sourceType,
      source_project_id: sourceType === 'AIThermal' ? PROJECT : null,
      source_project_name: PROJECT,
      source_file: 'test',
      source_saved_at: '2026-09-17T08:32:44.401Z',
    },
    materials,
  }).components;
}

const fresh = (source: AiThermalDb) => freshAiThermalComponents(source, PROJECT, materials, [], 'test').components;
const by = (list: Component[], name: string) => {
  const found = list.find((c) => c.name === name);
  if (!found) throw new Error(`no component ${name}`);
  return found;
};

describe('an AI-Thermal import links and locks', () => {
  const components = importFrom(db());
  const pa = by(components, 'GTRB384608FC-Final');

  it('records the project, the saved-at stamp and the values it supplied', () => {
    const link = aiLinkOf(pa)!;
    expect(link).toMatchObject({ project_id: PROJECT, saved_at: '2026-09-17T08:32:44.401Z' });
    expect(link.values.qty).toBe(4);
    expect(link.values.power).toBe(52.99);
    expect(link.values.heat_path).toBe('Coin');
    expect(linkedAiProjects(components)).toEqual([{ id: PROJECT, count: components.length }]);
  });

  it('locks what AI-Thermal supplied, and never the name', () => {
    for (const field of ['qty', 'power', 'limit', 'limit_type', 'rjc', 'heat_path'] as const) {
      expect(isAiLocked(pa, field)).toBe(true);
    }
    expect(isAiLocked(pa, 'name')).toBe(false);
  });

  it('links and locks the room-temperature power (Pd@25°C) beside the hot one', () => {
    expect(aiLinkOf(pa)!.values.power_rt).toBe(52.129);
    expect(pa.power_rt_W?.value).toBe(52.129);
    expect(isAiLocked(pa, 'power_rt')).toBe(true);
  });

  it('leaves a field AI-Thermal left empty for this tool to fill', () => {
    // The filter has neither a heat path nor a body size in AI-Thermal.
    const filter = by(components, 'Cavity Filter(SC12L)');
    expect(filter.thermal_spec.heat_path_confirmed).toBe(false);
    expect(isAiLocked(filter, 'heat_path')).toBe(false);
    expect(isAiLocked(filter, 'package')).toBe(false);
    expect(isAiLocked(filter, 'power')).toBe(true);
  });

  it('does not link any other source', () => {
    const csv = importFrom(db(), [], 'CSV');
    expect(csv.every((c) => aiLinkOf(c) == null)).toBe(true);
    expect(isAiLocked(by(csv, 'GTRB384608FC-Final'), 'power')).toBe(false);
  });
});

describe('taking a field over in 04', () => {
  const pa = by(importFrom(db()), 'GTRB384608FC-Final');
  const morePower = { power_W: withValue(pa.power_W, 60) };

  it('blocks an edit to a locked field, by value — whatever the editor calls it', () => {
    expect(aiLockedChanges(pa, morePower)).toEqual(['power']);
    expect(aiLockedChanges(pa, { qty: 8 })).toEqual(['qty']);
    // Package type and notes are this tool's own.
    expect(aiLockedChanges(pa, { notes: 'x' })).toEqual([]);
  });

  it('✂ unlocks one field; ↺ puts AI-Thermal\'s value back and locks it again', () => {
    const taken = unlockAiField(pa, 'power');
    expect(isAiLocked(taken, 'power')).toBe(false);
    expect(isAiLocked(taken, 'qty')).toBe(true);
    expect(aiLockedChanges(taken, morePower)).toEqual([]);

    const edited = { ...taken, ...morePower };
    const back = relockAiField(edited, 'power');
    expect(back.power_W.value).toBe(52.99);
    expect(isAiLocked(back, 'power')).toBe(true);
    expect(aiLinkOf(back)!.unlocked).toBeUndefined();
  });

  it('a re-import of the same project keeps what was taken over', () => {
    const first = importFrom(db());
    const taken = first.map((c) => (c.name === 'GTRB384608FC-Final' ? unlockAiField(c, 'power') : c));
    const again = importFrom(db(), taken);
    expect(aiLinkOf(by(again, 'GTRB384608FC-Final'))!.unlocked).toEqual(['power']);
  });

  it('bulk edit leaves locked fields alone and says which', () => {
    const filter = by(importFrom(db()), 'Cavity Filter(SC12L)');
    const values = { heat_path: 'TopSurface' as const, limit_type: 'Tc' as const };
    expect(bulkAiSkips(values, pa, isAiLocked)).toEqual(['limit_type', 'heat_path']);
    const patch = bulkPatchFor(values, isAiLocked);
    expect({ ...pa, ...patch(pa) }.thermal_spec.heat_path.type).toBe('Coin');
    // The filter's path is not AI-Thermal's, so the bulk edit sets it.
    expect(filter.thermal_spec.heat_path.type).toBe('DirectMetal');
    expect({ ...filter, ...patch(filter) }.thermal_spec.heat_path.type).toBe('TopSurface');
  });
});

describe('「從 AI-Thermal 更新」', () => {
  it('right after an import, nothing is new', () => {
    const components = importFrom(db());
    const plan = planAiUpdate(components, fresh(db()), PROJECT);
    expect(plan.updates).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.same).toBe(components.length);
    // The excluded part is AI-Thermal's but was not imported: offered, not forced.
    expect(plan.added.map((c) => c.name)).toEqual(['Q6505-PSMQC094N10NS2']);
    expect(plan.added[0].enabled).toBe(false);
    expect(aiPlanPending(plan)).toEqual({ components: 0, fields: 0 });
  });

  it('offers what AI-Thermal changed, ticked', () => {
    const components = importFrom(db());
    const next = db((raw) => {
      comp(raw, 'GTRB384608FC-Final')['Power(W)'] = 60;
      comp(raw, 'GTRB384608FC-Final').Qty = 8;
    });
    const plan = planAiUpdate(components, fresh(next), PROJECT);
    expect(plan.updates).toHaveLength(1);
    const [u] = plan.updates;
    expect(u.changes.map((c) => [c.field, c.current, c.incoming, c.pick])).toEqual([
      ['qty', 4, 8, true],
      ['power', 52.99, 60, true],
    ]);
    expect(aiPlanPending(plan)).toEqual({ components: 1, fields: 2 });
  });

  it('offers a changed room-temperature power; one AI-Thermal cleared is left as it is', () => {
    const components = importFrom(db());
    const next = db((raw) => {
      comp(raw, 'GTRB384608FC-Final')['Power_RT(W)'] = 50;
      delete comp(raw, 'Cavity Filter(SC12L)')['Power_RT(W)'];
    });
    const plan = planAiUpdate(components, fresh(next), PROJECT);
    const change = (name: string) =>
      plan.updates.find((u) => u.name === name)?.changes.map((c) => [c.field, c.current, c.incoming]);
    expect(change('GTRB384608FC-Final')).toEqual([['power_rt', 52.129, 50]]);
    expect(change('Cavity Filter(SC12L)')).toBeUndefined();

    const paId = by(components, 'GTRB384608FC-Final').id;
    const applied = applyAiPlan(
      components,
      plan,
      { fields: { [paId]: ['power_rt'] }, add: [], disable: [] },
      PROJECT,
      null,
    ).components;
    expect(by(applied, 'GTRB384608FC-Final').power_rt_W?.value).toBe(50);
    // Like any field AI-Thermal empties: an update never clears a value here.
    expect(by(applied, 'Cavity Filter(SC12L)').power_rt_W?.value).toBe(31.072);
  });

  it('starts a field the engineer took over and changed unticked, and says why', () => {
    const components = importFrom(db()).map((c) =>
      c.name === 'GTRB384608FC-Final' ? { ...unlockAiField(c, 'power'), power_W: withValue(c.power_W, 55) } : c,
    );
    const next = db((raw) => {
      comp(raw, 'GTRB384608FC-Final')['Power(W)'] = 60;
    });
    const [change] = aiChangesFor(by(components, 'GTRB384608FC-Final'), by(fresh(next), 'GTRB384608FC-Final'));
    expect(change).toMatchObject({ field: 'power', current: 55, incoming: 60, pick: false, note: '本工具已解開並改過' });
  });

  it('follows a part renamed in AI-Thermal by its id', () => {
    const components = importFrom(db(withCids));
    const next = db((raw) => {
      withCids(raw);
      comp(raw, 'GTRB384608FC-Final').Component = 'GTRB384608FC-Final-v2';
    });
    const plan = planAiUpdate(components, fresh(next), PROJECT);
    expect(plan.removed).toEqual([]);
    expect(plan.added.map((c) => c.name)).toEqual(['Q6505-PSMQC094N10NS2']);
    const [u] = plan.updates;
    expect(u.name).toBe('GTRB384608FC-Final');
    expect(u.changes.find((c) => c.field === 'name')).toMatchObject({ incoming: 'GTRB384608FC-Final-v2', pick: true });
  });

  it('applies the ticked fields, keeps the unticked ones as this tool\'s, and handles added and deleted parts', () => {
    const components = importFrom(db());
    const next = db((raw) => {
      comp(raw, 'GTRB384608FC-Final')['Power(W)'] = 60;
      comp(raw, 'GTRB384608FC-Final').Qty = 8;
      const p = raw.projects[PROJECT] as unknown as Record<string, RawComp[]>;
      p.pwr_data = []; // the power module is gone
      delete comp(raw, 'Q6505-PSMQC094N10NS2')._excluded;
    });
    const plan = planAiUpdate(components, fresh(next), PROJECT);
    expect(plan.removed.map((c) => c.name)).toEqual(['Power Module(H48SA50030NRDH)']);
    const pmId = plan.removed[0].id;
    const paId = by(components, 'GTRB384608FC-Final').id;
    const added = plan.added[0];

    const result = applyAiPlan(
      components,
      plan,
      // Power from AI-Thermal; the quantity stays this tool's.
      { fields: { [paId]: ['power'] }, add: [added.id], disable: [pmId] },
      PROJECT,
      '2026-10-21T00:00:00.000Z',
    );
    const pa = by(result.components, 'GTRB384608FC-Final');
    expect(pa.power_W.value).toBe(60);
    expect(pa.qty).toBe(4);
    expect(isAiLocked(pa, 'power')).toBe(true);
    expect(isAiLocked(pa, 'qty')).toBe(false);
    expect(aiLinkOf(pa)!.values.qty).toBe(8);
    expect(aiLinkOf(pa)!.saved_at).toBe('2026-10-21T00:00:00.000Z');

    const pm = by(result.components, 'Power Module(H48SA50030NRDH)');
    expect(aiLinkOf(pm)).toBeNull();
    expect(pm.enabled).toBe(false);

    const q = by(result.components, 'Q6505-PSMQC094N10NS2');
    expect(q.enabled).toBe(true);
    expect(isAiLocked(q, 'power')).toBe(true);
    expect(new Set(result.components.map((c) => c.id)).size).toBe(result.components.length);
    expect(result).toMatchObject({ updated: 1, added: 1, removed: 1 });
    expect(result.fields).toEqual(expect.arrayContaining(['power_W', 'enabled', 'component_added']));

    // And the next look finds nothing ticked to do.
    const after = planAiUpdate(result.components, fresh(next), PROJECT);
    expect(aiPlanPending(after)).toEqual({ components: 0, fields: 0 });
    expect(after.updates[0].changes).toEqual([
      expect.objectContaining({ field: 'qty', current: 4, incoming: 8, pick: false }),
    ]);
  });

  it('never matches a part this tool holds unlinked under the same name', () => {
    const csv = importFrom(db(), [], 'CSV');
    const plan = planAiUpdate(csv, fresh(db()), PROJECT);
    expect(plan.updates).toEqual([]);
    expect(plan.added.map((c) => c.name)).toEqual(['Q6505-PSMQC094N10NS2']);
    expect(plan.sameName).toHaveLength(csv.length);
  });

  it('reads values the way 04 shows them', () => {
    const pa = by(importFrom(db()), 'GTRB384608FC-Final');
    expect(aiValueOf(pa, 'rjc')).toEqual({ body: false, rjc: pa.thermal_spec.r_jc_C_per_W?.value ?? null });
  });
});

describe('the first link — parts imported before links were recorded', () => {
  /** What an import by the earlier version left: the provenance, no link. */
  const oldImport = (source: AiThermalDb = db()) =>
    importFrom(source).map((c) => {
      const { ai_link: _link, ...provenance } = c.provenance;
      void _link;
      return { ...c, provenance };
    });

  it('is recognised from the provenance, and not locked yet', () => {
    const components = oldImport();
    expect(components.every(isAiFirstLink)).toBe(true);
    expect(linkedAiProjects(components)).toEqual([{ id: PROJECT, count: components.length }]);
    expect(isAiLocked(by(components, 'GTRB384608FC-Final'), 'power')).toBe(false);
    // Another source, or a part whose link was dropped on purpose, is not.
    expect(importFrom(db(), [], 'CSV').some(isAiFirstLink)).toBe(false);
  });

  it('links identical parts as they are, and locks them', () => {
    const components = oldImport();
    const plan = planAiUpdate(components, fresh(db()), PROJECT);
    expect(plan.updates).toEqual([]);
    expect(plan.link).toHaveLength(components.length);
    expect(plan.firstLinks).toBe(components.length);

    const result = applyAiPlan(components, plan, { fields: {}, add: [], disable: [] }, PROJECT, null);
    expect(result.linked).toBe(components.length);
    expect(result.fields).toEqual([]);
    const pa = by(result.components, 'GTRB384608FC-Final');
    expect(isAiLocked(pa, 'power')).toBe(true);
    expect(pa.power_W.value).toBe(52.99);
    expect(planAiUpdate(result.components, fresh(db()), PROJECT)).toMatchObject({ firstLinks: 0, link: [] });
  });

  it('cannot tell which side moved a differing value, so it starts unticked; a blank AI-Thermal fills starts ticked', () => {
    const components = oldImport().map((c) =>
      c.name === 'GTRB384608FC-Final'
        ? {
            ...c,
            power_W: withValue(c.power_W, 55),
            thermal_spec: { ...c.thermal_spec, limit_C: null },
          }
        : c,
    );
    const plan = planAiUpdate(components, fresh(db()), PROJECT);
    const [u] = plan.updates;
    expect(u).toMatchObject({ name: 'GTRB384608FC-Final', firstLink: true });
    expect(u.changes.map((c) => [c.field, c.pick, c.note])).toEqual([
      ['power', false, '第一次連結：分不出是哪一邊改的'],
      ['limit', true, undefined],
    ]);
    expect(aiPlanPending(plan)).toEqual({ components: 1, fields: 1 });

    // Keep this tool's power, take AI-Thermal's limit.
    const result = applyAiPlan(
      components,
      plan,
      { fields: { [u.componentId]: ['limit'] }, add: [], disable: [] },
      PROJECT,
      null,
    );
    const pa = by(result.components, 'GTRB384608FC-Final');
    expect(pa.power_W.value).toBe(55);
    expect(isAiLocked(pa, 'power')).toBe(false);
    expect(pa.thermal_spec.limit_C?.value).toBe(225);
    expect(isAiLocked(pa, 'limit')).toBe(true);
    expect(isAiLocked(pa, 'qty')).toBe(true);
  });

  it('a part AI-Thermal no longer has is kept, and not offered a first link again', () => {
    const components = oldImport();
    const next = db((raw) => {
      (raw.projects[PROJECT] as unknown as Record<string, RawComp[]>).pwr_data = [];
    });
    const plan = planAiUpdate(components, fresh(next), PROJECT);
    expect(plan.removed.map((c) => c.name)).toEqual(['Power Module(H48SA50030NRDH)']);
    const result = applyAiPlan(components, plan, { fields: {}, add: [], disable: [] }, PROJECT, null);
    const pm = by(result.components, 'Power Module(H48SA50030NRDH)');
    expect(pm.enabled).toBe(true);
    expect(isAiFirstLink(pm)).toBe(false);
    expect(planAiUpdate(result.components, fresh(next), PROJECT).removed).toEqual([]);
  });
});

describe('TIMs linked to the TIM Management Tool on both sides', () => {
  /** 01 as the user has it: every TIM linked to the TIM Management Tool and named after it. */
  const lairdMaterials = () => {
    const m = defaultMaterials();
    m.tim = [
      { id: 'TIM_L_TG2500', name: 'Laird Tgrease 2500', k_W_mK: withValue(null, 3.8), blt_mm: withValue(null, 0.05), catalog: { id: 'CAT_TG2500' } },
      { id: 'TIM_L_TP910', name: 'Laird Tputty 910', k_W_mK: withValue(null, 9.1), blt_mm: withValue(null, 0.5), catalog: { id: 'CAT_TP910' } },
      { id: 'TIM_L_P300', name: 'Laird Tflex P300', k_W_mK: withValue(null, 3), blt_mm: withValue(null, 0.5), catalog: { id: 'CAT_P300' } },
    ];
    return m;
  };
  /** AI-Thermal's 型號庫 linked to the same materials, renamed to the catalogue's short names. */
  const linkedDb = (linked = true) =>
    db((raw) => {
      const lib = raw.tim_library as Record<string, Record<string, unknown>>;
      lib.tim_mu6m6njc_muyx.srcId = linked ? 'CAT_TG2500' : undefined;
      lib.tim_mu6m6njc_k6q6.model = 'Tputty 910';
      lib.tim_mu6m6njc_k6q6.srcId = linked ? 'CAT_TP910' : undefined;
      lib.tim_mu6m6njc_klhc.srcId = linked ? 'CAT_P300' : undefined;
    });
  const importWith = (source: AiThermalDb, m = lairdMaterials(), existing: Component[] = []) => {
    const table = parseAiThermalProject(source, PROJECT, { lists: ['RF', 'Digital', 'PWR'], includeExcluded: false }, m);
    const rows = buildStagingRows({ table, mapping: autoMapColumns(table.headers), existingComponents: existing });
    return applyImport({
      existing,
      rows,
      sessionPolicy: 'MERGE_NON_EMPTY',
      source: { source_type: 'AIThermal', source_project_id: PROJECT, source_project_name: PROJECT, source_file: 'test' },
      materials: m,
    }).components;
  };

  it('match by the link although the names differ, and arrive locked', () => {
    const components = importWith(linkedDb());
    const pa = by(components, 'GTRB384608FC-Final');
    const fpga = by(components, 'XCZU67DR-FFVE1156');
    expect(pa.thermal_spec.tim.tim_id).toBe('TIM_L_TG2500');
    // The part still names the model as "T-Putty 910"; the library calls it "Tputty 910".
    expect(fpga.thermal_spec.tim.tim_id).toBe('TIM_L_TP910');
    expect(isAiLocked(pa, 'tim')).toBe(true);
    expect(isAiLocked(fpga, 'tim')).toBe(true);
  });

  it('a TIM picked by hand after an import that did not match is locked by the next update', () => {
    // Before the link was matched: the TIMs came in empty and were picked in 04.
    const unmatched = lairdMaterials();
    unmatched.tim = unmatched.tim.map((t) => ({ ...t, name: `X ${t.name}`, catalog: undefined }));
    const before = importWith(linkedDb(false), unmatched).map((c) =>
      c.name === 'XCZU67DR-FFVE1156'
        ? { ...c, thermal_spec: { ...c.thermal_spec, tim: { ...c.thermal_spec.tim, tim_id: 'TIM_L_TP910' } } }
        : c,
    );
    const fpga0 = by(before, 'XCZU67DR-FFVE1156');
    expect(isAiLocked(fpga0, 'tim')).toBe(false);

    const next = freshAiThermalComponents(linkedDb(), PROJECT, lairdMaterials(), [], 'test').components;
    const plan = planAiUpdate(before, next, PROJECT, lairdMaterials());
    const relock = plan.relock.find((entry) => entry.name === 'XCZU67DR-FFVE1156');
    expect(relock?.fields).toEqual(['tim']);
    expect(plan.updates.find((u) => u.name === 'XCZU67DR-FFVE1156')).toBeUndefined();

    const result = applyAiPlan(before, plan, { fields: {}, add: [], disable: [] }, PROJECT, null);
    const fpga = by(result.components, 'XCZU67DR-FFVE1156');
    expect(fpga.thermal_spec.tim.tim_id).toBe('TIM_L_TP910');
    expect(isAiLocked(fpga, 'tim')).toBe(true);
    expect(result.fields).toEqual([]);
    expect(planAiUpdate(result.components, next, PROJECT, lairdMaterials()).relock.map((e) => e.name)).not.toContain(
      'XCZU67DR-FFVE1156',
    );
  });

  it('a TIM picked by hand that differs from AI-Thermal is offered, unticked', () => {
    const unmatched = lairdMaterials();
    unmatched.tim = unmatched.tim.map((t) => ({ ...t, name: `X ${t.name}`, catalog: undefined }));
    const before = importWith(linkedDb(false), unmatched).map((c) =>
      c.name === 'U850-Si5518'
        ? { ...c, thermal_spec: { ...c.thermal_spec, tim: { ...c.thermal_spec.tim, tim_id: 'TIM_L_P300' } } }
        : c,
    );
    const next = freshAiThermalComponents(linkedDb(), PROJECT, lairdMaterials(), [], 'test').components;
    const u = planAiUpdate(before, next, PROJECT, lairdMaterials()).updates.find((entry) => entry.name === 'U850-Si5518')!;
    expect(u.changes.find((c) => c.field === 'tim')).toMatchObject({
      pick: false,
      note: '本工具填過（匯入時沒有帶進來）',
    });
  });
});

describe("AI-Thermal's Metal Face (金屬散熱面)", () => {
  const filterName = 'Cavity Filter(SC12L)';
  const metalFace = () =>
    db((raw) => {
      const specs = raw.projects[PROJECT].thermal_specs as Record<string, Record<string, unknown>>;
      specs['Cavity_Filter(SC12L)'].heatDirection = 'Metal Face';
    });

  it('locks the filter path that "None" left to this tool', () => {
    const before = importFrom(db());
    expect(isAiLocked(by(before, filterName), 'heat_path')).toBe(false);
    expect(isAiLocked(by(importFrom(metalFace()), filterName), 'heat_path')).toBe(true);
  });

  it('a filter path confirmed by hand is locked by the next update, its value unchanged', () => {
    const before = importFrom(db()).map((c) =>
      c.name === filterName ? { ...c, thermal_spec: { ...c.thermal_spec, heat_path_confirmed: true } } : c,
    );
    const next = freshAiThermalComponents(metalFace(), PROJECT, materials, [], 'test').components;
    const plan = planAiUpdate(before, next, PROJECT, materials);
    expect(plan.relock.find((entry) => entry.name === filterName)?.fields).toEqual(['heat_path']);
    expect(plan.updates.find((u) => u.name === filterName)).toBeUndefined();

    const result = applyAiPlan(before, plan, { fields: {}, add: [], disable: [] }, PROJECT, null);
    const filter = by(result.components, filterName);
    expect(filter.thermal_spec.heat_path.type).toBe('DirectMetal');
    expect(isAiLocked(filter, 'heat_path')).toBe(true);
    expect(result.fields).toEqual([]);
  });
});
