/**
 * 5G-RRU's parameter console → this project's 01 materials.
 *
 * An AI-Thermal project document also carries 5G-RRU's `global_params`: the
 * coin, the solder under it, the generic via numbers, the heat-sink base and
 * the TIM fallbacks that 5G-RRU computes with. They are the same physical
 * numbers 01 asks for, so Screen 02 offers them next to the component import.
 *
 * Offered, never applied on their own: each row shows 01's current value beside
 * 5G-RRU's, and the engineer picks. Rows where 01 still holds the shipped
 * (Assumed) value or nothing start ticked; a value someone stated in 01 starts
 * unticked, because overwriting it should be a decision.
 *
 * Only what 5G-RRU actually stored crosses over. A key 5G-RRU never saved runs
 * on its factory default there, and importing that default here would dress an
 * assumption up as a project value.
 */

import { BUILTIN_TIM_IDS, type MaterialDefaults, type TimMaterial } from '@/domain/materials';
import { sourced, type SourcedValue } from '@/domain/sourcedValue';

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

type ScalarField =
  | 'copper_k_W_mK'
  | 'via_effective_k_W_mK'
  | 'via_efficiency'
  | 'solder_k_W_mK'
  | 'solder_thickness_mm'
  | 'solder_voiding'
  | 'coin_L_mm'
  | 'coin_W_mm'
  | 'coin_thickness_mm'
  | 'hsk_base_thickness_mm'
  | 'hsk_base_L_mm'
  | 'hsk_base_W_mm';

/** Where a row lands in 01: a project constant, or one TIM material's k or BLT. */
export type RruMaterialTarget =
  | { kind: 'field'; field: ScalarField }
  | { kind: 'tim'; timId: string; prop: 'k_W_mK' | 'blt_mm' };

export interface RruMaterialRow {
  id: string;
  /** Group heading, as 01 groups them. */
  group: string;
  label: string;
  unit: string;
  target: RruMaterialTarget;
  current: number | null;
  /** 01's current value is someone's statement, not the shipped one. */
  currentStated: boolean;
  incoming: number;
  /** The 5G-RRU field(s) it came from, as 5G-RRU names them. */
  from: string;
  same: boolean;
}

const SCALARS: { group: string; label: string; unit: string; field: ScalarField; key: string; from: string; fraction?: true }[] = [
  { group: '銅塊', label: '長 L', unit: 'mm', field: 'coin_L_mm', key: 'Coin_L_Setting', from: '銅塊長 Coin_L' },
  { group: '銅塊', label: '寬 W', unit: 'mm', field: 'coin_W_mm', key: 'Coin_W_Setting', from: '銅塊寬 Coin_W' },
  { group: '銅塊', label: '厚度', unit: 'mm', field: 'coin_thickness_mm', key: 'Coin_T_Setting', from: '銅塊厚度 Coin_T' },
  { group: '銅塊', label: '銅導熱係數', unit: 'W/m·K', field: 'copper_k_W_mK', key: 'K_Coin', from: 'K（銅塊）' },
  { group: '焊料', label: '焊料導熱係數', unit: 'W/m·K', field: 'solder_k_W_mK', key: 'K_Solder', from: 'K（錫片）' },
  { group: '焊料', label: '焊料厚度', unit: 'mm', field: 'solder_thickness_mm', key: 't_Solder', from: 't（錫片）' },
  { group: '焊料', label: '焊料有效面積率', unit: '—', field: 'solder_voiding', key: 'Voiding', from: '錫片有效面積率 Voiding', fraction: true },
  { group: '導熱孔', label: '導熱孔等效 k', unit: 'W/m·K', field: 'via_effective_k_W_mK', key: 'K_Via', from: 'Via 等效 K' },
  { group: '導熱孔', label: '導熱孔製程係數', unit: '—', field: 'via_efficiency', key: 'Via_Eff', from: 'Via 效率 Via_Eff', fraction: true },
  { group: '散熱器基座', label: '厚度', unit: 'mm', field: 'hsk_base_thickness_mm', key: 't_base', from: '散熱器基板厚 t_base' },
];

/** 5G-RRU's TIM fallbacks (used when a part names no TIM model) → 01's material of that type. */
const TIMS: { type: string; timId: string; k: string; t: string }[] = [
  { type: 'Grease', timId: BUILTIN_TIM_IDS.grease, k: 'K_Grease', t: 't_Grease' },
  { type: 'Pad', timId: BUILTIN_TIM_IDS.pad, k: 'K_Pad', t: 't_Pad' },
  { type: 'Putty', timId: BUILTIN_TIM_IDS.putty, k: 'K_Putty', t: 't_Putty' },
];

const n = (value: number) => String(+value.toFixed(4));

function row(
  base: Omit<RruMaterialRow, 'current' | 'currentStated' | 'same'>,
  current: SourcedValue<number> | null | undefined,
): RruMaterialRow {
  const value = current?.value ?? null;
  return {
    ...base,
    current: value,
    currentStated: value != null && current?.source !== 'Assumed',
    same: value != null && Math.abs(value - base.incoming) < 1e-9,
  };
}

/** Every value 5G-RRU stored for this project, against 01's current one. */
export function rruMaterialRows(project: Raw, materials: MaterialDefaults): RruMaterialRow[] {
  const gp: Raw =
    project.global_params && typeof project.global_params === 'object' && !Array.isArray(project.global_params)
      ? (project.global_params as Raw)
      : {};
  const rows: RruMaterialRow[] = [];
  for (const s of SCALARS) {
    const value = positive(gp[s.key]);
    if (value == null || (s.fraction && value > 1)) continue;
    rows.push(
      row(
        { id: s.field, group: s.group, label: s.label, unit: s.unit, target: { kind: 'field', field: s.field }, incoming: value, from: s.from },
        materials[s.field],
      ),
    );
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
    rows.push(
      row(
        {
          id: 'hsk_base_L_mm',
          group: '散熱器基座',
          label: '長 L',
          unit: 'mm',
          target: { kind: 'field', field: 'hsk_base_L_mm' },
          incoming: pcbL + top + btm,
          from: `PCB 長 ${n(pcbL)} ＋ Top ${n(top)} ＋ Bottom ${n(btm)}`,
        },
        materials.hsk_base_L_mm,
      ),
    );
  }
  if (pcbW != null && left != null && right != null) {
    rows.push(
      row(
        {
          id: 'hsk_base_W_mm',
          group: '散熱器基座',
          label: '寬 W',
          unit: 'mm',
          target: { kind: 'field', field: 'hsk_base_W_mm' },
          incoming: pcbW + left + right,
          from: `PCB 寬 ${n(pcbW)} ＋ Left ${n(left)} ＋ Right ${n(right)}`,
        },
        materials.hsk_base_W_mm,
      ),
    );
  }
  for (const t of TIMS) {
    // The project may have renamed or removed its built-in material; then there is nowhere to put it.
    const material = materials.tim.find((m) => m.id === t.timId);
    if (!material) continue;
    // A material linked to the TIM Management Tool takes its k from there, never from here.
    const k = material.catalog ? null : positive(gp[t.k]);
    const blt = positive(gp[t.t]);
    if (k != null) {
      rows.push(
        row(
          { id: `${t.timId}.k`, group: 'TIM（沒選型號時）', label: `${material.name} k`, unit: 'W/m·K', target: { kind: 'tim', timId: t.timId, prop: 'k_W_mK' }, incoming: k, from: `K_${t.type}` },
          material.k_W_mK,
        ),
      );
    }
    if (blt != null) {
      rows.push(
        row(
          { id: `${t.timId}.blt`, group: 'TIM（沒選型號時）', label: `${material.name} BLT`, unit: 'mm', target: { kind: 'tim', timId: t.timId, prop: 'blt_mm' }, incoming: blt, from: `t_${t.type}` },
          material.blt_mm,
        ),
      );
    }
  }
  return rows;
}

/** Ticked to begin with: 01 has nothing, or only the shipped value. */
export function rruMaterialDefaultPick(rows: RruMaterialRow[]): string[] {
  return rows.filter((r) => !r.same && !r.currentStated).map((r) => r.id);
}

/** The patch for `patchMaterials`: the picked rows, stamped Imported with where they came from. */
export function rruMaterialPatch(
  materials: MaterialDefaults,
  rows: RruMaterialRow[],
  picked: readonly string[],
  reference: string,
): Partial<MaterialDefaults> {
  const chosen = rows.filter((r) => picked.includes(r.id) && !r.same);
  const patch: Partial<MaterialDefaults> = {};
  const stamp = (value: number) => sourced(value, 'Imported', { reference });
  let tim: TimMaterial[] | null = null;
  for (const r of chosen) {
    if (r.target.kind === 'field') {
      (patch as Record<ScalarField, SourcedValue<number>>)[r.target.field] = stamp(r.incoming);
    } else {
      const { timId, prop } = r.target;
      tim = (tim ?? materials.tim).map((m) => (m.id === timId ? { ...m, [prop]: stamp(r.incoming) } : m));
    }
  }
  if (tim) patch.tim = tim;
  return patch;
}
