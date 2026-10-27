/**
 * Screen 01's link to an AI-Thermal project: what the database says
 * (`aiThermalProject.ts`) and what a link, an update, ✂ and ↺ do with it
 * (`domain/projectAiLink.ts`).
 *
 * The global_params below are StarKcore-12L's as stored in the 2026-09-21
 * backup (the fixture of aiThermalImport.test.ts keeps only t_PCB): coin 43 ×
 * 39.6 with no thickness or k saved, solder 58 / 0.3 / 0.75, the generic via
 * 30 × 0.9, base 7 mm under a 320 × 256 board with 8/11/8/8 margins, the three
 * TIM fallbacks, ambient 45 and Embedded fins. The TIM library is the
 * fixture's four AI-Thermal models.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BUILTIN_TIM_IDS, defaultMaterials, type MaterialDefaults } from '@/domain/materials';
import { createBaselineScenario, createEmptyProject, createScenario, type Project } from '@/domain/project';
import {
  AI_KEY,
  applyProjectAiPlan,
  isProjectAiLocked,
  isProjectAiUnlocked,
  matKey,
  planProjectAiUpdate,
  projectAiAfterRename,
  projectAiPending,
  relockProjectAiField,
  ROOM_TEMP_SCENARIO,
  roomTempScenarioName,
  roomTempScenarioOffer,
  suggestedAiProject,
  timKey,
  unlinkProjectAi,
  unlockProjectAiField,
} from '@/domain/projectAiLink';
import { sourced } from '@/domain/sourcedValue';
import { loadProject, loadScenarios, saveProject, saveScenarios } from '@/data/persistence';
import { useScenarioStore } from '@/data/scenarioStore';
import { addRoomTempScenario } from '@/project/projectAiActions';

import fixture from './__fixtures__/aiThermalStarkcore.json';
import { projectAiFresh } from './aiThermalProject';
import { parseAiThermalDb, type AiThermalDb } from './parseAiThermal';

const GLOBALS = {
  T_amb: 45,
  L_pcb: 320,
  W_pcb: 256,
  t_PCB: 2,
  t_base: 7,
  Top: 8,
  Btm: 11,
  Left: 8,
  Right: 8,
  Coin_L_Setting: 43,
  Coin_W_Setting: 39.6,
  K_Via: 30,
  Via_Eff: 0.9,
  K_Solder: 58,
  t_Solder: 0.3,
  Voiding: 0.75,
  K_Pad: 7.5,
  t_Pad: 1.7,
  K_Putty: 9.1,
  t_Putty: 0.5,
  K_Grease: 3,
  t_Grease: 0.05,
  fin_tech_selector_v2: 'Embedded Fin (0.95)',
};
const ID = 'StarKcore-12L';

function db(edit?: (project: Record<string, unknown>) => void): AiThermalDb {
  const raw = JSON.parse(JSON.stringify(fixture)) as { projects: Record<string, Record<string, unknown>> };
  const project = raw.projects[ID];
  project.global_params = { ...GLOBALS };
  project.param_temp = '45';
  edit?.(project);
  return parseAiThermalDb(raw)!;
}

function project(name = 'FR1 RRU Golden Demo', materials: MaterialDefaults = defaultMaterials()): Project {
  return { ...createEmptyProject(), project_id: 'P', project_name: name, materials };
}
const baseline = () => createBaselineScenario('P');

describe('what AI-Thermal says about a project', () => {
  const fresh = projectAiFresh(db(), ID, defaultMaterials())!;
  const value = (key: string) => fresh.values[key]?.value;

  it('takes the name, the band (no key = FR1) and the ambient from AI-Thermal', () => {
    expect(value(AI_KEY.name)).toBe('StarKcore-12L');
    expect(fresh.values[AI_KEY.band]).toMatchObject({ value: 'FR1', source: 'AI-Thermal' });
    expect(fresh.values[AI_KEY.ambient]).toMatchObject({ value: 45, source: 'AI-Thermal', from: '專案環溫' });
    expect(fresh.saved_at).toBe('2026-09-17T08:32:44.401Z');
  });

  it("falls back to 5G-RRU's T_amb, reads a custom ambient, and skips a band it does not know", () => {
    const rru = projectAiFresh(db((p) => delete p.param_temp), ID, defaultMaterials())!;
    expect(rru.values[AI_KEY.ambient]).toMatchObject({ value: 45, source: '5G-RRU' });
    const custom = projectAiFresh(db((p) => Object.assign(p, { param_temp: 'custom', param_temp_custom: '52' })), ID, defaultMaterials())!;
    expect(custom.values[AI_KEY.ambient].value).toBe(52);
    expect(custom.rru_ambient_C).toBe(45);
    expect(projectAiFresh(db((p) => (p.band = 'FR3')), ID, defaultMaterials())!.values[AI_KEY.band]).toBeUndefined();
    expect(projectAiFresh(db((p) => (p.band = 'FR2')), ID, defaultMaterials())!.values[AI_KEY.band].value).toBe('FR2');
  });

  it('takes the fin process and only the material constants 5G-RRU stored', () => {
    expect(fresh.values[AI_KEY.fin]).toMatchObject({ value: 'Embedded Fin', source: '5G-RRU' });
    expect(value(matKey('coin_L_mm'))).toBe(43);
    expect(value(matKey('solder_voiding'))).toBe(0.75);
    // No coin thickness or coin k: 5G-RRU runs those on its defaults.
    expect(value(matKey('coin_thickness_mm'))).toBeUndefined();
    expect(value(matKey('copper_k_W_mK'))).toBeUndefined();
    // The base envelope is 5G-RRU's footprint: length = PCB + Top + Bottom.
    expect(value(matKey('hsk_base_L_mm'))).toBe(339);
    expect(value(matKey('hsk_base_W_mm'))).toBe(272);
    expect(fresh.values[matKey('hsk_base_L_mm')].from).toBe('PCB 長 320 ＋ Top 8 ＋ Bottom 11');
    const odd = projectAiFresh(db((p) => Object.assign(p.global_params as object, { Voiding: 75 })), ID, defaultMaterials())!;
    expect(odd.values[matKey('solder_voiding')]).toBeUndefined();
  });

  it('takes a TIM from the model library first, else from 5G-RRU for a built-in type', () => {
    const materials = defaultMaterials();
    materials.tim = [
      ...materials.tim,
      { id: 'TIM_X', name: 'Tputty 910', k_W_mK: sourced(3, 'Manual'), blt_mm: sourced(0.3, 'Manual') },
    ];
    const byName = projectAiFresh(db(), ID, materials)!;
    // "Tputty 910" here is AI-Thermal's "T-Putty 910".
    expect(byName.values[timKey('TIM_X', 'k')]).toMatchObject({ value: 9.1, source: 'AI-Thermal' });
    expect(byName.values[timKey('TIM_X', 'blt')]).toMatchObject({ value: 0.5, source: 'AI-Thermal' });
    // The built-in Grease matches no model: 5G-RRU's fallback.
    expect(byName.values[timKey(BUILTIN_TIM_IDS.grease, 'k')]).toMatchObject({ value: 3, source: '5G-RRU' });
    expect(byName.values[timKey(BUILTIN_TIM_IDS.pad, 'blt')]).toMatchObject({ value: 1.7, source: '5G-RRU' });
    // No fallback exists for PCM.
    expect(byName.values[timKey(BUILTIN_TIM_IDS.pcm, 'k')]).toBeUndefined();
  });

  it('gives a material linked to the TIM Management Tool only its BLT: the k is that tool’s', () => {
    const raw = JSON.parse(JSON.stringify(fixture)) as { projects: Record<string, Record<string, unknown>>; tim_library: Record<string, Record<string, unknown>> };
    raw.projects[ID].global_params = { ...GLOBALS };
    const row = Object.values(raw.tim_library).find((r) => r.model === 'Tgrease 2500')!;
    row.srcId = 'mat-tg2500';
    const materials = defaultMaterials();
    materials.tim = [{ id: 'TIM_L', name: 'Laird Tgrease 2500', k_W_mK: sourced(3.8, 'Imported'), blt_mm: sourced(0.1, 'Manual'), catalog: { id: 'mat-tg2500' } }];
    const fresh2 = projectAiFresh(parseAiThermalDb(raw)!, ID, materials)!;
    expect(fresh2.values[timKey('TIM_L', 'k')]).toBeUndefined();
    expect(fresh2.values[timKey('TIM_L', 'blt')]).toMatchObject({ value: 0.05, source: 'AI-Thermal' });
  });

  it('is nothing for a project the database does not have', () => {
    expect(projectAiFresh(db(), 'NOPE', defaultMaterials())).toBeNull();
  });
});

describe('the heat sink fins from 5G-RRU', () => {
  // StarKcore-12L as 5G-RRU designs it (2026-10): Embedded, air gap 11.6, fin
  // 1.2 thick, 22 fins 59.646 mm tall, h 8.544 (6.144 + 2.4), η 0.922.
  const RESULT = {
    at: '2026-10-20T08:00:00.000Z',
    version: 1,
    ok: true,
    fin_tech: 'Embedded',
    L_hsk: 339,
    W_hsk: 272,
    fin_height: 59.646,
    fin_count: 22,
    fin_t: 1.2,
    gap: 11.6,
    h: 8.544,
    h_conv: 6.144,
    h_rad: 2.4,
    eta_fin: 0.922,
    eta_process: 1.06,
    k_fin: 200,
    coef_custom: false,
    heat_W: 353.716,
    margin: 1.1,
    T_amb: 45,
    volume_L: 11.2,
  };
  const withFins = (edit?: (project: Record<string, unknown>) => void) =>
    projectAiFresh(
      db((p) => {
        Object.assign(p.global_params as object, { Gap: 11.6, Fin_t: 1.2, Draft_Angle: 1.25 });
        edit?.(p);
      }),
      ID,
      defaultMaterials(),
    )!;
  const v = (fresh: ReturnType<typeof withFins>, field: string) => fresh.values[matKey(field as never)]?.value;

  it('takes the air gap and thickness from the console, and K_FIN on its process default', () => {
    const fresh = withFins();
    expect(v(fresh, 'hsk_fin_gap_mm')).toBe(11.6);
    expect(v(fresh, 'hsk_fin_thickness_mm')).toBe(1.2);
    // Embedded: no draft. Never saved a design: no height or count.
    expect(v(fresh, 'hsk_fin_draft_deg')).toBeUndefined();
    expect(v(fresh, 'hsk_fin_height_mm')).toBeUndefined();
    expect(v(fresh, 'hsk_fin_count')).toBeUndefined();
    expect(fresh.values[matKey('hsk_fin_k_W_mK')]).toMatchObject({ value: 200, source: '5G-RRU', from: 'K_FIN（預設 200）' });
    expect(fresh.rru_design).toBeNull();
  });

  it('takes the fin height, count and K_FIN of the design 5G-RRU saved', () => {
    const fresh = withFins((p) => (p.rru_result = { ...RESULT }));
    expect(v(fresh, 'hsk_fin_height_mm')).toBe(59.646);
    expect(v(fresh, 'hsk_fin_count')).toBe(22);
    expect(fresh.values[matKey('hsk_fin_height_mm')].from).toBe('設計結果：鰭片高度，2026-10-20 存檔');
    expect(fresh.values[matKey('hsk_fin_k_W_mK')].from).toContain('設計結果');
    expect(fresh.rru_design).toMatchObject({
      ok: true,
      fin_tech: 'Embedded',
      fin_height_mm: 59.646,
      fin_count: 22,
      h_conv_W_m2K: 6.144,
      h_rad_W_m2K: 2.4,
      eta_fin: 0.922,
      eta_process: 1.06,
      k_fin_W_mK: 200,
      heat_W: 353.716,
    });
    // The process factor is never linked.
    expect(fresh.values[matKey('hsk_fin_process_factor' as never)]).toBeUndefined();
  });

  it('a design 5G-RRU could not complete gives no height or count', () => {
    const fresh = withFins((p) => (p.rru_result = { at: RESULT.at, ok: false, why: 'DRC 不通過', fin_height: 120, fin_count: 22 }));
    expect(v(fresh, 'hsk_fin_height_mm')).toBeUndefined();
    expect(v(fresh, 'hsk_fin_count')).toBeUndefined();
    expect(fresh.rru_design).toMatchObject({ ok: false, why: 'DRC 不通過' });
  });

  it('Die-casting: the draft, and K_FIN custom else 150', () => {
    const dc = (edit?: (gp: Record<string, unknown>) => void) =>
      withFins((p) => {
        const gp = p.global_params as Record<string, unknown>;
        gp.fin_tech_selector_v2 = 'Die-casting Fin (0.90)';
        edit?.(gp);
      });
    expect(v(dc(), 'hsk_fin_draft_deg')).toBe(1.25);
    expect(v(dc(), 'hsk_fin_k_W_mK')).toBe(150);
    expect(v(dc((gp) => Object.assign(gp, { fin_custom_dc: true, fin_kfin_dc: 140 })), 'hsk_fin_k_W_mK')).toBe(140);
    // A custom value not ticked is not in force.
    expect(v(dc((gp) => Object.assign(gp, { fin_custom_dc: false, fin_kfin_dc: 140 })), 'hsk_fin_k_W_mK')).toBe(150);
  });

  it('links the fins like any other value and keeps the design for the comparison', () => {
    const p = project('StarKcore-12L');
    const fresh = withFins((raw) => (raw.rru_result = { ...RESULT }));
    const linked = applyProjectAiPlan(p, fresh, planProjectAiUpdate(p, baseline(), fresh)).project;
    expect(linked.materials.hsk_fin_height_mm?.value).toBe(59.646);
    expect(linked.materials.hsk_fin_k_W_mK?.value).toBe(200);
    expect(isProjectAiLocked(linked, matKey('hsk_fin_gap_mm'))).toBe(true);
    expect(linked.ai_link?.rru_design?.heat_W).toBe(353.716);
    saveProject(linked);
    expect(loadProject('P')!.ai_link?.rru_design).toEqual(linked.ai_link?.rru_design);
  });
});

describe('linking a project the first time', () => {
  it('replaces what this tool only started with, and leaves a stated value unticked', () => {
    const materials = defaultMaterials();
    materials.solder_k_W_mK = sourced(50, 'Manual');
    const p = project('FR1 RRU Golden Demo', materials);
    const fresh = projectAiFresh(db(), ID, materials)!;
    const plan = planProjectAiUpdate(p, baseline(), fresh);
    const row = (key: string) => plan.rows.find((r) => r.key === key);

    expect(plan.first).toBe(true);
    // A name someone typed is kept unless ticked.
    expect(row(AI_KEY.name)).toMatchObject({ pick: false, current: 'FR1 RRU Golden Demo', incoming: 'StarKcore-12L' });
    expect(row(AI_KEY.name)!.note).toBe('01 已填過');
    // The shipped 55 °C Baseline and an assumed constant are replaced.
    expect(row(AI_KEY.ambient)).toMatchObject({ pick: true, current: 55, incoming: 45 });
    expect(row(matKey('coin_L_mm'))).toMatchObject({ pick: true, current: null, incoming: 43 });
    // The shipped via k is already 5G-RRU's 30: locked without a row.
    expect(row(matKey('via_effective_k_W_mK'))).toBeUndefined();
    expect(plan.relock).toContain(matKey('via_effective_k_W_mK'));
    expect(row(AI_KEY.fin)).toMatchObject({ pick: true, current: null, incoming: 'Embedded Fin' });
    expect(row(matKey('solder_k_W_mK'))).toMatchObject({ pick: false });
    // Already the same: locked without a row.
    expect(plan.relock).toContain(AI_KEY.band);
    expect(projectAiPending(plan)).toBe(plan.rows.filter((r) => r.pick).length);
  });

  it('writes the ticked values, locks them, and keeps the rest as taken over', () => {
    const materials = defaultMaterials();
    materials.solder_k_W_mK = sourced(50, 'Manual');
    const p = project('FR1 RRU Golden Demo', materials);
    const fresh = projectAiFresh(db(), ID, materials)!;
    const plan = planProjectAiUpdate(p, baseline(), fresh);
    const result = applyProjectAiPlan(p, fresh, plan, {}, '2026-10-27T03:00:00.000Z');
    const next = result.project;

    expect(result.ambient).toBe(45);
    expect(next.project_context.cooling_architecture).toEqual(['Natural Convection', 'Embedded Fin']);
    expect(next.materials.coin_L_mm).toMatchObject({ value: 43, source: 'Imported', reference: '5G-RRU 參數控制台（StarKcore-12L）' });
    expect(next.ai_link).toMatchObject({ project_id: ID, project_name: 'StarKcore-12L', linked_at: '2026-10-27T03:00:00.000Z' });
    expect(isProjectAiLocked(next, matKey('coin_L_mm'))).toBe(true);
    expect(isProjectAiLocked(next, AI_KEY.band)).toBe(true);
    // Unticked: kept, and marked taken over so 01 offers 改回.
    expect(next.project_name).toBe('FR1 RRU Golden Demo');
    expect(next.materials.solder_k_W_mK.value).toBe(50);
    expect(isProjectAiUnlocked(next, AI_KEY.name)).toBe(true);
    expect(isProjectAiUnlocked(next, matKey('solder_k_W_mK'))).toBe(true);
    // A constant 5G-RRU never stored is not linked at all.
    expect(isProjectAiLocked(next, matKey('coin_thickness_mm'))).toBe(false);
  });

  it('ticking a row overrides the default', () => {
    const p = project();
    const fresh = projectAiFresh(db(), ID, p.materials)!;
    const plan = planProjectAiUpdate(p, baseline(), fresh);
    const next = applyProjectAiPlan(p, fresh, plan, { [AI_KEY.name]: true }).project;
    expect(next.project_name).toBe('StarKcore-12L');
    expect(isProjectAiLocked(next, AI_KEY.name)).toBe(true);
  });
});

describe('updating a linked project', () => {
  function linked() {
    const p = project('StarKcore-12L');
    const fresh = projectAiFresh(db(), ID, p.materials)!;
    const base = baseline();
    const applied = applyProjectAiPlan(p, fresh, planProjectAiUpdate(p, base, fresh));
    return { project: applied.project, baseline: { ...base, ambient_C: applied.ambient ?? base.ambient_C } };
  }

  it('has nothing to do while nothing moved', () => {
    const { project: p, baseline: b } = linked();
    const plan = planProjectAiUpdate(p, b, projectAiFresh(db(), ID, p.materials)!);
    expect(plan.first).toBe(false);
    expect(plan.rows).toEqual([]);
    expect(plan.relock).toEqual([]);
    expect(plan.same).toBeGreaterThan(10);
  });

  it('ticks a locked value AI-Thermal changed, and leaves a taken-over one unticked', () => {
    const { project: p0, baseline: b } = linked();
    const p = unlockProjectAiField(p0, matKey('solder_k_W_mK'));
    const edited = { ...p, materials: { ...p.materials, solder_k_W_mK: sourced(40, 'Manual') } };
    const fresh = projectAiFresh(
      db((x) => Object.assign(x.global_params as object, { Coin_L_Setting: 45, K_Solder: 60 })),
      ID,
      edited.materials,
    )!;
    const plan = planProjectAiUpdate(edited, b, fresh);
    expect(plan.rows.find((r) => r.key === matKey('coin_L_mm'))).toMatchObject({ pick: true, before: 43, incoming: 45 });
    expect(plan.rows.find((r) => r.key === matKey('solder_k_W_mK'))).toMatchObject({ pick: false, note: '已解開（用 01 的值）' });

    const next = applyProjectAiPlan(edited, fresh, plan).project;
    expect(next.materials.coin_L_mm?.value).toBe(45);
    expect(next.materials.solder_k_W_mK.value).toBe(40);
    expect(isProjectAiUnlocked(next, matKey('solder_k_W_mK'))).toBe(true);
    expect(next.ai_link!.values[matKey('solder_k_W_mK')]).toBe(60);
  });

  it('locks a newly stated field that already agrees, and frees one no longer stated', () => {
    const { project: p, baseline: b } = linked();
    const withK = { ...p, materials: { ...p.materials, copper_k_W_mK: sourced(390, 'Manual') } };
    const fresh = projectAiFresh(
      db((x) => {
        const gp = x.global_params as Record<string, unknown>;
        gp.K_Coin = 390;
        delete gp.K_Via;
      }),
      ID,
      withK.materials,
    )!;
    const plan = planProjectAiUpdate(withK, b, fresh);
    expect(plan.relock).toEqual([matKey('copper_k_W_mK')]);
    expect(plan.dropped).toEqual([matKey('via_effective_k_W_mK')]);
    const next = applyProjectAiPlan(withK, fresh, plan).project;
    expect(isProjectAiLocked(next, matKey('copper_k_W_mK'))).toBe(true);
    expect(isProjectAiLocked(next, matKey('via_effective_k_W_mK'))).toBe(false);
    expect(next.materials.via_effective_k_W_mK.value).toBe(30);
  });

  it('linking to another AI-Thermal project starts over as a first link', () => {
    const { project: p, baseline: b } = linked();
    const other = projectAiFresh(db(), ID, p.materials)!;
    const plan = planProjectAiUpdate(p, b, { ...other, project_id: 'OTHER' });
    expect(plan.first).toBe(true);
  });
});

describe('✂, ↺, unlinking and copies', () => {
  const linkedProject = () => {
    const p = project('StarKcore-12L');
    const fresh = projectAiFresh(db(), ID, p.materials)!;
    return applyProjectAiPlan(p, fresh, planProjectAiUpdate(p, baseline(), fresh)).project;
  };

  it('✂ unlocks, ↺ writes the linked value back and locks again', () => {
    const p = unlockProjectAiField(linkedProject(), matKey('coin_W_mm'));
    expect(isProjectAiLocked(p, matKey('coin_W_mm'))).toBe(false);
    const edited = { ...p, materials: { ...p.materials, coin_W_mm: sourced(41, 'Manual') } };
    const back = relockProjectAiField(edited, matKey('coin_W_mm')).project;
    expect(back.materials.coin_W_mm?.value).toBe(39.6);
    expect(isProjectAiLocked(back, matKey('coin_W_mm'))).toBe(true);
    expect(back.ai_link!.unlocked).toBeUndefined();
    // The ambient lives on the Baseline scenario: the write says so.
    expect(relockProjectAiField(unlockProjectAiField(back, AI_KEY.ambient), AI_KEY.ambient).ambient).toBe(45);
  });

  it('unlinking keeps every value and drops the link', () => {
    const p = linkedProject();
    const free = unlinkProjectAi(p);
    expect(free.ai_link).toBeUndefined();
    expect(free.materials.coin_L_mm?.value).toBe(43);
    expect(isProjectAiLocked(free, matKey('coin_L_mm'))).toBe(false);
  });

  it('a copy with its own name keeps the link with the name taken over', () => {
    const p = linkedProject();
    expect(isProjectAiUnlocked(projectAiAfterRename(p, 'StarKcore copy'), AI_KEY.name)).toBe(true);
    expect(projectAiAfterRename(p, 'StarKcore-12L')).toBe(p);
  });

  it("suggests the AI-Thermal project most of 04's components come from", () => {
    const c = (id: string | null, linked = true) => ({
      provenance: linked ? { ai_link: { project_id: id } } : { source_type: 'AIThermal', source_project_id: id },
    });
    expect(suggestedAiProject([c('A'), c('B'), c('B', false)])).toBe('B');
    expect(suggestedAiProject([])).toBeNull();
  });
});

describe('the room-temperature scenario', () => {
  // StarKcore-12L states a Pd@25°C for every part; Q6505 is hidden (👁) in AI-Thermal.
  it('counts the parts that state a room-temperature power, hidden ones left out', () => {
    expect(projectAiFresh(db(), ID, defaultMaterials())!.rt_power_parts).toBe(8);
    const none = db((p) => {
      for (const key of ['rf_data', 'digital_data', 'pwr_data']) {
        for (const comp of p[key] as Array<Record<string, unknown>>) delete comp['Power_RT(W)'];
      }
    });
    expect(projectAiFresh(none, ID, defaultMaterials())!.rt_power_parts).toBe(0);
  });

  it('is offered only when AI-Thermal states one and the project has no room-temperature scenario', () => {
    const scenarios = [baseline()];
    expect(roomTempScenarioOffer(scenarios, { rt_power_parts: 8 })).toEqual({ parts: 8 });
    expect(roomTempScenarioOffer(scenarios, { rt_power_parts: 0 })).toBeNull();
    expect(roomTempScenarioOffer(scenarios, null)).toBeNull();
    const rt = createScenario('P', '室溫', { power_basis: 'rt' });
    expect(roomTempScenarioOffer([...scenarios, rt], { rt_power_parts: 8 })).toBeNull();
  });

  it('takes a name the project does not use yet', () => {
    expect(roomTempScenarioName([baseline()])).toBe('常溫 25 °C');
    const taken = createScenario('P', '常溫 25 °C');
    expect(roomTempScenarioName([baseline(), taken])).toBe('常溫 25 °C (2)');
  });
});

describe('the link on disk', () => {
  class MemoryStorage implements Storage {
    private data = new Map<string, string>();
    get length() {
      return this.data.size;
    }
    clear() {
      this.data.clear();
    }
    getItem(key: string) {
      return this.data.get(key) ?? null;
    }
    key(index: number) {
      return [...this.data.keys()][index] ?? null;
    }
    removeItem(key: string) {
      this.data.delete(key);
    }
    setItem(key: string, value: string) {
      this.data.set(key, String(value));
    }
  }
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips, and unlinking removes it from the document', () => {
    const p = project('StarKcore-12L');
    const fresh = projectAiFresh(db(), ID, p.materials)!;
    const linkedP = unlockProjectAiField(applyProjectAiPlan(p, fresh, planProjectAiUpdate(p, baseline(), fresh)).project, AI_KEY.ambient);
    saveProject(linkedP);
    const loaded = loadProject('P')!;
    expect(loaded.ai_link).toEqual(linkedP.ai_link);
    expect(loaded.foreign_fields).not.toHaveProperty('ai_link');

    saveProject(unlinkProjectAi(loaded));
    expect(loadProject('P')!.ai_link).toBeUndefined();
    expect(JSON.parse(localStorage.getItem('tnv.projects')!).P).not.toHaveProperty('ai_link');
  });

  it('adds the room-temperature scenario to the project once, and leaves the active one active', () => {
    const base = baseline();
    saveScenarios('P', [base]);
    useScenarioStore.getState().loadFor('P');
    const active = useScenarioStore.getState().activeScenarioId;

    expect(addRoomTempScenario('P')).toBe('常溫 25 °C');
    const stored = loadScenarios('P');
    expect(stored).toHaveLength(2);
    expect(stored[1]).toMatchObject({
      name: '常溫 25 °C',
      ambient_C: ROOM_TEMP_SCENARIO.ambient_C,
      wind_mps: 0,
      solar_W_m2: 0,
      power_scale: 1,
      power_basis: 'rt',
    });
    expect(useScenarioStore.getState().activeScenarioId).toBe(active);

    expect(addRoomTempScenario('P')).toBeNull();
    expect(loadScenarios('P')).toHaveLength(2);
  });

  it('ignores a malformed link rather than failing to open', () => {
    localStorage.setItem('tnv.projects', JSON.stringify({ P: { ...project(), ai_link: { values: 'x' } } }));
    expect(loadProject('P')!.ai_link).toBeUndefined();
  });
});
