/**
 * What AI-Thermal's database says about one project, for Screen 01's link
 * (`domain/projectAiLink.ts`).
 *
 * AI-Thermal's own fields first, 5G-RRU's parameter console second, wherever
 * both have a value (the user's rule):
 *
 *   project_name                    → 專案名稱
 *   band ('FR1' / 'FR2'; no key = FR1) → 頻段
 *   param_temp (custom → param_temp_custom), else 5G-RRU T_amb
 *                                   → the Baseline scenario's ambient
 *   5G-RRU fin_tech_selector_v2     → the fin process among the cooling elements
 *   5G-RRU coin / solder / via / base → the material constants (`aiThermalMaterials.ts`)
 *   5G-RRU fin array: air gap, thickness, draft from its console; fin height
 *     and count from its saved design result (`rru_result`); K_FIN from that
 *     design, else its custom value, else its process default → the heat-sink
 *     surface's fins (`hsk_fin_*`)
 *   TIM, per 01 material: AI-Thermal's TIM model library first — a material
 *     linked to the TIM Management Tool by the model linked to the same entry
 *     (its BLT only: the k is the TIM Management Tool's), any other by name (k
 *     and BLT); a built-in material no model matches by 5G-RRU's fallback for
 *     its type (K_Grease / t_Grease …).
 *
 * The compressed gap (`gapThickness`) is the bond line — 5G-RRU's t_Pad 1.7 is
 * AI-Thermal's 1.7 gap, not its 2.5 mm sheet.
 *
 * Not a field: how many parts state a room-temperature power (`Power_RT(W)`,
 * AI-Thermal's Pd@25°C), so 01 can offer the 「常溫 25 °C」 scenario that uses it.
 */

import type { MaterialDefaults } from '@/domain/materials';
import { AI_KEY, matKey, timKey, type ProjectAiFresh, type ProjectAiFreshValue } from '@/domain/projectAiLink';
import {
  globalParamsOf,
  RRU_TIM_FALLBACKS,
  rruAmbient,
  rruFin,
  rruDesignOf,
  rruFinValues,
  rruMaterialValues,
  rruPositive,
} from './aiThermalMaterials';
import { looseKey, type AiThermalDb } from './parseAiThermal';

type Raw = Record<string, unknown>;

const isObj = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const num = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/** Parts that state AI-Thermal's Pd@25°C, the hidden ones (👁) left out. */
function rtPowerParts(project: Raw): number {
  let count = 0;
  for (const key of ['rf_data', 'digital_data', 'pwr_data']) {
    const list = project[key];
    if (!Array.isArray(list)) continue;
    for (const comp of list) {
      if (isObj(comp) && comp._excluded !== true && num(comp['Power_RT(W)']) != null) count++;
    }
  }
  return count;
}

/** AI-Thermal's ambient for the project: its high-temperature condition. */
function aiThermalAmbient(project: Raw): number | null {
  const temp = text(project.param_temp);
  if (temp === 'custom') return num(project.param_temp_custom);
  return num(project.param_temp);
}

export function projectAiFresh(db: AiThermalDb, projectId: string, materials: MaterialDefaults): ProjectAiFresh | null {
  const project = db.projects[projectId];
  if (!isObj(project)) return null;
  const name = text(project.project_name) || projectId;
  const values: Record<string, ProjectAiFreshValue> = {};
  const ai = (from: string, value: string | number): ProjectAiFreshValue => ({ value, source: 'AI-Thermal', from });
  const rru = (from: string, value: string | number): ProjectAiFreshValue => ({ value, source: '5G-RRU', from });

  values[AI_KEY.name] = ai('專案名稱', name);

  const band = text(project.band);
  if (!band) values[AI_KEY.band] = ai('頻段（沒有設定＝FR1）', 'FR1');
  else if (band === 'FR1' || band === 'FR2') values[AI_KEY.band] = ai('頻段', band);

  const ambient = aiThermalAmbient(project);
  const rruT = rruAmbient(project);
  if (ambient != null) values[AI_KEY.ambient] = ai('專案環溫', ambient);
  else if (rruT != null) values[AI_KEY.ambient] = rru('環境溫度 T_amb', rruT);

  const fin = rruFin(project);
  if (fin) values[AI_KEY.fin] = rru('鰭片製程', fin);

  for (const entry of rruMaterialValues(project)) values[matKey(entry.field)] = rru(entry.from, entry.value);
  for (const entry of rruFinValues(project)) values[matKey(entry.field)] = rru(entry.from, entry.value);

  const library = Object.values(db.tim_library).filter(isObj);
  const gp = globalParamsOf(project);
  for (const material of materials.tim) {
    const row = material.catalog
      ? library.find((r) => text(r.srcId) === material.catalog!.id)
      : library.find((r) => looseKey(text(r.model)) === looseKey(material.name));
    if (row) {
      const model = text(row.model);
      const k = rruPositive(row.k);
      const gap = rruPositive(row.gapThickness);
      if (!material.catalog && k != null) values[timKey(material.id, 'k')] = ai(`TIM 型號庫：${model} 的 k`, k);
      if (gap != null) values[timKey(material.id, 'blt')] = ai(`TIM 型號庫：${model} 的填縫厚度`, gap);
      continue;
    }
    const fallback = RRU_TIM_FALLBACKS.find((f) => f.timId === material.id);
    if (!fallback) continue;
    const k = material.catalog ? null : rruPositive(gp[fallback.k]);
    const t = rruPositive(gp[fallback.t]);
    if (k != null) values[timKey(material.id, 'k')] = rru(`${fallback.k}（沒選型號時）`, k);
    if (t != null) values[timKey(material.id, 'blt')] = rru(`${fallback.t}（沒選型號時）`, t);
  }

  const meta = isObj(project.meta) ? project.meta : {};
  return {
    project_id: projectId,
    project_name: name,
    saved_at: text(meta.timestamp) || null,
    values,
    rru_ambient_C: rruT,
    rru_design: rruDesignOf(project),
    rt_power_parts: rtPowerParts(project),
  };
}
