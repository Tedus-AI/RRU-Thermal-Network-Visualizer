/**
 * Canonical component model — 02 §28, expanded by 04 §29.
 *
 * 00 §5.2: this tool must NOT maintain a second independent component master
 * library. Components are imported from the existing 5G RRU Quick Volume
 * Evaluation Tool (or a file) and extended with thermal data.
 *
 * `thermal_profile` and everything under `architecture_prep` are PREPARATION for
 * Screen 05. Neither creates a thermal node or edge (04 §19, §40, AC-04-12/13/14).
 *
 * Naming note: the 04 document sketches this model in camelCase. The codebase
 * settled on snake_case in Screen 02, so the field semantics are followed exactly
 * and the casing stays consistent with the rest of the project.
 */

import { sourced, unknownValue, valueOf, type SourcedValue } from './sourcedValue';
import type { ExternalMappings } from '@/thermal/resultValue';

export const COMPONENT_CATEGORIES = ['RF', 'Digital', 'Power', 'Filter', 'Other'] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

/**
 * Board-level heat spreading path — 04 §11, §17.
 * Widened from the Screen 02 vocabulary, which had no Direct Metal / PCB Only.
 */
export const BOARD_TYPES = [
  'Thermal Via',
  'Copper Coin',
  'Direct Metal',
  'PCB Only',
  'None',
  'Custom',
] as const;
export type BoardType = (typeof BOARD_TYPES)[number];

/**
 * Thermal interface material — 04 §11.
 * Solder and PCM are first-class here; naming a TIM still does not create an
 * edge, that stays Screen 05's decision (04 §11).
 */
export const TIM_TYPES = [
  'Grease',
  'Pad',
  'Pad2',
  'Putty',
  'PCM',
  'Gap Filler',
  'Solder',
  'None',
  'Custom',
] as const;
export type TimType = (typeof TIM_TYPES)[number];

/**
 * 04 §11: a component's limit may be junction, case or surface. Nothing may force
 * every component onto Tj — a DDR case limit is a case limit.
 */
export const LIMIT_TYPES = ['Tj', 'Tc', 'Ts', 'Custom', 'Unknown'] as const;
export type LimitType = (typeof LIMIT_TYPES)[number];

export const PACKAGE_TYPES = [
  'QFN',
  'BGA',
  'LGA',
  'Lidded BGA',
  'Bare Die',
  'Module',
  'Shielded Module',
  'SOT',
  'QFP',
  'Custom',
  'Unknown',
] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

/** 04 §19 — modelling preference only; Screen 05 turns it into topology. */
export const ARCHITECTURE_TEMPLATES = [
  'UNASSIGNED',
  'BOTTOM_COOL_COIN',
  'BOTTOM_COOL_VIA',
  'TOP_COOL_LID',
  'BARE_DIE',
  'SMALL_BASE_HEAT_PIPE',
  'DIRECT_METAL',
  'CUSTOM',
] as const;
export type ArchitectureTemplate = (typeof ARCHITECTURE_TEMPLATES)[number];

export const ARCHITECTURE_TEMPLATE_LABELS: Record<ArchitectureTemplate, string> = {
  UNASSIGNED: 'Unassigned',
  BOTTOM_COOL_COIN: 'Bottom Cool + Copper Coin',
  BOTTOM_COOL_VIA: 'Bottom Cool + Thermal Via',
  TOP_COOL_LID: 'Top Cool + Lid',
  BARE_DIE: 'Bare Die',
  SMALL_BASE_HEAT_PIPE: 'Small Base + Heat Pipe',
  DIRECT_METAL: 'Direct Metal Mount',
  CUSTOM: 'Custom',
};

/** 04 §20 — a placement hint, never an actual base node. */
export const BASE_ZONES = [
  'Unassigned',
  'RF Left',
  'RF Right',
  'Digital',
  'Power',
  'Filter',
  'Custom',
] as const;
export type BaseZone = (typeof BASE_ZONES)[number];

/** 04 §21 — Screen 05 decides whether Qty 4 becomes 1, 4 or grouped nodes. */
export const QTY_MODELS = ['DECIDE_LATER', 'AGGREGATE', 'INDIVIDUAL', 'GROUPED'] as const;
export type QtyModel = (typeof QTY_MODELS)[number];

export const QTY_MODEL_LABELS: Record<QtyModel, string> = {
  DECIDE_LATER: 'Decide Later',
  AGGREGATE: 'Aggregate',
  INDIVIDUAL: 'Individual',
  GROUPED: 'Grouped',
};

export type ThermalProfileStatus = 'Not Assigned' | 'Draft' | 'Ready' | 'Custom';

// ---------------------------------------------------------------------------

/** 04 §16 — package and contact geometry. */
export interface ComponentGeometry {
  package_L_mm: number | null;
  package_W_mm: number | null;
  package_H_mm: number | null;
  /** Thermal contact footprint; falls back to pad dimensions when absent. */
  contact_L_mm: number | null;
  contact_W_mm: number | null;
  /** Overrides the L × W product when the contact is not rectangular. */
  custom_contact_area_mm2: number | null;
  pad_L_mm: number | null;
  pad_W_mm: number | null;
  board_thickness_mm: number | null;
  coin_thickness_mm: number | null;
  custom_thickness_mm: number | null;
  /**
   * Legacy Height / Thick / Pad values may carry Volume-Tool-specific meaning.
   * 04 §30 forbids silently reinterpreting them, so they are flagged instead.
   */
  needs_review?: boolean;
  legacy_height_mm?: number | null;
}

/** 04 §17 — board path spec. Parameters differ per type; none of it is an edge. */
export interface BoardPathSpec {
  type: BoardType;
  parameters: Record<string, number | string | boolean | null>;
}

/** 04 §18 — TIM can inherit the project default or be overridden per component. */
export interface TimSpec {
  type: TimType;
  inheritance: 'project' | 'component';
  k_W_mK: SourcedValue<number> | null;
  thickness_mm: SourcedValue<number> | null;
  contact_area_mode: 'derived' | 'custom';
  /** Recorded for traceability; not used by the solver. */
  compression_pct?: number | null;
}

export interface ThermalSpec {
  limit_type: LimitType;
  limit_C: SourcedValue<number> | null;
  /** Unknown stays null. 04 §11 / AC-04-06 forbid 0 as "unknown". */
  r_jc_C_per_W: SourcedValue<number> | null;
  /** Reserved by 04 §15; not solved against yet. */
  r_jb_C_per_W?: SourcedValue<number> | null;
  r_ja_C_per_W?: SourcedValue<number> | null;
  package_type: PackageType | null;
  geometry: ComponentGeometry;
  board_path: BoardPathSpec;
  tim: TimSpec;
}

export interface ArchitecturePrep {
  template_preference: ArchitectureTemplate;
  preferred_base_zone: BaseZone;
  qty_model_preference: QtyModel;
  /** Status of Screen 05 readiness, not topology (04 §11). */
  thermal_profile_status: ThermalProfileStatus;
}

export type ImportSourceType = 'ExistingProject' | 'CSV' | 'Excel' | 'Paste' | 'Manual' | 'Library';

export interface ComponentProvenance {
  source_type: ImportSourceType;
  source_project_id: string | null;
  source_project_name: string | null;
  source_file: string | null;
  imported_at: string;
  last_modified_at?: string;
  modified_by?: string | null;
  ref_origin_project?: string | null;
  ref_origin_id?: string | null;
  ref_locked?: boolean | null;
}

export interface Component {
  id: string;
  name: string;
  category: ComponentCategory;
  /** Disabled components keep their data but leave the active dataset (04 §25). */
  enabled: boolean;
  qty: number;
  /** Dissipation of ONE unit, W. */
  power_W: SourcedValue<number>;

  thermal_spec: ThermalSpec;
  architecture_prep: ArchitecturePrep;
  provenance: ComponentProvenance;
  /** Reserved for Screen 03; never parsed here (04 §28.1, §33). */
  external_mappings: ExternalMappings;

  notes?: string;
  /**
   * Fields the source carried that this tool does not model. Preserved verbatim
   * (02 AC-02-14, 04 §30, AC-04-18).
   */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export function emptyGeometry(): ComponentGeometry {
  return {
    package_L_mm: null,
    package_W_mm: null,
    package_H_mm: null,
    contact_L_mm: null,
    contact_W_mm: null,
    custom_contact_area_mm2: null,
    pad_L_mm: null,
    pad_W_mm: null,
    board_thickness_mm: null,
    coin_thickness_mm: null,
    custom_thickness_mm: null,
  };
}

export function emptyBoardPath(): BoardPathSpec {
  return { type: 'None', parameters: {} };
}

export function emptyTim(): TimSpec {
  return {
    type: 'None',
    inheritance: 'project',
    k_W_mK: null,
    thickness_mm: null,
    contact_area_mode: 'derived',
  };
}

export function emptyThermalSpec(): ThermalSpec {
  return {
    limit_type: 'Unknown',
    limit_C: null,
    r_jc_C_per_W: null,
    package_type: null,
    geometry: emptyGeometry(),
    board_path: emptyBoardPath(),
    tim: emptyTim(),
  };
}

export function emptyArchitecturePrep(): ArchitecturePrep {
  return {
    template_preference: 'UNASSIGNED',
    preferred_base_zone: 'Unassigned',
    qty_model_preference: 'DECIDE_LATER',
    thermal_profile_status: 'Not Assigned',
  };
}

export function emptyExternalMappings(): ExternalMappings {
  return { flotherm: { mapping_status: 'unmapped' }, measurement: { mapping_status: 'unmapped' } };
}

export function createComponent(input: {
  id: string;
  name: string;
  category?: ComponentCategory;
  qty?: number;
  power_W?: number | null;
  provenance: ComponentProvenance;
}): Component {
  return {
    id: input.id,
    name: input.name,
    category: input.category ?? 'Other',
    enabled: true,
    qty: input.qty ?? 1,
    power_W:
      input.power_W == null ? unknownValue<number>('Manual') : sourced(input.power_W, 'Manual'),
    thermal_spec: emptyThermalSpec(),
    architecture_prep: emptyArchitecturePrep(),
    provenance: input.provenance,
    external_mappings: emptyExternalMappings(),
  };
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export function powerWOf(component: Component): number {
  return valueOf(component.power_W) ?? 0;
}

/**
 * Component dissipation summary, W.
 *
 * 02 §19 / 04 §11 / §40: Qty × Power is a REPORTING summary. It is NOT the heat
 * flow Q through any thermal edge — edge heat flow only exists after the solver
 * runs on a real topology, and a component's dissipation may split across paths.
 */
export function componentTotalPowerW(component: Component): number {
  return (component.qty || 0) * powerWOf(component);
}

/** Sums only enabled components — disabled ones are excluded from the project. */
export function totalPowerW(components: Component[]): number {
  return components.filter((c) => c.enabled).reduce((sum, c) => sum + componentTotalPowerW(c), 0);
}

export function isHeatSource(component: Component): boolean {
  return powerWOf(component) > 0;
}

/** Contact area, mm² — custom override wins, else contact L×W, else pad L×W. */
export function contactAreaMm2(geometry: ComponentGeometry): number | null {
  if (geometry.custom_contact_area_mm2 != null) return geometry.custom_contact_area_mm2;
  if (geometry.contact_L_mm != null && geometry.contact_W_mm != null) {
    return geometry.contact_L_mm * geometry.contact_W_mm;
  }
  if (geometry.pad_L_mm != null && geometry.pad_W_mm != null) {
    return geometry.pad_L_mm * geometry.pad_W_mm;
  }
  return null;
}
