/**
 * The whole component spec, carried through an existing-project import.
 *
 * Screen 02's pipeline is a TABLE: eighteen named columns, mapped, normalized,
 * validated and reviewed. That is exactly right for a spreadsheet, where the
 * columns are all there is. It is wrong for a project copied out of this tool,
 * because the component model has grown well past what eighteen columns can
 * hold, and every field without a column was silently reconstructed by guessing
 * — or lost.
 *
 * What an existing-project import dropped, measured against a real save:
 *
 *   - `mount` entirely — type, contact size, pipe count, vendor Rth, attachment
 *   - `limit_type` and `limit_type_confirmed`, re-guessed by `inferLimitType`
 *   - `limit_reference_note`
 *   - `heat_path.parameters` and `heat_path_confirmed`
 *   - `tim.measured_rth_C_per_W` and `tim.contact_area_mode`
 *   - `architecture_prep`, including `preferred_base_zone`
 *   - `enabled`, `notes`, `geometry.needs_review`
 *
 * The visible damage was worse than the missing data. A body-sourced part came
 * back with its heat path intact but its limit type re-guessed to `Tj`, and the
 * two contradict: Screen 02 then showed a red ERROR the source project never
 * had, manufactured entirely by the importer's own loss.
 *
 * Rather than grow eighteen columns into thirty-five — which would have to grow
 * again with the next field — the source carries ONE extra column holding the
 * component's canonical spec as JSON. It rides along unmapped, exactly as the
 * `_ref_origin_*` lineage columns already do (02 §6), so the pipeline is
 * unchanged: the same mapping, the same validation, the same review table.
 *
 * The mapped columns stay authoritative for everything they cover, because
 * those are the values the engineer sees and can edit in the review step. The
 * carried spec fills in only what NO column can state. So editing Power in the
 * staging table still wins, and a mount still arrives.
 *
 * A spreadsheet, a paste or a CSV carries no such column, and nothing about
 * their path changes.
 */

import {
  emptyMount,
  mountSpec,
  type ArchitecturePrep,
  type Component,
  type ThermalSpec,
} from '@/domain/component';
import { DIRECT_CONTACT_TIM_ID } from '@/domain/materials';

/** The column name. Underscore-prefixed, so `autoMapColumns` never claims it. */
export const CARRIED_SPEC_COLUMN = '_ref_spec';

/**
 * What one component carries beyond the table's columns.
 *
 * Deliberately NOT the whole `Component`: id, name, category, qty and power all
 * have columns, and duplicating them here would let the table and the payload
 * disagree about the very fields the engineer just reviewed.
 */
export interface CarriedSpec {
  /** Version of this payload's shape, so an older file can be recognised. */
  v: 1;
  thermal_spec: ThermalSpec;
  architecture_prep: ArchitecturePrep;
  enabled: boolean;
  notes?: string;
}

export function encodeCarriedSpec(component: Component): string {
  const payload: CarriedSpec = {
    v: 1,
    thermal_spec: component.thermal_spec,
    architecture_prep: component.architecture_prep,
    enabled: component.enabled,
    ...(component.notes ? { notes: component.notes } : {}),
  };
  return JSON.stringify(payload);
}

/**
 * Reads the payload back, or null for anything that is not one.
 *
 * Null for a spreadsheet row (no column), for a payload from a future version,
 * and for text that does not parse — in every case the importer falls back to
 * the column-and-inference path it has always used, which is still correct for
 * the fields that do have columns.
 */
export function decodeCarriedSpec(raw: unknown): CarriedSpec | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed == null || typeof parsed !== 'object') return null;
  const payload = parsed as Partial<CarriedSpec>;
  if (payload.v !== 1) return null;
  if (payload.thermal_spec == null || typeof payload.thermal_spec !== 'object') return null;
  return {
    v: 1,
    thermal_spec: payload.thermal_spec as ThermalSpec,
    architecture_prep: payload.architecture_prep as ArchitecturePrep,
    enabled: payload.enabled !== false,
    ...(typeof payload.notes === 'string' ? { notes: payload.notes } : {}),
  };
}

/**
 * The fields the carried spec owns, laid over a spec the columns built.
 *
 * The split is the rule stated in this file's header, applied field by field:
 * anything a column can state is left to the column, and anything no column can
 * state comes from here. `limit_C`, `r_jc`, `package_type`, the geometry and
 * the TIM material are all mapped, so they stay as the review table left them.
 *
 * The geometry is the one composite: only `needs_review` comes across, because
 * every dimension has its own column and the heat path decides which of them
 * the source face lands in — a decision `geometryFaces` has already made on the
 * reviewed values.
 */
export function applyCarriedSpec(built: ThermalSpec, carried: CarriedSpec): ThermalSpec {
  const spec = carried.thermal_spec;
  return {
    ...built,
    limit_type: spec.limit_type ?? built.limit_type,
    limit_type_confirmed: spec.limit_type_confirmed ?? false,
    limit_reference_note: spec.limit_reference_note ?? '',
    heat_path: {
      // The TYPE has a column and may have been re-mapped in review; the
      // parameters have none and would otherwise be lost with it.
      type: built.heat_path.type,
      parameters:
        spec.heat_path?.type === built.heat_path.type ? (spec.heat_path.parameters ?? {}) : {},
    },
    heat_path_confirmed:
      spec.heat_path?.type === built.heat_path.type ? (spec.heat_path_confirmed ?? false) : false,
    geometry: {
      ...built.geometry,
      // The source stated its geometry deliberately; it is not a legacy
      // Volume-Tool column needing a second look.
      needs_review: spec.geometry?.needs_review,
    },
    tim: {
      ...built.tim,
      // The MATERIAL still comes from the column, matched by name against the
      // target project's own library — a project owns its materials, and a
      // source's id means nothing outside it.
      //
      // "Direct contact" is the exception, because it is not a material: it is
      // the stated absence of one, and it means metal on metal in every project
      // there is. It has no name to export, so it came back as "no TIM stated"
      // — turning a decision the engineer had made into a warning that the
      // interface resistance cannot be computed, when Screen 01's bare contact
      // conductance computes it exactly.
      tim_id:
        built.tim.tim_id ??
        (spec.tim?.tim_id === DIRECT_CONTACT_TIM_ID ? DIRECT_CONTACT_TIM_ID : null),
      measured_rth_C_per_W: spec.tim?.measured_rth_C_per_W ?? null,
      contact_area_mode: spec.tim?.contact_area_mode ?? 'derived',
    },
    // The whole mount: no column describes any part of it, so without this a
    // two-pipe embedded mount arrives as a Direct one and the part loses the
    // route most of its heat actually takes.
    mount: spec.mount ? mountSpec(spec) : emptyMount(),
  };
}

/**
 * Architecture prep as it should arrive in the new project.
 *
 * 02 §34 / 04 §40 keep importing out of the graph, and that still holds: none
 * of this creates a node or an edge. These are PREFERENCES — which template to
 * build from, which base zone the part belongs to, how quantity is modelled —
 * and copying a project within the same product is exactly when they carry.
 *
 * `thermal_profile_status` is the exception, and it is not a preference: it is
 * Screen 05's own readiness for a graph the new project has not built yet.
 * Carrying it would claim a part was wired up when nothing is, so it resets.
 */
export function carriedArchitecturePrep(
  built: ArchitecturePrep,
  carried: CarriedSpec,
): ArchitecturePrep {
  const prep = carried.architecture_prep;
  if (prep == null) return built;
  return {
    ...built,
    template_preference: prep.template_preference ?? built.template_preference,
    preferred_base_zone: prep.preferred_base_zone ?? built.preferred_base_zone,
    qty_model_preference: prep.qty_model_preference ?? built.qty_model_preference,
    thermal_profile_status: built.thermal_profile_status,
  };
}
