/**
 * The link between a component imported from AI-Thermal and its record there.
 *
 * AI-Thermal (with 5G-RRU) owns most of what describes a part: how many there
 * are, what each dissipates, its limit and whether that is a Tj or a Tc, its
 * Rjc, the path heat leaves by, the body and E-PAD sizes, the board thickness,
 * the TIM, and the via design's effective k. Screen 02 imports them; from then
 * on they are AI-Thermal's numbers, shown in 04 as references with a ✂ to take
 * one over, and brought up to date by 04's 「從 AI-Thermal 更新」. What this
 * tool owns — the package type, the mount, the spreading domain, the
 * measurement location of a body source, the modelling preferences — stays
 * editable as before.
 *
 * The link lives on the component's provenance (`provenance.ai_link`), so it
 * travels with the component through saves, copies and exports:
 *
 *   project_id   AI-Thermal project id (also `source_project_id`)
 *   cid          AI-Thermal component id (`_cid`, also `ref_origin_id`): a part
 *                renamed in AI-Thermal still matches
 *   synced_at    when the values below were taken (import or last update)
 *   saved_at     AI-Thermal's own last-save stamp for the project at that time
 *   values       AI-Thermal's value for each field it SUPPLIED, as taken. A field
 *                AI-Thermal left empty is not here: it is this tool's to fill,
 *                so it is not locked.
 *   unlocked     fields the engineer took over with ✂ (no longer locked, and an
 *                update leaves them unticked by default)
 *
 * Pure functions only; the screens and the importer call them.
 */

import { HEAT_PATH_LABELS, heatPathPatch, type Component, type HeatPathType, type LimitType } from './component';
import { withValue } from './sourcedValue';

/** The fields AI-Thermal owns, in the order the update dialog lists them. */
export const AI_FIELDS = [
  'name',
  'qty',
  'power',
  'limit',
  'limit_type',
  'rjc',
  'heat_path',
  'package',
  'source_face',
  'board_thickness',
  'tim',
  'via',
] as const;
export type AiField = (typeof AI_FIELDS)[number];

/** `name` is kept up to date by an update but never locked: a local name is harmless. */
export const AI_LOCKABLE: ReadonlySet<AiField> = new Set(AI_FIELDS.filter((field) => field !== 'name'));

export const AI_FIELD_LABEL: Record<AiField, string> = {
  name: '名稱',
  qty: '數量',
  power: '單顆功耗',
  limit: '限溫',
  limit_type: '限溫對象',
  rjc: 'Rjc',
  heat_path: '散熱路徑',
  package: '本體大小',
  source_face: 'E-PAD',
  board_thickness: '板厚',
  tim: 'TIM',
  via: '導熱孔等效 k',
};

/** A field's value in a form the diff can compare and the writer can put back. */
export type AiValue =
  | string
  | number
  | null
  | { body: boolean; rjc: number | null }
  | { L: number | null; W: number | null; H?: number | null }
  | { id: string | null; blt: number | null }
  | { k: number | null; eff: number | null };

export interface AiThermalLink {
  project_id: string;
  cid: string | null;
  synced_at: string;
  saved_at?: string | null;
  values: Partial<Record<AiField, AiValue>>;
  unlocked?: AiField[];
}

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function aiLinkOf(component: Component): AiThermalLink | null {
  const link: unknown = component.provenance.ai_link;
  return link && typeof link === 'object' && !Array.isArray(link) ? (link as AiThermalLink) : null;
}

/**
 * Imported from AI-Thermal before imports recorded a link: the provenance says
 * which AI-Thermal project it came from, but not what AI-Thermal's values were
 * then. 「從 AI-Thermal 更新」 links it the first time, field by field.
 * One whose link was dropped on purpose (`ai_unlinked`) is not one of these.
 */
export function isAiFirstLink(component: Component): boolean {
  const p = component.provenance;
  return !aiLinkOf(component) && !p.ai_unlinked && p.source_type === 'AIThermal' && !!p.source_project_id;
}

/** The AI-Thermal project a component belongs to — linked, or waiting for its first link. */
export function aiProjectOf(component: Component): string | null {
  return aiLinkOf(component)?.project_id ?? (isAiFirstLink(component) ? component.provenance.source_project_id! : null);
}

/** A field's current value on the component. */
export function aiValueOf(component: Component, field: AiField): AiValue {
  const spec = component.thermal_spec;
  const g = spec.geometry;
  const params = spec.heat_path.parameters ?? {};
  switch (field) {
    case 'name':
      return component.name;
    case 'qty':
      return component.qty;
    case 'power':
      return component.power_W.value ?? null;
    case 'limit':
      return spec.limit_C?.value ?? null;
    case 'limit_type':
      return spec.limit_type;
    case 'rjc':
      return { body: params.source_model === 'SurfaceBodyBased', rjc: spec.r_jc_C_per_W?.value ?? null };
    case 'heat_path':
      return spec.heat_path.type;
    case 'package':
      return { L: g.package_L_mm ?? null, W: g.package_W_mm ?? null, H: g.package_H_mm ?? null };
    case 'source_face':
      return { L: g.source_L_mm ?? null, W: g.source_W_mm ?? null };
    case 'board_thickness':
      return g.board_thickness_mm ?? null;
    case 'tim':
      return { id: spec.tim.tim_id ?? null, blt: spec.tim.blt_mm?.value ?? null };
    case 'via':
      return { k: num(params.via_effective_k_W_mK), eff: num(params.via_efficiency) };
  }
}

/** Whether AI-Thermal stated anything for this field (an empty one is this tool's to fill). */
function supplied(component: Component, field: AiField): boolean {
  const value = aiValueOf(component, field);
  switch (field) {
    case 'heat_path':
      return component.thermal_spec.heat_path_confirmed;
    case 'rjc': {
      const v = value as { body: boolean; rjc: number | null };
      return v.body || v.rjc != null;
    }
    // Both sides or nothing: half a size locked would leave the other half
    // impossible to fill in here.
    case 'package':
    case 'source_face': {
      const v = value as { L: number | null; W: number | null };
      return v.L != null && v.W != null;
    }
    case 'tim':
      return (value as { id: string | null }).id != null;
    case 'via':
      return (value as { k: number | null }).k != null;
    default:
      return value != null && value !== '';
  }
}

export function sameAiValue(a: AiValue | undefined, b: AiValue | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** The link for a component just built from an AI-Thermal record. */
export function buildAiLink(
  fresh: Component,
  projectId: string,
  savedAt: string | null,
  previous?: AiThermalLink | null,
): AiThermalLink {
  const values: Partial<Record<AiField, AiValue>> = {};
  for (const field of AI_FIELDS) {
    if (supplied(fresh, field)) values[field] = aiValueOf(fresh, field);
  }
  return {
    project_id: projectId,
    cid: fresh.provenance.ref_origin_id ?? null,
    synced_at: new Date().toISOString(),
    saved_at: savedAt,
    values,
    // A re-import of the same project keeps what the engineer took over.
    ...(previous?.project_id === projectId && previous.unlocked?.length ? { unlocked: previous.unlocked } : {}),
  };
}

/** Locked: AI-Thermal supplied it and nobody took it over. */
export function isAiLocked(component: Component, field: AiField): boolean {
  if (!AI_LOCKABLE.has(field)) return false;
  const link = aiLinkOf(component);
  if (!link || !(field in link.values)) return false;
  return !(link.unlocked ?? []).includes(field);
}

/**
 * The locked fields a patch would change.
 *
 * Compared by value, not by the editor's field names, so it holds for every
 * way 04 can write a component — an inline cell, an inspector card, a bulk
 * edit — including one added later.
 */
export function aiLockedChanges(component: Component, patch: Partial<Component>): AiField[] {
  const after = { ...component, ...patch };
  return AI_FIELDS.filter(
    (field) =>
      isAiLocked(component, field) && !sameAiValue(aiValueOf(component, field), aiValueOf(after, field)),
  );
}

/** Screen 04's patch field names a write of each field touches, for the invalidation matrix. */
export const AI_PATCH_FIELDS: Record<AiField, string[]> = {
  name: ['name'],
  qty: ['qty'],
  power: ['power_W'],
  limit: ['limit_C'],
  limit_type: ['limit_type'],
  rjc: ['r_jc_C_per_W', 'heat_path.parameters.source_model'],
  heat_path: ['heat_path.type', 'architecture_prep'],
  package: ['geometry'],
  source_face: ['geometry'],
  board_thickness: ['geometry'],
  tim: ['tim'],
  via: ['heat_path.parameters.via_effective_k_W_mK'],
};

function withLink(component: Component, link: AiThermalLink): Component {
  return { ...component, provenance: { ...component.provenance, ai_link: link } };
}

/** ✂ — the engineer takes the field over; it stops being locked. */
export function unlockAiField(component: Component, field: AiField): Component {
  const link = aiLinkOf(component);
  if (!link) return component;
  const unlocked = new Set(link.unlocked ?? []);
  unlocked.add(field);
  return withLink(component, { ...link, unlocked: [...unlocked] });
}

/** ↺ — back to AI-Thermal's value as last taken, and locked again. */
export function relockAiField(component: Component, field: AiField): Component {
  const link = aiLinkOf(component);
  if (!link) return component;
  const unlocked = (link.unlocked ?? []).filter((f) => f !== field);
  const next = field in link.values ? writeAiValue(component, field, link.values[field] ?? null) : component;
  const { unlocked: _drop, ...rest } = link;
  void _drop;
  return withLink(next, unlocked.length ? { ...rest, unlocked } : rest);
}

/** Puts a field's value onto the component, the way Screen 04's own editors would. */
export function writeAiValue(component: Component, field: AiField, value: AiValue): Component {
  const spec = component.thermal_spec;
  switch (field) {
    case 'name':
      return { ...component, name: String(value ?? component.name) };
    case 'qty':
      return { ...component, qty: num(value) ?? component.qty };
    case 'power':
      return { ...component, power_W: withValue(component.power_W, num(value), 'Imported') };
    case 'limit':
      return {
        ...component,
        thermal_spec: { ...spec, limit_C: num(value) == null ? null : withValue(spec.limit_C, num(value), 'Imported') },
      };
    case 'limit_type':
      return {
        ...component,
        thermal_spec: { ...spec, limit_type: value as LimitType, limit_type_confirmed: true },
      };
    case 'rjc': {
      const v = (value ?? { body: false, rjc: null }) as { body: boolean; rjc: number | null };
      const parameters = { ...(spec.heat_path.parameters ?? {}) };
      if (v.body) parameters.source_model = 'SurfaceBodyBased';
      else if (parameters.source_model === 'SurfaceBodyBased') {
        if (spec.heat_path.type === 'DirectMetal') parameters.source_model = 'JunctionBased';
        else delete parameters.source_model;
      }
      return {
        ...component,
        thermal_spec: {
          ...spec,
          r_jc_C_per_W: v.body || v.rjc == null ? null : withValue(spec.r_jc_C_per_W, v.rjc, 'Imported'),
          heat_path: { ...spec.heat_path, parameters },
        },
      };
    }
    case 'heat_path': {
      if (typeof value !== 'string' || value === spec.heat_path.type) {
        return { ...component, thermal_spec: { ...spec, heat_path_confirmed: true } };
      }
      const patch = heatPathPatch(component, value as HeatPathType);
      return {
        ...component,
        ...patch,
        thermal_spec: { ...patch.thermal_spec, heat_path_confirmed: true },
      };
    }
    case 'package': {
      const v = (value ?? { L: null, W: null, H: null }) as { L: number | null; W: number | null; H?: number | null };
      return {
        ...component,
        thermal_spec: {
          ...spec,
          geometry: { ...spec.geometry, package_L_mm: v.L, package_W_mm: v.W, package_H_mm: v.H ?? null },
        },
      };
    }
    case 'source_face': {
      const v = (value ?? { L: null, W: null }) as { L: number | null; W: number | null };
      return {
        ...component,
        thermal_spec: { ...spec, geometry: { ...spec.geometry, source_L_mm: v.L, source_W_mm: v.W } },
      };
    }
    case 'board_thickness':
      return {
        ...component,
        thermal_spec: { ...spec, geometry: { ...spec.geometry, board_thickness_mm: num(value) } },
      };
    case 'tim': {
      const v = (value ?? { id: null, blt: null }) as { id: string | null; blt: number | null };
      return {
        ...component,
        thermal_spec: {
          ...spec,
          tim: {
            ...spec.tim,
            tim_id: v.id,
            blt_mm: v.blt == null ? null : withValue(spec.tim.blt_mm, v.blt, 'Imported'),
          },
        },
      };
    }
    case 'via': {
      const v = (value ?? { k: null, eff: null }) as { k: number | null; eff: number | null };
      const parameters = { ...(spec.heat_path.parameters ?? {}) };
      delete parameters.via_effective_k_W_mK;
      delete parameters.via_efficiency;
      if (v.k != null) parameters.via_effective_k_W_mK = v.k;
      if (v.eff != null) parameters.via_efficiency = v.eff;
      return { ...component, thermal_spec: { ...spec, heat_path: { ...spec.heat_path, parameters } } };
    }
  }
}

/** A field's value as a short line of text, for the locked display and the update dialog. */
export function formatAiValue(field: AiField, value: AiValue | undefined, timName?: (id: string) => string): string {
  if (value == null || value === '') return '—';
  const n = (v: number | null | undefined) => (v == null ? '?' : String(+v.toFixed(4)));
  switch (field) {
    case 'power':
      return `${n(value as number)} W`;
    case 'limit':
      return `${n(value as number)} °C`;
    case 'rjc': {
      const v = value as { body: boolean; rjc: number | null };
      return v.body ? '本體型（無 Rjc）' : v.rjc == null ? '—' : `${n(v.rjc)} °C/W`;
    }
    case 'heat_path':
      return HEAT_PATH_LABELS[value as HeatPathType]?.zh ?? String(value);
    case 'package': {
      const v = value as { L: number | null; W: number | null; H?: number | null };
      return `${n(v.L)} × ${n(v.W)}${v.H != null ? ` × ${n(v.H)}` : ''} mm`;
    }
    case 'source_face': {
      const v = value as { L: number | null; W: number | null };
      return `${n(v.L)} × ${n(v.W)} mm`;
    }
    case 'board_thickness':
      return `${n(value as number)} mm`;
    case 'tim': {
      const v = value as { id: string | null; blt: number | null };
      const name = v.id ? (timName ? timName(v.id) : v.id) : '—';
      return v.blt != null ? `${name}・BLT ${n(v.blt)} mm` : name;
    }
    case 'via': {
      const v = value as { k: number | null; eff: number | null };
      return v.k == null ? '用 01 通用值' : `${n(v.k)} W/m·K${v.eff != null ? `・係數 ${n(v.eff)}` : ''}`;
    }
    default:
      return String(value);
  }
}

// --- the update --------------------------------------------------------------

export interface AiFieldChange {
  field: AiField;
  current: AiValue;
  incoming: AiValue;
  /** Ticked to begin with. */
  pick: boolean;
  /** Why it starts unticked, when it does. */
  note?: string;
}

export interface AiComponentUpdate {
  componentId: string;
  name: string;
  /** Not linked yet (`isAiFirstLink`): this update is its first link. */
  firstLink?: boolean;
  changes: AiFieldChange[];
  /** The values to store as AI-Thermal's once applied (every field it supplies now). */
  fresh: Component;
}

/**
 * What an update would change on one linked component.
 *
 * A field AI-Thermal owns and nobody took over starts ticked. One the engineer
 * took over (✂), or filled in here while AI-Thermal had it empty, starts
 * unticked and says so — the engineer chose that value.
 *
 * A first link has no record of AI-Thermal's values at import, so a value that
 * differs may have moved on either side: it starts unticked. A blank here that
 * AI-Thermal now fills starts ticked — filling it overwrites nothing.
 */
export function aiChangesFor(current: Component, fresh: Component): AiFieldChange[] {
  const link = aiLinkOf(current);
  const changes: AiFieldChange[] = [];
  for (const field of AI_FIELDS) {
    if (!supplied(fresh, field)) continue;
    const incoming = aiValueOf(fresh, field);
    const now = aiValueOf(current, field);
    if (sameAiValue(now, incoming)) continue;
    if (!link) {
      const filled = supplied(current, field);
      changes.push({
        field,
        current: now,
        incoming,
        pick: !filled,
        ...(filled ? { note: '第一次連結：分不出是哪一邊改的' } : {}),
      });
      continue;
    }
    const unlocked = (link?.unlocked ?? []).includes(field);
    const had = link ? field in link.values : false;
    const changedHere = had && !sameAiValue(now, link?.values[field]);
    let pick = true;
    let note: string | undefined;
    if (field === 'name') {
      // A name is never locked, so a local rename is simply a value that moved.
      if (changedHere) {
        pick = false;
        note = '本工具改過名稱';
      }
    } else if (unlocked && changedHere) {
      pick = false;
      note = '本工具已解開並改過';
    } else if (!had && supplied(current, field)) {
      pick = false;
      note = '本工具填過（AI-Thermal 原本沒有）';
    }
    changes.push({ field, current: now, incoming, pick, note });
  }
  return changes;
}

/**
 * Applies the picked changes and records AI-Thermal's current values as the
 * new reference. A field left unticked keeps this tool's value and is no
 * longer locked: the engineer chose that value over AI-Thermal's.
 */
export function applyAiChanges(
  current: Component,
  fresh: Component,
  picked: readonly AiField[],
  projectId: string,
  savedAt: string | null,
): Component {
  let next = current;
  // The heat path first: changing it resets the path's parameters, which the
  // Rjc (body source) and the via k then write into.
  const order = [...picked].sort((a, b) => (a === 'heat_path' ? -1 : b === 'heat_path' ? 1 : 0));
  for (const field of order) next = writeAiValue(next, field, aiValueOf(fresh, field));
  const previous = aiLinkOf(current);
  const link = buildAiLink(fresh, projectId, savedAt, previous);
  // A field brought back from AI-Thermal is AI-Thermal's again; one kept is ours.
  const unlocked = new Set((previous?.unlocked ?? []).filter((f) => !picked.includes(f)));
  for (const field of AI_FIELDS) {
    if (!AI_LOCKABLE.has(field) || picked.includes(field) || !(field in link.values)) continue;
    if (!sameAiValue(aiValueOf(next, field), link.values[field])) unlocked.add(field);
  }
  const { unlocked: _drop, ...rest } = link;
  void _drop;
  return withLink(next, unlocked.size ? { ...rest, unlocked: [...unlocked] } : rest);
}

/** Drops the link: the component is this tool's from now on. */
export function unlinkAi(component: Component): Component {
  const { ai_link: _link, ...provenance } = component.provenance;
  void _link;
  // Remembered, so a part imported from AI-Thermal is not offered a first link again.
  return { ...component, provenance: { ...provenance, ai_unlinked: true } };
}

// --- planning an update over a whole project ---------------------------------

/** The AI-Thermal projects a project's components belong to (linked or not yet), most components first. */
export function linkedAiProjects(components: readonly Component[]): Array<{ id: string; count: number }> {
  const counts = new Map<string, number>();
  for (const component of components) {
    const id = aiProjectOf(component);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
}

export interface AiUpdatePlan {
  /** Linked components AI-Thermal now describes differently. */
  updates: AiComponentUpdate[];
  /** In AI-Thermal, not in this project (offered, unticked). */
  added: Component[];
  /** In AI-Thermal under a name a component here already uses, unlinked: left alone. */
  sameName: string[];
  /** Linked components AI-Thermal no longer has. */
  removed: Component[];
  /** Linked components with nothing new. */
  same: number;
  /** Not linked yet and identical to AI-Thermal: linked, and locked, as they are. */
  link: Array<{ componentId: string; name: string; fresh: Component }>;
  /** Components this update links for the first time (in `updates` and `link`). */
  firstLinks: number;
}

const nameKey = (name: string) => name.trim().toLowerCase();

/**
 * Matches the project's linked components to AI-Thermal's current ones — by
 * AI-Thermal's component id first (a part renamed there still matches), then
 * by the name it had at the last sync — and lists what would change. Parts
 * imported before links were recorded (`isAiFirstLink`) are matched the same
 * way, by the id and name they were imported with, and linked by the update.
 */
export function planAiUpdate(
  components: readonly Component[],
  fresh: readonly Component[],
  projectId: string,
): AiUpdatePlan {
  const linked = components.filter((component) => aiProjectOf(component) === projectId);
  const taken = new Set<number>();
  const match = new Map<string, Component>();

  for (const component of linked) {
    const cid = aiLinkOf(component)?.cid ?? (isAiFirstLink(component) ? component.provenance.ref_origin_id : null);
    if (!cid) continue;
    const index = fresh.findIndex((f, i) => !taken.has(i) && f.provenance.ref_origin_id === cid);
    if (index >= 0) {
      taken.add(index);
      match.set(component.id, fresh[index]);
    }
  }
  for (const component of linked) {
    if (match.has(component.id)) continue;
    const link = aiLinkOf(component);
    const key = nameKey(String(link?.values.name ?? component.name));
    const index = fresh.findIndex((f, i) => !taken.has(i) && nameKey(f.name) === key);
    if (index >= 0) {
      taken.add(index);
      match.set(component.id, fresh[index]);
    }
  }

  const updates: AiComponentUpdate[] = [];
  const removed: Component[] = [];
  const link: AiUpdatePlan['link'] = [];
  let same = 0;
  let firstLinks = 0;
  for (const component of linked) {
    const incoming = match.get(component.id);
    if (!incoming) {
      removed.push(component);
      continue;
    }
    const first = isAiFirstLink(component);
    if (first) firstLinks++;
    const changes = aiChangesFor(component, incoming);
    if (changes.length > 0) {
      updates.push({
        componentId: component.id,
        name: component.name,
        ...(first ? { firstLink: true } : {}),
        changes,
        fresh: incoming,
      });
    } else if (first) link.push({ componentId: component.id, name: component.name, fresh: incoming });
    else same++;
  }

  const here = new Set(components.map((component) => nameKey(component.name)));
  const added: Component[] = [];
  const sameName: string[] = [];
  fresh.forEach((component, index) => {
    if (taken.has(index)) return;
    if (here.has(nameKey(component.name))) sameName.push(component.name);
    else added.push(component);
  });
  return { updates, added, sameName, removed, same, link, firstLinks };
}

/** How many changes an update would make as offered (the ticked ones) — what the reminder counts. */
export function aiPlanPending(plan: AiUpdatePlan): { components: number; fields: number } {
  let components = 0;
  let fields = 0;
  for (const update of plan.updates) {
    const ticked = update.changes.filter((change) => change.pick).length;
    if (ticked > 0) components++;
    fields += ticked;
  }
  return { components, fields };
}

export interface AiUpdateChoice {
  /** Per linked component: the fields to take from AI-Thermal. */
  fields: Record<string, AiField[]>;
  /** Ids (in `plan.added`) of the AI-Thermal components to add. */
  add: string[];
  /** Ids of the removed components to switch off as well (all are kept, unlinked). */
  disable: string[];
}

/** The project after an update, and the patch field names it touched (for the invalidation matrix). */
export function applyAiPlan(
  components: readonly Component[],
  plan: AiUpdatePlan,
  choice: AiUpdateChoice,
  projectId: string,
  savedAt: string | null,
): {
  components: Component[];
  fields: string[];
  updated: number;
  added: number;
  removed: number;
  /** Linked for the first time. */
  linked: number;
} {
  const byId = new Map(plan.updates.map((update) => [update.componentId, update]));
  const linking = new Map(plan.link.map((entry) => [entry.componentId, entry.fresh]));
  const removedIds = new Set(plan.removed.map((component) => component.id));
  const touched = new Set<string>();
  let updated = 0;
  const next = components.map((component) => {
    const update = byId.get(component.id);
    if (update) {
      const picked = choice.fields[component.id] ?? [];
      if (picked.length > 0) updated++;
      for (const field of picked) for (const f of AI_PATCH_FIELDS[field]) touched.add(f);
      return applyAiChanges(component, update.fresh, picked, projectId, savedAt);
    }
    const fresh = linking.get(component.id);
    if (fresh) return applyAiChanges(component, fresh, [], projectId, savedAt);
    if (removedIds.has(component.id)) {
      const kept = unlinkAi(component);
      if (!choice.disable.includes(component.id)) return kept;
      touched.add('enabled');
      return { ...kept, enabled: false };
    }
    return component;
  });
  // Ids were taken when AI-Thermal was read; the project may have grown since.
  const taken = new Set(next.map((component) => component.id));
  const adding = plan.added
    .filter((component) => choice.add.includes(component.id))
    .map((component) => {
      let id = component.id;
      for (let n = 2; taken.has(id); n++) id = `${component.id}_${n}`;
      taken.add(id);
      return id === component.id ? component : { ...component, id };
    });
  if (adding.length > 0) touched.add('component_added');
  return {
    components: [...next, ...adding],
    fields: [...touched],
    updated,
    added: adding.length,
    removed: plan.removed.length,
    linked: plan.firstLinks,
  };
}
