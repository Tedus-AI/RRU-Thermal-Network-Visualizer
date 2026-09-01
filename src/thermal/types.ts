import type { EdgeRthSet, ExternalMappings, TemperatureResultSet } from './resultValue';
import type { RevisionId } from '@/domain/revision';
// Type-only, so this does not create a runtime cycle with the component model.
import type { LimitType } from '@/domain/component';

/**
 * Thermal Graph data model.
 *
 * Source of truth: 00_Product_Vision_and_Architecture.md §6–§11, §16–§18, §21.
 *
 * The whole product is built on a GENERAL Node + Edge graph. Nothing in this file
 * may assume a fixed path (Junction -> Case -> TIM -> HSK -> Ambient), a tree
 * topology, or a specific component type (PA / FPGA / DDR). Series, parallel,
 * branch, merge and shared nodes must all be representable (Rule 5).
 */

// ---------------------------------------------------------------------------
// Provenance — 00 §16, §17, Rule 3
// ---------------------------------------------------------------------------

/** Where a thermal number came from. Every Rth must carry one. */
export const DATA_SOURCES = [
  'Analytical',
  'Datasheet',
  'FloTHERM',
  'Measurement',
  'Vendor',
  'Manual',
  'Assumed',
  /** Carried in from another project or file whose upstream source is unstated. */
  'Imported',
  /** Default carried from the reusable component library. */
  'Library',
] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

/**
 * The sources a person picks, as opposed to the ones the app assigns.
 *
 * In practice a component number came from a datasheet, from the vendor, from
 * the EE/RF team's own dissipation calculation, or from a bench measurement —
 * and sometimes it is frankly a guess. Those five are the whole vocabulary an
 * engineer needs, so those five are what the picker offers.
 *
 * `Imported`, `Library` and `Manual` are stamped by the importer, the library
 * and a bare keystroke; `FloTHERM` waits on Screen 03, which is deferred and
 * produces nothing yet. All four remain valid values — a stored one is always
 * shown — they are simply not things to choose.
 */
export const SELECTABLE_DATA_SOURCES = [
  'Datasheet',
  'Vendor',
  'Analytical',
  'Measurement',
  'Assumed',
] as const satisfies readonly DataSource[];

export const DATA_SOURCE_LABELS: Record<DataSource, { en: string; zh: string }> = {
  Datasheet: { en: 'Datasheet', zh: '規格書' },
  Vendor: { en: 'Vendor', zh: '原廠提供' },
  Analytical: { en: 'Calculated (EE/RF)', zh: 'EE/RF 計算' },
  Measurement: { en: 'Measured', zh: '實測' },
  Assumed: { en: 'Assumed', zh: '推定值' },
  Manual: { en: 'Typed in', zh: '手動輸入' },
  Imported: { en: 'Imported', zh: '匯入' },
  Library: { en: 'Library', zh: '元件庫' },
  FloTHERM: { en: 'FloTHERM', zh: 'FloTHERM' },
};

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export interface Provenance {
  source: DataSource;
  /** Free-text pointer to the evidence: datasheet rev, CFD run id, test report. */
  reference?: string;
  /** Scenario the value was extracted under, when it is scenario-specific. */
  scenario_id?: string;
  timestamp?: string;
  confidence: Confidence;
}

// ---------------------------------------------------------------------------
// Node — 00 §7, §9
// ---------------------------------------------------------------------------

export const NODE_TYPES = [
  'junction',
  'die',
  'case',
  'lid',
  'epad',
  'pcb',
  'thermal_via',
  'copper_coin',
  'tim_interface',
  'solder_interface',
  'pedestal',
  'small_base',
  'base_zone',
  'housing',
  'heat_pipe_evaporator',
  'heat_pipe_condenser',
  'vapor_chamber',
  'heat_sink_base',
  'fin_surface',
  'ambient',
  'custom',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/**
 * Node types that were offered, meant nothing, and are gone.
 *
 * The list was written before the templates and the shared structure existed,
 * so it accumulated names that nothing ever produced. Five were removed once
 * that was checked against every template, the structure presets and the demo:
 *
 *   main_base, fin_root  → heat_sink_base. The shared structure's own node is
 *     named "HSK Base / Fin Root" and typed `heat_sink_base`; these two were
 *     the same physical thing under the names it had before the HSK rename
 *     (the same rename `LEGACY_ZONE_KEYS` already handles for zone keys).
 *   external_air → ambient. Every switch in the codebase listed the two
 *     together and treated them identically — solver boundary, validation,
 *     dataset. A second name for the same node.
 *   heat_source → junction. Nothing decides heat-source-ness by this type;
 *     `power_W > 0` is the test everywhere. Offering it invited someone to
 *     believe selecting it declared something. It did not.
 *   internal_air → ambient. Zero references in the whole codebase, not even a
 *     colour in the graph stylesheet.
 *
 * A stored project can still contain any of them, because the Node Inspector
 * offered the full list — so `normalizeNodeType` runs on load rather than the
 * old values being left to fail a type check that only exists at compile time.
 */
export const LEGACY_NODE_TYPES: Record<string, NodeType> = {
  main_base: 'heat_sink_base',
  fin_root: 'heat_sink_base',
  external_air: 'ambient',
  internal_air: 'ambient',
  heat_source: 'junction',
};

/**
 * What each node type is FOR, in the words a picker needs.
 *
 * The list is twenty entries long and several of them look alike at a glance —
 * pedestal and small base, base zone and heat sink base, die and junction. The
 * distinction is real in every case but it is not guessable from the name, so
 * it is written down once here and shown on the option itself.
 *
 * Each line says what the thing IS and, where a neighbouring type is the likely
 * confusion, how to tell them apart.
 */
export const NODE_TYPE_HINTS: Record<NodeType, { en: string; zh: string }> = {
  junction: {
    en: 'Silicon junction inside a package. The heat source for any part that has a case or a lid.',
    zh: '封裝內部的矽接面。有外殼或上蓋的元件，熱源就是它。',
  },
  die: {
    en: 'Bare silicon, no package. Use this instead of Junction when the TIM touches the die face itself.',
    zh: '裸矽晶，沒有封裝。TIM 直接貼在晶粒表面時用它，取代 Junction。',
  },
  case: {
    en: 'Package outer body — the far end of Rjc.',
    zh: '封裝外殼本體，Rjc 的另一端。',
  },
  lid: {
    en: 'Integrated heat spreader on top of a package. Top-cooled parts only.',
    zh: '封裝上方的整合式散熱蓋，僅用於上方散熱的元件。',
  },
  epad: {
    en: 'Exposed thermal pad on the underside of a package, soldered to the board.',
    zh: '封裝底面外露的散熱墊，焊接在板子上。',
  },
  pcb: {
    en: 'The board itself, as a conduction layer. Not needed when the via field is already modelled as an edge.',
    zh: '板子本身當作導熱層。導熱孔已用「連線」模型化時就不需要它。',
  },
  thermal_via: {
    en: 'The via field under a pad, taken as one node.',
    zh: '銲墊下方的導熱孔陣列，視為單一節點。',
  },
  copper_coin: {
    en: 'Solid copper slug pressed through the board.',
    zh: '壓入板中的實心銅塊。',
  },
  tim_interface: {
    en: 'The far face of a thermal interface material.',
    zh: '熱介面材料的另一面。',
  },
  solder_interface: {
    en: 'A reflowed solder joint.',
    zh: '迴銲後的焊點。',
  },
  pedestal: {
    en: 'A boss standing up from the heat sink to reach a part it would otherwise not touch. Its HEIGHT is a conduction length.',
    zh: '散熱器上為了搆到元件而長出的凸台。它的「高度」就是導熱長度。',
  },
  small_base: {
    en: 'A local base plate one part sits on, usually feeding a heat pipe. Belongs to the component, unlike Base Zone.',
    zh: '單一元件所在的局部基座，通常再接熱管。與 Base Zone 不同，它屬於該元件。',
  },
  base_zone: {
    en: 'A shared area of structure that several components feed into. Belongs to no single component.',
    zh: '多個元件共同匯入的結構區域，不屬於任何單一元件。',
  },
  housing: {
    en: "A component's own metal body — a module baseplate, an RF flange — or a chassis wall.",
    zh: '元件自己的金屬本體（模組底板、RF 法蘭）或機殼壁。',
  },
  heat_pipe_evaporator: {
    en: 'Hot end of a heat pipe, where the working fluid boils.',
    zh: '熱管蒸發端（熱端），工作流體在此汽化。',
  },
  heat_pipe_condenser: {
    en: 'Cold end of a heat pipe, where the vapour condenses.',
    zh: '熱管冷凝端（冷端），蒸氣在此凝結。',
  },
  vapor_chamber: {
    en: 'A flat two-phase plate that spreads heat sideways before it reaches the base. Its resistance is a vendor number, not a geometry — and its worth is the footprint it hands the base, so one no bigger than the part only adds resistance.',
    zh: '扁平兩相均熱板，在熱進入底座前先橫向攤開。其熱阻是廠商數據而非幾何推導；價值在於交給底座的面積，若沒有比元件大就只是徒增熱阻。',
  },
  heat_sink_base: {
    en: 'The main heat sink base, which is also the fin root. Where the shared structure begins.',
    zh: '散熱器主底座，同時是鰭片根部。共用結構由此開始。',
  },
  fin_surface: {
    en: 'The fin area that meets the air.',
    zh: '與空氣接觸的鰭片表面。',
  },
  ambient: {
    en: 'The air the model ends at. Its temperature comes from the Screen 06 scenario.',
    zh: '模型終點的空氣。溫度來自 Screen 06 的情境設定。',
  },
  custom: {
    en: 'Anything this list does not name — a busbar, a cable, a chassis loss. The only type that both looks structural and still accepts a source power.',
    zh: '清單未涵蓋的東西：匯流排、線材、機構損耗。也是唯一「看起來像結構、卻仍可輸入功耗」的類型。',
  },
};

export function normalizeNodeType(value: unknown): NodeType {
  if (typeof value !== 'string') return 'custom';
  if ((NODE_TYPES as readonly string[]).includes(value)) return value as NodeType;
  return LEGACY_NODE_TYPES[value] ?? 'custom';
}

export type NodeCategory = 'RF' | 'DIGITAL' | 'POWER' | 'FILTER' | 'MECH' | 'ENV';

/** A node either floats (solved) or is pinned to a temperature (boundary). */
export type BoundaryType = 'fixed_temperature' | null;

export interface ThermalNode {
  id: string;
  name: string;
  type: NodeType;
  category?: NodeCategory;

  /** Link back to the component record owned by the component store. */
  component_ref?: string;
  zone?: string;

  /** Dissipation injected at this node, W. 0 for passive nodes. */
  power_W: number;

  /** Solver output — never authored by hand, cleared whenever results go DIRTY. */
  temperature_C: number | null;
  temperature_source: DataSource | null;
  /**
   * Analytical / FloTHERM / measured temperatures side by side (04 §28.3).
   * Reserved now so Screen 03 needs no refactor; an imported result must never
   * overwrite the analytical one (04 §28.5).
   */
  temperature_results?: TemperatureResultSet;

  limit_C?: number | null;
  limit_type?: LimitType | null;

  boundary_type: BoundaryType;
  fixed_temperature_C?: number | null;
  /**
   * A placeholder is structural only: Screen 05 knows the path ends here, but the
   * ambient temperature, h and radiation belong to Screen 06 (05 §15).
   */
  boundary_role?: 'placeholder' | 'configured';

  /** Base zone this node belongs to, when it is part of the shared structure. */
  zone_id?: string | null;
  /**
   * Template connection points exposed by a component subgraph (05 §10).
   * Templates never hard-code a Main Base — Step 4 connects a port to a zone.
   */
  ports?: ThermalPort[];

  /** FloTHERM object path this node maps to — 00 §20. */
  simulation_alias?: string | null;
  /** External simulation mapping hooks carried over from the component (04 §28.1). */
  external_mappings?: ExternalMappings;

  /**
   * A disabled node keeps its data but leaves the active network (05 §51).
   * Its edges are disabled with it, so the solver never sees a dangling source.
   */
  disabled?: boolean;

  position?: { x: number; y: number };
  /** Where this object came from — template generation or a manual edit (05 §39). */
  origin?: GraphObjectOrigin;
  metadata?: Record<string, unknown>;
}

/** Named connection point on a component subgraph — 05 §10, §32. */
export const PORT_KINDS = [
  'HEAT_OUT',
  'BOARD_OUT',
  'TOP_OUT',
  'HEAT_PIPE_OUT',
  'DIRECT_BASE_OUT',
] as const;
export type PortKind = (typeof PORT_KINDS)[number];

export interface ThermalPort {
  kind: PortKind;
  /** A required port left unconnected is a blocking error (05 §33). */
  required: boolean;
  /** Shared-structure node this port is wired to, or null while unconnected. */
  connected_to: string | null;
}

/**
 * 05 §39, §40 — template-generated objects are traceable and a rebuild must never
 * silently discard something a person edited by hand.
 */
export interface GraphObjectOrigin {
  kind: 'template' | 'manual' | 'shared_structure';
  template_id?: string;
  template_version?: string;
  component_id?: string;
  /** True once a human edited a template-generated object. */
  modified?: boolean;
}

// ---------------------------------------------------------------------------
// Edge — 00 §8, §10, §21
// ---------------------------------------------------------------------------

export const EDGE_TYPES = [
  'package_rjc',
  'package_rjb',
  'package_rja',
  'conduction',
  'tim',
  'solder',
  'thermal_via',
  'contact',
  'spreading',
  'heat_pipe',
  'convection',
  'radiation',
  'custom',
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

/** How the Rth number is produced. */
export type EdgeMethod =
  | 'direct_rth'
  | 'conduction_LkA'
  | 'tim_thickness_k'
  | 'solder_voiding'
  | 'via_array'
  | 'contact_area'
  /** Bare metal-to-metal joint: R = 1 / (h_c · A). No TIM in the gap. */
  | 'contact_hc'
  /**
   * Heat entering a plate through a patch smaller than the plate: the
   * one-dimensional drop through the thickness AND the sideways fan-out, from
   * the Lee/Song/Au/Moran disc correlation. Not interchangeable with
   * `conduction_LkA` — see `resistance/spreading.ts`.
   */
  | 'spreading_disc'
  | 'convection_hA'
  | 'radiation_hA'
  | 'imported';

/**
 * Rth is a multi-source value object, NOT a scalar.
 *
 * 00 §21 / Rule 9: analytical, CFD and measured resistances coexist so the tool can
 * compare them. Importing FloTHERM must never destroy the analytical number — it
 * writes its own slot and (optionally) moves `active_source`.
 */
export interface RthValue {
  analytical: number | null;
  flotherm: number | null;
  measurement: number | null;
  /** Hand-entered override, kept separate from every derived value (04 §28.4). */
  manual: number | null;
  /** Which slot the solver reads. */
  active_source: DataSource;
  /** Provenance per slot, keyed by the source that produced it. */
  provenance: Partial<Record<DataSource, Provenance>>;
  /**
   * Richer per-source results reserved for Screen 03 (04 §28.4). The scalar
   * slots above stay the solver's fast path; this carries scenario, reference
   * and confidence for each source once CFD data arrives.
   */
  results?: EdgeRthSet;
}

/**
 * Why an edge resistance could not be trusted as a true segment Rth.
 *
 * 00 §18 / Rule 4: deriving R from ΔT without knowing the heat flow through THAT
 * segment is forbidden. When Q is unknown the value must be degraded and labelled,
 * never presented as a resolved FloTHERM segment resistance.
 */
export type ResolutionState = 'resolved' | 'unresolved' | 'estimated' | 'effective_path_only';

export interface ThermalEdge {
  id: string;
  from: string;
  to: string;

  type: EdgeType;
  method: EdgeMethod;

  rth: RthValue;

  /** Geometry / material inputs for the calculator that produced `rth.analytical`. */
  parameters?: Record<string, number | string | boolean | null>;

  /** Solver output. */
  heat_flow_W: number | null;
  delta_T_C: number | null;

  resolution: ResolutionState;
  /** Human-readable reason when resolution !== 'resolved'. */
  resolution_note?: string;

  /** Per-scenario Rth overrides — 00 §34. Topology is never duplicated per scenario. */
  scenario_overrides?: Record<string, { R_C_per_W?: number; enabled?: boolean }>;

  enabled: boolean;
  confidence?: Confidence;
  /** Reserved for Screen 03; interface aliases are never parsed here (05 §1). */
  external_mappings?: ExternalMappings;
  origin?: GraphObjectOrigin;
  /**
   * Parameters that follow a component field instead of being typed here (05 §28).
   * Key is the edge parameter, value is the component field it tracks.
   */
  parameter_links?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export type NetworkMode = 'analytical' | 'flotherm' | 'hybrid';

export interface FlothermMapping {
  scenario_id: string;
  flotherm_object: string;
  thermal_node_id: string;
  temperature_type: 'average' | 'max' | 'min' | 'point';
  confidence: Confidence;
}

export interface SolverSettings {
  /** Energy-balance thresholds in %, 00 §14. Configurable in Settings. */
  energy_warn_pct: number;
  energy_error_pct: number;
  max_iterations: number;
  tolerance: number;
}

export const DEFAULT_SOLVER_SETTINGS: SolverSettings = {
  energy_warn_pct: 0.5,
  energy_error_pct: 2.0,
  max_iterations: 200,
  tolerance: 1e-9,
};

/** 05 §37. */
export const NETWORK_STATUSES = [
  'EMPTY',
  'DRAFT',
  'NEEDS_REVIEW',
  'VALID',
  'DIRTY',
  'READ_ONLY',
] as const;
export type NetworkStatus = (typeof NETWORK_STATUSES)[number];

/** A shared-structure zone — 05 §42. */
export interface BaseZone {
  id: string;
  name: string;
  type: NodeType;
  linked_hsk?: string | null;
  notes?: string;
}

/** Which template built a component's subgraph, and how — 05 §46. */
export interface ComponentTemplateBinding {
  component_id: string;
  template_id: string;
  template_version: string;
  qty_model: 'AGGREGATE' | 'INDIVIDUAL' | 'GROUPED';
  /** Instance keys this binding generated, e.g. ["PA1","PA2"]. */
  instances: string[];
  applied_at: string;
}

export interface ThermalNetwork {
  schema_version: string;
  project_id: string;
  /**
   * Engineering graph revision; layout-only moves do not advance it. Optional
   * only for legacy object literals; emptyNetwork/loadNetwork always supply it.
   */
  revision?: RevisionId;
  network_name: string;
  mode: NetworkMode;
  status: NetworkStatus;
  nodes: Record<string, ThermalNode>;
  edges: Record<string, ThermalEdge>;
  templates: Record<string, ComponentTemplateBinding>;
  zones: Record<string, BaseZone>;
  layout: {
    mode: string;
    positions: Record<string, { x: number; y: number }>;
    /**
     * True once the engineer has dragged a node into place themselves.
     *
     * From then on the canvas stops re-spacing the graph on its own, and Auto
     * Layout hands the arrangement back to the tool by clearing it.
     */
    hand_placed?: boolean;
  };
  flotherm_mappings: Record<string, FlothermMapping>;
  solver_settings: SolverSettings;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Solver lifecycle — 00 §13, Rule 6
// ---------------------------------------------------------------------------

export const SOLVER_STATES = ['READY', 'DIRTY', 'SOLVING', 'SOLVED', 'WARNING', 'FAILED'] as const;
export type SolverState = (typeof SOLVER_STATES)[number];

/** Every mutation that must invalidate a previous solve. */
export type DirtyReason =
  | 'component_power_changed'
  | 'component_rth_changed'
  | 'component_tim_changed'
  | 'component_qty_changed'
  | 'component_geometry_changed'
  | 'component_architecture_changed'
  | 'component_enabled_changed'
  | 'component_identity_changed'
  | 'component_physics_changed'
  | 'source_revision_changed'
  | 'node_power_changed'
  | 'edge_rth_changed'
  | 'boundary_changed'
  | 'scenario_changed'
  | 'edge_enabled_changed'
  | 'topology_changed'
  | 'solver_settings_changed';
