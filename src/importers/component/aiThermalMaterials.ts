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
import type { AiMatField } from '@/domain/projectAiLink';

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

export { positive as rruPositive };
