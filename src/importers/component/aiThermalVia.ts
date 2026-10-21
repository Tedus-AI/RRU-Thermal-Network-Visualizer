/**
 * AI-Thermal's Thermal Via design, as the effective k of a board path's via array.
 *
 * AI-Thermal's 「Thermal Via 計算」 page stores each part's via design in
 * `thermal_specs[specKey(name)].via`: pad, count, inner diameter, plating and
 * fill. From those it computes one area-weighted effective k across the E-PAD
 * (copper barrel + fill + the FR4 in between). 5G-RRU uses that same number for
 * the part's board resistance, and so does this tool: an import states it as
 * the part's own via k (`heat_path.parameters.via_effective_k_W_mK`) with a
 * process efficiency of 1 — the copper, fill and FR4 fractions are already in
 * it, so derating it again would count them twice (5G-RRU does not either).
 *
 * Where AI-Thermal has no complete design (nothing yet, set aside, an input
 * missing, or the vias would not fit the pad) nothing is stated, and the part
 * inherits 01's generic via k and process efficiency, as before.
 *
 * `viaCalc.js` beside this file is a VERBATIM copy of the one AI-Thermal and
 * 5G-RRU share (both repos keep it byte-identical). Do not edit it here: change
 * it in AI-Thermal, copy it to all three, and update the checksum pinned in
 * `aiThermalVia.test.ts`. It is a plain script that registers `ViaCalc` on the
 * global object, so it is loaded for its side effect.
 */

import './viaCalc.js';

type Raw = Record<string, unknown>;

export interface ViaIssue {
  lv: 'warn' | 'err';
  code: string;
  text: string;
}

/** What `ViaCalc.keffForComp` returns, as far as this tool reads it. */
export interface ViaKeff {
  ok: boolean;
  /** W/m·K, across the whole pad. */
  keff: number | null;
  /** mm², the pad K_eff is averaged over. */
  aPad: number | null;
  reason: 'nodata' | 'skip' | 'missing' | 'over' | null;
  missing: string[];
  /** Layout problems AI-Thermal reports but still uses the k for. */
  issues: ViaIssue[];
  shape?: 'circle' | 'rect';
  /** Pad diameter of a round pad, mm. */
  D?: number | null;
  n?: number | null;
  diaMil?: number | null;
}

interface ViaCalcApi {
  keffForComp(comp: Raw, thermalSpecs: Raw, globalParams: Raw, pcbT?: number | null): ViaKeff;
  reasonText(result: ViaKeff): string;
}

function api(): ViaCalcApi {
  const found = (globalThis as unknown as { ViaCalc?: ViaCalcApi }).ViaCalc;
  if (!found) throw new Error('viaCalc.js did not load.');
  return found;
}

/** The via design of one AI-Thermal component, read exactly as AI-Thermal and 5G-RRU read it. */
export function aiThermalViaKeff(comp: Raw, thermalSpecs: Raw, globalParams: Raw): ViaKeff {
  return api().keffForComp(comp, thermalSpecs, globalParams);
}

/** Why AI-Thermal's k is not used — the same sentence the two other tools show. */
export function aiThermalViaReason(result: ViaKeff): string {
  return api().reasonText(result);
}

/**
 * The side of the square with a round pad's area. This tool's E-PAD is
 * rectangular, and the via array's area is what K_eff is averaged over, so a
 * round pad arrives as the square that keeps its area.
 */
export function equalAreaSide(diameter: number): number {
  return Math.round(((diameter * Math.sqrt(Math.PI)) / 2) * 1000) / 1000;
}
