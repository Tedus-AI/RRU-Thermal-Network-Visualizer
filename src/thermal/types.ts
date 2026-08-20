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
  'heat_source',
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
  'main_base',
  'base_zone',
  'housing',
  'heat_pipe_evaporator',
  'heat_pipe_condenser',
  'heat_sink_base',
  'fin_root',
  'fin_surface',
  'internal_air',
  'external_air',
  'ambient',
  'custom',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

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
  layout: { mode: string; positions: Record<string, { x: number; y: number }> };
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
