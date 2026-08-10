/**
 * Canonical component model — 02_Import_Components.md §28.
 *
 * 00 §5.2: this tool must NOT maintain a second independent component master
 * library. Components are imported from the existing 5G RRU Quick Volume
 * Evaluation Tool (or a file) and extended with thermal data; they are never
 * re-authored from scratch here.
 *
 * `thermal_profile` (graph architecture) stays null until Screen 05 — importing a
 * component never implies a thermal path (02 §34).
 */

export const COMPONENT_CATEGORIES = ['RF', 'Digital', 'Power', 'Filter', 'Other'] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

/** Board-level heat spreading path — 02 §15. */
export const BOARD_TYPES = ['Thermal Via', 'Copper Coin', 'None', 'Custom'] as const;
export type BoardType = (typeof BOARD_TYPES)[number];

/** Thermal interface material — 02 §16. */
export const TIM_TYPES = ['Grease', 'Pad', 'Pad2', 'Putty', 'None', 'Custom'] as const;
export type TimType = (typeof TIM_TYPES)[number];

export interface ThermalSpec {
  r_jc_C_per_W: number | null;
  limit_C: number | null;
  /** Confirmed in Screen 04; import only records what the source stated. */
  limit_type: 'Tj' | 'Tc' | 'Ts' | null;
  height_mm: number | null;
  pad_L_mm: number | null;
  pad_W_mm: number | null;
  thickness_mm: number | null;
  board_type: BoardType | null;
  tim_type: TimType | null;
}

export type ImportSourceType = 'ExistingProject' | 'CSV' | 'Excel' | 'Paste' | 'Manual';

export interface ComponentProvenance {
  source_type: ImportSourceType;
  source_project_id: string | null;
  source_project_name: string | null;
  source_file: string | null;
  imported_at: string;
  /** Lineage carried by the source row, when it had any (02 §6). */
  ref_origin_project?: string | null;
  ref_origin_id?: string | null;
  ref_locked?: boolean | null;
}

/**
 * Graph-specific extension. Authored in Screen 05, never by the importer.
 */
export interface ThermalProfile {
  architecture: string;
  package_model: 'RJC' | 'RJB' | 'RJA' | 'CUSTOM';
  base_zone: string | null;
  cooling_destination: string | null;
  coin_enabled: boolean;
  thermal_via_enabled: boolean;
  heat_pipe_enabled: boolean;
  template_id: string | null;
}

export interface Component {
  id: string;
  name: string;
  category: ComponentCategory;
  qty: number;
  /** Dissipation of ONE unit, W. */
  power_W: number;

  thermal_spec: ThermalSpec;
  thermal_profile: ThermalProfile | null;
  provenance: ComponentProvenance;

  /**
   * Fields the source carried that this tool does not model. Preserved verbatim
   * so a re-export or another tool's data is never destroyed (02 §34, AC-02-14).
   */
  metadata?: Record<string, unknown>;
}

export function emptyThermalSpec(): ThermalSpec {
  return {
    r_jc_C_per_W: null,
    limit_C: null,
    limit_type: null,
    height_mm: null,
    pad_L_mm: null,
    pad_W_mm: null,
    thickness_mm: null,
    board_type: null,
    tim_type: null,
  };
}

/**
 * Component dissipation summary, W.
 *
 * 02 §19 / §34: this is Qty × Power for reporting only. It is NOT the heat flow Q
 * through any thermal edge — edge heat flow only exists after the solver runs on
 * a real topology, and a component's dissipation may split across several paths.
 */
export function componentTotalPowerW(component: Pick<Component, 'qty' | 'power_W'>): number {
  return (component.qty || 0) * (component.power_W || 0);
}

export function totalPowerW(components: Component[]): number {
  return components.reduce((sum, c) => sum + componentTotalPowerW(c), 0);
}

/** A component is a heat source when it dissipates. */
export function isHeatSource(component: Component): boolean {
  return (component.power_W ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Legacy adapter — 02 §29
// ---------------------------------------------------------------------------

/**
 * The column shape used by the existing 5G RRU Quick Volume Evaluation Tool.
 * 02 §29 explicitly forbids requiring a one-shot migration of that database, so
 * both directions are supported and the legacy shape stays readable.
 */
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
  /** Legacy category token: rf / digital / pwr. */
  category?: string | null;
  [key: string]: unknown;
}

/** Legacy category tokens — 02 §10. */
const LEGACY_CATEGORY: Record<string, ComponentCategory> = {
  rf: 'RF',
  digital: 'Digital',
  pwr: 'Power',
  power: 'Power',
  filter: 'Filter',
  other: 'Other',
};

export function legacyCategoryToCanonical(token: string | null | undefined): ComponentCategory | null {
  if (!token) return null;
  return LEGACY_CATEGORY[token.trim().toLowerCase()] ?? null;
}

const OWNED_LEGACY_KEYS = new Set([
  'Component',
  'Qty',
  'Power(W)',
  'Height(mm)',
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
    normalizeBoardType: (value: unknown) => BoardType | null;
    normalizeTim: (value: unknown) => TimType | null;
  },
): Component {
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!OWNED_LEGACY_KEYS.has(key)) metadata[key] = value;
  }

  return {
    id: options.id,
    name: String(row.Component ?? '').trim(),
    category: legacyCategoryToCanonical(row.category) ?? 'Other',
    qty: Number(row.Qty ?? 0),
    power_W: Number(row['Power(W)'] ?? 0),
    thermal_spec: {
      r_jc_C_per_W: row.R_jc ?? null,
      limit_C: row['Limit(C)'] ?? null,
      limit_type: null,
      height_mm: row['Height(mm)'] ?? null,
      pad_L_mm: row.Pad_L ?? null,
      pad_W_mm: row.Pad_W ?? null,
      thickness_mm: row['Thick(mm)'] ?? null,
      board_type: options.normalizeBoardType(row.Board_Type),
      tim_type: options.normalizeTim(row.TIM_Type),
    },
    thermal_profile: null,
    provenance: options.provenance,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

const CANONICAL_TO_LEGACY_CATEGORY: Record<ComponentCategory, string> = {
  RF: 'rf',
  Digital: 'digital',
  Power: 'pwr',
  Filter: 'filter',
  Other: 'other',
};

export function canonicalComponentToLegacy(component: Component): LegacyComponentRow {
  return {
    ...(component.metadata ?? {}),
    Component: component.name,
    Qty: component.qty,
    'Power(W)': component.power_W,
    'Height(mm)': component.thermal_spec.height_mm,
    Pad_L: component.thermal_spec.pad_L_mm,
    Pad_W: component.thermal_spec.pad_W_mm,
    'Thick(mm)': component.thermal_spec.thickness_mm,
    Board_Type: component.thermal_spec.board_type,
    'Limit(C)': component.thermal_spec.limit_C,
    R_jc: component.thermal_spec.r_jc_C_per_W,
    TIM_Type: component.thermal_spec.tim_type,
    category: CANONICAL_TO_LEGACY_CATEGORY[component.category],
  };
}
