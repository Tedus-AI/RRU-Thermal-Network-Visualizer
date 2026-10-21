/**
 * The shared Thermal Via calculation, as this tool loads it.
 *
 * `viaCalc.js` must stay byte-identical to the copy AI-Thermal and 5G-RRU keep,
 * so the same via design gives the same K_eff in all three tools. The checksum
 * below pins it: a local edit fails here. To take a new version, copy it from
 * AI-Thermal and update the checksum in the same commit.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { aiThermalViaKeff, aiThermalViaReason, equalAreaSide } from './aiThermalVia';

const VIACALC_SHA256 = 'c1733346acc93346b4e868f88639cf73af138f92e336279fb7cf6729c6800478';

describe('the shared viaCalc.js', () => {
  it('is the verbatim copy AI-Thermal and 5G-RRU share', () => {
    const bytes = readFileSync(new URL('./viaCalc.js', import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(VIACALC_SHA256);
  });

  it('loads and computes K_eff from the raw database records', () => {
    const comp = { Component: 'U1', Board_Type: 'Thermal Via', TV_Qty: 25, TV_ID_mil: 8 };
    const specs = { U1: { epadSize: '5×5', via: { fill: 'copper', pitchMil: 30 } } };
    const r = aiThermalViaKeff(comp, specs, {});
    expect(r.ok).toBe(true);
    // 25 copper-filled vias, 8 mil + 1 mil plating, over 25 mm² of FR4.
    const foot = Math.PI * (0.1016 + 0.0254) ** 2;
    expect(r.keff).toBeCloseTo((25 * foot * 385 + (25 - 25 * foot) * 0.3) / 25, 9);
    expect(r.aPad).toBe(25);
    expect(aiThermalViaReason(r)).toBe('');
  });

  it('says why when there is no design', () => {
    const r = aiThermalViaKeff({ Component: 'U1' }, {}, {});
    expect(r.ok).toBe(false);
    expect(aiThermalViaReason(r)).toBe('AI-Thermal「Thermal Via 計算」還沒有這顆的 via 設計');
  });

  it('turns a round pad into the square of the same area', () => {
    expect(equalAreaSide(10) ** 2).toBeCloseTo((Math.PI * 100) / 4, 2);
  });
});
