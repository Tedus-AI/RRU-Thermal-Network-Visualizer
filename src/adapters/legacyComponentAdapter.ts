/**
 * Legacy adapter — 02 §29, 04 §30.
 *
 * The existing 5G RRU Quick Volume Evaluation Tool keeps components in a flat
 * column shape. 04 §30 forbids requiring a one-shot migration, so both
 * directions are supported and unknown legacy columns survive a round trip
 * (AC-04-17, AC-04-18).
 *
 * 04 §30 also warns that legacy `Thick(mm)` / `Pad_L` / `Pad_W` may carry
 * Volume-Tool-specific meaning. They are carried across but flagged
 * `needs_review` rather than silently reinterpreted as package geometry.
 *
 * `Height(mm)` is deliberately NOT an owned column any more. In the Volume Tool
 * it is a vertical POSITION feeding a local-ambient correction
 * (`T_amb + Height x 0.03`), not package geometry, and this tool gets local
 * ambient from the boundary conditions and the network instead. It therefore
 * falls through to `metadata` and round trips untouched.
 */

import {
  emptyArchitecturePrep,
  emptyExternalMappings,
  emptyGeometry,
  emptyTim,
  inferHeatPath,
  inferLimitType,
  type HeatPathType,
  type Component,
  type ComponentCategory,
  type ComponentProvenance,
} from '@/domain/component';
import { sourced, unknownValue } from '@/domain/sourcedValue';
import { findTimMaterial, type MaterialDefaults } from '@/domain/materials';

export interface LegacyComponentRow {
  Component: string;
  Qty: number;
  'Power(W)': number;
  'Height(mm)'?: number | null;
  Pad_L?: number | null;
  Pad_W?: number | null;
  'Thick(mm)'?: number | null;
  Board_Type?: string | null;
  'Limit(C)'?: number | null;
  R_jc?: number | null;
  TIM_Type?: string | null;
  category?: string | null;
  [key: string]: unknown;
}

const LEGACY_CATEGORY: Record<string, ComponentCategory> = {
  rf: 'RF',
  digital: 'Digital',
  pwr: 'Power',
  power: 'Power',
  filter: 'Filter',
  other: 'Other',
};

export function legacyCategoryToCanonical(
  token: string | null | undefined,
): ComponentCategory | null {
  if (!token) return null;
  return LEGACY_CATEGORY[token.trim().toLowerCase()] ?? null;
}

const OWNED_LEGACY_KEYS = new Set([
  'Component',
  'Qty',
  'Power(W)',
  'Pad_L',
  'Pad_W',
  'Thick(mm)',
  'Board_Type',
  'Limit(C)',
  'R_jc',
  'TIM_Type',
  'category',
]);

export function legacyComponentToCanonical(
  row: LegacyComponentRow,
  options: {
    id: string;
    provenance: ComponentProvenance;
    normalizeHeatPath: (value: unknown) => HeatPathType | null;
    /** Turns the legacy TIM name into an id in the project's library. */
    resolveTimId: (value: unknown) => string | null;
  },
): Component {
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!OWNED_LEGACY_KEYS.has(key)) metadata[key] = value;
  }

  const hasLegacyGeometry = row['Thick(mm)'] != null || row.Pad_L != null || row.Pad_W != null;

  const name = String(row.Component ?? '').trim();
  const category = legacyCategoryToCanonical(row.category) ?? 'Other';
  const statedHeatPath = options.normalizeHeatPath(row.Board_Type);
  const heatPath = statedHeatPath ?? inferHeatPath(category);

  return {
    id: options.id,
    name,
    category,
    enabled: true,
    qty: Number(row.Qty ?? 0),
    power_W:
      row['Power(W)'] == null
        ? unknownValue<number>('Imported')
        : sourced(Number(row['Power(W)']), 'Imported', { reference: 'Volume Evaluation Tool' }),

    thermal_spec: {
      // The legacy schema records a limit but never says which surface it is,
      // so the surface is inferred and left for Screen 04 to confirm.
      limit_type: inferLimitType(category, name),
      limit_type_confirmed: false,
      limit_C:
        row['Limit(C)'] == null
          ? null
          : sourced(Number(row['Limit(C)']), 'Imported', { confidence: 'medium' }),
      r_jc_C_per_W:
        row.R_jc == null ? null : sourced(Number(row.R_jc), 'Imported', { confidence: 'medium' }),
      package_type: null,
      geometry: {
        ...emptyGeometry(),
        source_L_mm: row.Pad_L ?? null,
        source_W_mm: row.Pad_W ?? null,
        // `Thick(mm)` is the coin for a coin path and the PCB otherwise.
        board_thickness_mm: heatPath === 'Coin' ? null : (row['Thick(mm)'] ?? null),
        coin_thickness_mm: heatPath === 'Coin' ? (row['Thick(mm)'] ?? null) : null,
        needs_review: hasLegacyGeometry || undefined,
      },
      heat_path: { type: heatPath, parameters: {} },
      heat_path_confirmed: statedHeatPath != null,
      tim: emptyTim(options.resolveTimId(row.TIM_Type)),
    },

    architecture_prep: emptyArchitecturePrep(),
    provenance: options.provenance,
    external_mappings: emptyExternalMappings(),
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

/** Heat paths written back in the vocabulary the Volume Evaluation Tool reads. */
const LEGACY_BOARD_TYPE: Record<HeatPathType, string> = {
  Coin: 'Copper Coin',
  Board: 'Thermal Via',
  TopSurface: 'None',
  DirectMetal: 'None',
};

const CANONICAL_TO_LEGACY_CATEGORY: Record<ComponentCategory, string> = {
  RF: 'rf',
  Digital: 'digital',
  Power: 'pwr',
  Filter: 'filter',
  Other: 'other',
};

/**
 * `materials` supplies the TIM's NAME, which is what the Volume Evaluation Tool
 * reads — the id this tool stores means nothing over there.
 */
export function canonicalComponentToLegacy(
  component: Component,
  materials?: MaterialDefaults,
): LegacyComponentRow {
  const spec = component.thermal_spec;
  const tim = materials ? findTimMaterial(materials, spec.tim.tim_id) : null;
  return {
    // Unknown fields first so an owned column can never be shadowed.
    ...(component.metadata ?? {}),
    Component: component.name,
    Qty: component.qty,
    'Power(W)': component.power_W.value ?? 0,
    Pad_L: spec.geometry.source_L_mm,
    Pad_W: spec.geometry.source_W_mm,
    'Thick(mm)': spec.geometry.coin_thickness_mm ?? spec.geometry.board_thickness_mm,
    Board_Type: LEGACY_BOARD_TYPE[spec.heat_path.type],
    'Limit(C)': spec.limit_C?.value ?? null,
    R_jc: spec.r_jc_C_per_W?.value ?? null,
    TIM_Type: tim?.name ?? 'None',
    category: CANONICAL_TO_LEGACY_CATEGORY[component.category],
  };
}
