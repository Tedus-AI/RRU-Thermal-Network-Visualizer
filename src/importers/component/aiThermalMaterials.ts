/**
 * 5G-RRU's parameter console, read off an AI-Thermal project document.
 *
 * The document also carries 5G-RRU's `global_params`: the coin, the solder
 * under it, the generic via numbers, the heat-sink base and the TIM fallbacks
 * that 5G-RRU computes with. They are the same physical numbers Screen 01 asks
 * for, so a project linked to the AI-Thermal project takes them from there
 * (`aiThermalProject.ts`, `domain/projectAiLink.ts`).
 *
 * Only what 5G-RRU actually stored crosses over. A key 5G-RRU never saved runs
 * on its factory default there, and importing that default here would dress an
 * assumption up as a project value.
 */

import { BUILTIN_TIM_IDS } from '@/domain/materials';
import type { AiMatField, RruDesign } from '@/domain/projectAiLink';

type Raw = Record<string, unknown>;

const num = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const positive = (value: unknown): number | null => {
  const parsed = num(value);
  return parsed != null && parsed > 0 ? parsed : null;
};

const n = (value: number) => String(+value.toFixed(4));

/** One constant 5G-RRU stored, with the field(s) it came from as 5G-RRU names them. */
export interface RruValue {
  field: AiMatField;
  value: number;
  from: string;
}

const SCALARS: { field: AiMatField; key: string; from: string; fraction?: true }[] = [
  { field: 'coin_L_mm', key: 'Coin_L_Setting', from: '銅塊長 Coin_L' },
  { field: 'coin_W_mm', key: 'Coin_W_Setting', from: '銅塊寬 Coin_W' },
  { field: 'coin_thickness_mm', key: 'Coin_T_Setting', from: '銅塊厚度 Coin_T' },
  { field: 'copper_k_W_mK', key: 'K_Coin', from: 'K（銅塊）' },
  { field: 'solder_k_W_mK', key: 'K_Solder', from: 'K（錫片）' },
  { field: 'solder_thickness_mm', key: 't_Solder', from: 't（錫片）' },
  { field: 'solder_voiding', key: 'Voiding', from: '錫片有效面積率 Voiding', fraction: true },
  { field: 'via_effective_k_W_mK', key: 'K_Via', from: 'Via 等效 K' },
  { field: 'via_efficiency', key: 'Via_Eff', from: 'Via 效率 Via_Eff', fraction: true },
  { field: 'hsk_base_thickness_mm', key: 't_base', from: '散熱器基板厚 t_base' },
];

export function globalParamsOf(project: Raw): Raw {
  const gp = project.global_params;
  return gp && typeof gp === 'object' && !Array.isArray(gp) ? (gp as Raw) : {};
}

/** Every material constant 5G-RRU stored for this project. */
export function rruMaterialValues(project: Raw): RruValue[] {
  const gp = globalParamsOf(project);
  const out: RruValue[] = [];
  for (const s of SCALARS) {
    const value = positive(gp[s.key]);
    if (value == null || (s.fraction && value > 1)) continue;
    out.push({ field: s.field, value, from: s.from });
  }
  // The base envelope is the enclosure footprint, 5G-RRU's `rruFootprint`:
  // length = PCB + Top + Bottom, width = PCB + Left + Right.
  const pcbL = positive(gp.L_pcb);
  const pcbW = positive(gp.W_pcb);
  const margin = (key: string) => {
    const value = num(gp[key]);
    return value != null && value >= 0 ? value : null;
  };
  const [top, btm, left, right] = ['Top', 'Btm', 'Left', 'Right'].map(margin);
  if (pcbL != null && top != null && btm != null) {
    out.push({
      field: 'hsk_base_L_mm',
      value: pcbL + top + btm,
      from: `PCB 長 ${n(pcbL)} ＋ Top ${n(top)} ＋ Bottom ${n(btm)}`,
    });
  }
  if (pcbW != null && left != null && right != null) {
    out.push({
      field: 'hsk_base_W_mm',
      value: pcbW + left + right,
      from: `PCB 寬 ${n(pcbW)} ＋ Left ${n(left)} ＋ Right ${n(right)}`,
    });
  }
  return out;
}

/** 5G-RRU's TIM fallbacks (what a part with a type but no model computes with), per built-in material. */
export const RRU_TIM_FALLBACKS: { timId: string; type: string; k: string; t: string }[] = [
  { timId: BUILTIN_TIM_IDS.grease, type: 'Grease', k: 'K_Grease', t: 't_Grease' },
  { timId: BUILTIN_TIM_IDS.pad, type: 'Pad', k: 'K_Pad', t: 't_Pad' },
  { timId: BUILTIN_TIM_IDS.putty, type: 'Putty', k: 'K_Putty', t: 't_Putty' },
];

/** 5G-RRU's T_amb, when it stored one. */
export function rruAmbient(project: Raw): number | null {
  return num(globalParamsOf(project).T_amb);
}

/** 5G-RRU's fin process: Die-casting or Embedded, when it stored one. */
export function rruFin(project: Raw): 'Die-casting Fin' | 'Embedded Fin' | null {
  const value = globalParamsOf(project).fin_tech_selector_v2;
  if (typeof value !== 'string') return null;
  if (/die-?casting/i.test(value)) return 'Die-casting Fin';
  if (/embedded/i.test(value)) return 'Embedded Fin';
  return null;
}

/**
 * 5G-RRU's K_FIN when no custom value is ticked (its `FIN_PROCESS_DEFAULTS`;
 * Die-casting went from 160 to 150 in 2026-10). Only used for a project 5G-RRU
 * has not saved since it started writing `rru_result`, which carries the K_FIN
 * it actually used. Keep in step with 5G-RRU's index.html.
 */
export const RRU_FIN_K_DEFAULT = { Embedded: 200, 'Die-casting': 150 } as const;

function resultOf(project: Raw): Raw | null {
  const r = project.rru_result;
  return r && typeof r === 'object' && !Array.isArray(r) ? (r as Raw) : null;
}

const stamp = (at: unknown) => (typeof at === 'string' && at.length >= 10 ? `，${at.slice(0, 10)} 存檔` : '');

/**
 * The heat sink's fin array as 5G-RRU has it.
 *
 * The geometry it is given (air gap, thickness, draft) is in the parameter
 * console. The geometry it works out (fin height, fin count) only exists in
 * the design result it writes on save, and only a design it could complete
 * (`ok`) — a fin height from a design that failed its own rules is no design.
 * K_FIN: what that design used, else the console's custom value, else 5G-RRU's
 * default for the process (the user asked for it to be linked by default).
 */
export function rruFinValues(project: Raw): RruValue[] {
  const gp = globalParamsOf(project);
  const result = resultOf(project);
  const fin = rruFin(project);
  const out: RruValue[] = [];
  const gap = positive(gp.Gap);
  if (gap != null) out.push({ field: 'hsk_fin_gap_mm', value: gap, from: '鰭片 Air Gap（Gap）' });
  const t = positive(gp.Fin_t);
  if (t != null) out.push({ field: 'hsk_fin_thickness_mm', value: t, from: '鰭片厚度 Fin_t' });
  if (fin === 'Die-casting Fin') {
    const draft = positive(gp.Draft_Angle);
    if (draft != null) out.push({ field: 'hsk_fin_draft_deg', value: draft, from: '拔模角 Draft_Angle' });
  }
  if (result && result.ok === true) {
    const height = positive(result.fin_height);
    const count = positive(result.fin_count);
    if (height != null) {
      out.push({ field: 'hsk_fin_height_mm', value: height, from: `設計結果：鰭片高度${stamp(result.at)}` });
    }
    if (count != null && Number.isInteger(count)) {
      out.push({ field: 'hsk_fin_count', value: count, from: `設計結果：鰭片數${stamp(result.at)}` });
    }
  }
  const resultK = result ? positive(result.k_fin) : null;
  const process = fin === 'Die-casting Fin' ? 'dc' : fin === 'Embedded Fin' ? 'emb' : null;
  const customK = process && gp[`fin_custom_${process}`] === true ? positive(gp[`fin_kfin_${process}`]) : null;
  if (resultK != null) {
    out.push({ field: 'hsk_fin_k_W_mK', value: resultK, from: `設計結果：K_FIN${stamp(result!.at)}` });
  } else if (customK != null) {
    out.push({ field: 'hsk_fin_k_W_mK', value: customK, from: 'K_FIN（自訂）' });
  } else if (fin) {
    const value = fin === 'Die-casting Fin' ? RRU_FIN_K_DEFAULT['Die-casting'] : RRU_FIN_K_DEFAULT.Embedded;
    out.push({ field: 'hsk_fin_k_W_mK', value, from: `K_FIN（預設 ${value}）` });
  }
  return out;
}

/** 5G-RRU's saved design result, as the heat-sink surface compares with it. Null when it has saved none. */
export function rruDesignOf(project: Raw): RruDesign | null {
  const r = resultOf(project);
  if (!r || typeof r.at !== 'string' || typeof r.ok !== 'boolean') return null;
  const design: RruDesign = { at: r.at, ok: r.ok };
  if (typeof r.why === 'string' && r.why) design.why = r.why;
  if (r.fin_tech === 'Embedded' || r.fin_tech === 'Die-casting') design.fin_tech = r.fin_tech;
  const pairs: [keyof RruDesign, string][] = [
    ['fin_height_mm', 'fin_height'],
    ['fin_count', 'fin_count'],
    ['h_W_m2K', 'h'],
    ['h_conv_W_m2K', 'h_conv'],
    ['h_rad_W_m2K', 'h_rad'],
    ['eta_fin', 'eta_fin'],
    ['eta_process', 'eta_process'],
    ['k_fin_W_mK', 'k_fin'],
    ['heat_W', 'heat_W'],
    ['volume_L', 'volume_L'],
  ];
  for (const [to, from] of pairs) {
    const value = num(r[from]);
    if (value != null) (design as unknown as Record<string, number>)[to] = value;
  }
  return design;
}

export { positive as rruPositive };
