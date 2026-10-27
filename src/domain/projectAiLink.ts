/**
 * The link between a project here and its project in AI-Thermal's shared
 * database — the project-level counterpart of a component's `ai_link`
 * (`aiThermalLink.ts`).
 *
 * The AI-Thermal project document holds two tools' data: AI-Thermal's own
 * (the project name, the band, the ambient of its high-temperature condition,
 * the TIM model library) and 5G-RRU's parameter console (`global_params`: the
 * coin, the solder under it, the generic via numbers, the heat-sink base, the
 * fin process and the TIM fallbacks). Screen 01 asks for the same physical
 * numbers, so a linked project takes them from there: shown as references with
 * a ✂ to take one over, and brought up to date by 01's 「從 AI-Thermal 更新」.
 * AI-Thermal first, 5G-RRU second wherever both have a value (the user's rule).
 *
 * Stored on the project (`Project.ai_link`):
 *
 *   project_id    AI-Thermal project id (the document key)
 *   project_name  its name when the values below were taken
 *   linked_at     when the link was made
 *   synced_at     when the values below were taken (link or last update)
 *   saved_at      AI-Thermal's own last-save stamp at that time
 *   values        the value of each field the two tools STATED, as taken; a field
 *                 they left empty is not here and is this tool's to fill
 *   sources       which tool each value came from ('AI-Thermal' / '5G-RRU')
 *   unlocked      fields taken over with ✂: not locked, and an update leaves them
 *                 unticked by default
 *   rru_ambient_C 5G-RRU's T_amb at that time, for the reminder when it differs
 *                 from AI-Thermal's ambient (the ambient itself is AI-Thermal's)
 *   rru_design    5G-RRU's saved design result at that time (`rru_result` in the
 *                 document): what the heat-sink surface compares its own h, η and
 *                 heat load with. Its fin height and count are linked values too.
 *
 * Field keys: `name`, `band`, `ambient` (the Baseline scenario's ambient),
 * `fin` (the fin process among the cooling elements), `mat.<field>` (a project
 * material constant) and `tim.<materialId>.k` / `.blt` (one TIM material).
 *
 * Pure functions only; the importer builds `ProjectAiFresh` from the database
 * (`importers/component/aiThermalProject.ts`) and Screen 01 calls the rest.
 */

import type { CoolingArchitecture, FrequencyRange, Project, Scenario } from './project';
import { createBaselineScenario, defaultProjectContext, FREQUENCY_RANGES } from './project';
import type { MaterialDefaults, TimMaterial } from './materials';
import { sourced, type SourcedValue } from './sourcedValue';

export type ProjectAiSource = 'AI-Thermal' | '5G-RRU';
export type ProjectAiValue = string | number;

/**
 * 5G-RRU's design as it last saved it (`projects[id].rru_result`, written by
 * 5G-RRU on every save). A reference for the heat-sink surface: this tool
 * computes its own h and η from the same geometry and shows both.
 */
export interface RruDesign {
  at: string;
  /** False: 5G-RRU could not design it (the reason in `why`). */
  ok: boolean;
  why?: string;
  fin_tech?: 'Embedded' | 'Die-casting';
  fin_height_mm?: number;
  fin_count?: number;
  h_W_m2K?: number;
  h_conv_W_m2K?: number;
  h_rad_W_m2K?: number;
  eta_fin?: number;
  eta_process?: number;
  k_fin_W_mK?: number;
  /** Actual heat load, without the safety factor. */
  heat_W?: number;
  volume_L?: number;
}

export interface ProjectAiLink {
  project_id: string;
  project_name: string;
  linked_at: string;
  synced_at: string;
  saved_at: string | null;
  values: Record<string, ProjectAiValue>;
  sources: Record<string, ProjectAiSource>;
  unlocked?: string[];
  rru_ambient_C?: number;
  rru_design?: RruDesign;
}

/** One value the two tools state for this project now. */
export interface ProjectAiFreshValue {
  value: ProjectAiValue;
  source: ProjectAiSource;
  /** Where it was read, in the source tool's own words. */
  from: string;
}

/** What AI-Thermal's database says about a project right now. */
export interface ProjectAiFresh {
  project_id: string;
  project_name: string;
  saved_at: string | null;
  values: Record<string, ProjectAiFreshValue>;
  /** 5G-RRU's T_amb: the reminder when it disagrees with AI-Thermal's ambient. */
  rru_ambient_C: number | null;
  /** 5G-RRU's saved design result, when it has saved one. */
  rru_design?: RruDesign | null;
}

export const AI_KEY = { name: 'name', band: 'band', ambient: 'ambient', fin: 'fin' } as const;

/** The material constants 5G-RRU's parameter console also holds. */
export const AI_MAT_FIELDS = [
  'coin_L_mm',
  'coin_W_mm',
  'coin_thickness_mm',
  'copper_k_W_mK',
  'solder_k_W_mK',
  'solder_thickness_mm',
  'solder_voiding',
  'via_effective_k_W_mK',
  'via_efficiency',
  'hsk_base_thickness_mm',
  'hsk_base_L_mm',
  'hsk_base_W_mm',
  // The fin array (05 heat-sink surface). The process factor is not here: it is
  // 5G-RRU's calibration of its own correlation, not a property of the fins.
  'hsk_fin_height_mm',
  'hsk_fin_count',
  'hsk_fin_gap_mm',
  'hsk_fin_thickness_mm',
  'hsk_fin_draft_deg',
  'hsk_fin_k_W_mK',
] as const;
export type AiMatField = (typeof AI_MAT_FIELDS)[number];

export const AI_MAT_INFO: Record<AiMatField, { group: string; label: string; unit: string }> = {
  coin_L_mm: { group: '銅塊', label: '長 L', unit: 'mm' },
  coin_W_mm: { group: '銅塊', label: '寬 W', unit: 'mm' },
  coin_thickness_mm: { group: '銅塊', label: '厚度', unit: 'mm' },
  copper_k_W_mK: { group: '銅塊', label: '銅導熱係數', unit: 'W/m·K' },
  solder_k_W_mK: { group: '焊料', label: '焊料導熱係數', unit: 'W/m·K' },
  solder_thickness_mm: { group: '焊料', label: '焊料厚度', unit: 'mm' },
  solder_voiding: { group: '焊料', label: '焊料有效面積率', unit: '—' },
  via_effective_k_W_mK: { group: '導熱孔', label: '導熱孔等效 k', unit: 'W/m·K' },
  via_efficiency: { group: '導熱孔', label: '導熱孔製程係數', unit: '—' },
  hsk_base_thickness_mm: { group: '散熱器底座', label: '厚度', unit: 'mm' },
  hsk_base_L_mm: { group: '散熱器底座', label: '長 L', unit: 'mm' },
  hsk_base_W_mm: { group: '散熱器底座', label: '寬 W', unit: 'mm' },
  hsk_fin_height_mm: { group: '鰭片', label: '鰭片高度', unit: 'mm' },
  hsk_fin_count: { group: '鰭片', label: '鰭片數', unit: '片' },
  hsk_fin_gap_mm: { group: '鰭片', label: 'Air gap', unit: 'mm' },
  hsk_fin_thickness_mm: { group: '鰭片', label: '鰭片厚度', unit: 'mm' },
  hsk_fin_draft_deg: { group: '鰭片', label: '拔模角', unit: '°' },
  hsk_fin_k_W_mK: { group: '鰭片', label: '鰭片 k', unit: 'W/m·K' },
};

export const matKey = (field: AiMatField) => `mat.${field}`;
export const timKey = (id: string, prop: 'k' | 'blt') => `tim.${id}.${prop}`;

const FINS: readonly CoolingArchitecture[] = ['Die-casting Fin', 'Embedded Fin'];
const FIN_ZH: Record<string, string> = { 'Die-casting Fin': 'Die-casting 鰭片', 'Embedded Fin': 'Embedded 鰭片' };

type Parsed =
  | { kind: 'name' | 'band' | 'ambient' | 'fin' }
  | { kind: 'mat'; field: AiMatField }
  | { kind: 'tim'; id: string; prop: 'k' | 'blt' };

function parseKey(key: string): Parsed | null {
  if (key === 'name' || key === 'band' || key === 'ambient' || key === 'fin') return { kind: key };
  if (key.startsWith('mat.')) {
    const field = key.slice(4) as AiMatField;
    return AI_MAT_FIELDS.includes(field) ? { kind: 'mat', field } : null;
  }
  const tim = /^tim\.(.+)\.(k|blt)$/.exec(key);
  return tim ? { kind: 'tim', id: tim[1], prop: tim[2] as 'k' | 'blt' } : null;
}

export function projectAiLinkOf(project: Pick<Project, 'ai_link'> | null | undefined): ProjectAiLink | null {
  const link: unknown = project?.ai_link;
  return link && typeof link === 'object' && !Array.isArray(link) ? (link as ProjectAiLink) : null;
}

/** A stored link as read back from disk: anything malformed is no link. */
export function normalizeProjectAiLink(raw: unknown): ProjectAiLink | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.project_id !== 'string' || !r.project_id) return undefined;
  const values: Record<string, ProjectAiValue> = {};
  if (r.values && typeof r.values === 'object') {
    for (const [key, value] of Object.entries(r.values as Record<string, unknown>)) {
      if ((typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) && parseKey(key)) {
        values[key] = value;
      }
    }
  }
  const sources: Record<string, ProjectAiSource> = {};
  if (r.sources && typeof r.sources === 'object') {
    for (const [key, value] of Object.entries(r.sources as Record<string, unknown>)) {
      if (value === 'AI-Thermal' || value === '5G-RRU') sources[key] = value;
    }
  }
  const unlocked = Array.isArray(r.unlocked) ? r.unlocked.filter((k): k is string => typeof k === 'string') : [];
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    project_id: r.project_id,
    project_name: text(r.project_name) || r.project_id,
    linked_at: text(r.linked_at),
    synced_at: text(r.synced_at),
    saved_at: typeof r.saved_at === 'string' ? r.saved_at : null,
    values,
    sources,
    ...(unlocked.length ? { unlocked } : {}),
    ...(typeof r.rru_ambient_C === 'number' && Number.isFinite(r.rru_ambient_C) ? { rru_ambient_C: r.rru_ambient_C } : {}),
    ...withRruDesign(normalizeRruDesign(r.rru_design)),
  };
}

const RRU_DESIGN_NUMBERS = [
  'fin_height_mm',
  'fin_count',
  'h_W_m2K',
  'h_conv_W_m2K',
  'h_rad_W_m2K',
  'eta_fin',
  'eta_process',
  'k_fin_W_mK',
  'heat_W',
  'volume_L',
] as const;

/** A stored design snapshot; anything malformed is none. */
export function normalizeRruDesign(raw: unknown): RruDesign | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.at !== 'string' || typeof r.ok !== 'boolean') return null;
  const out: RruDesign = { at: r.at, ok: r.ok };
  if (typeof r.why === 'string' && r.why) out.why = r.why;
  if (r.fin_tech === 'Embedded' || r.fin_tech === 'Die-casting') out.fin_tech = r.fin_tech;
  for (const key of RRU_DESIGN_NUMBERS) {
    const value = r[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

const withRruDesign = (design: RruDesign | null | undefined) => (design ? { rru_design: design } : {});

/** The Baseline scenario: the one the ambient link writes to. */
export function baselineOf(scenarios: readonly Scenario[]): Scenario | null {
  return scenarios.find((s) => s.is_default) ?? scenarios[0] ?? null;
}

const materialOf = (materials: MaterialDefaults, id: string): TimMaterial | undefined =>
  materials.tim.find((m) => m.id === id);

/** A field's value here; undefined when the field does not exist (a TIM material that was removed). */
export function projectAiCurrent(
  project: Project,
  baseline: Scenario | null,
  key: string,
): ProjectAiValue | null | undefined {
  const parsed = parseKey(key);
  if (!parsed) return undefined;
  switch (parsed.kind) {
    case 'name':
      return project.project_name;
    case 'band':
      return project.project_context.frequency_range;
    case 'ambient':
      return baseline ? baseline.ambient_C : undefined;
    case 'fin': {
      const fins = FINS.filter((fin) => project.project_context.cooling_architecture.includes(fin));
      return fins.length ? fins.join(' + ') : null;
    }
    case 'mat':
      return project.materials[parsed.field]?.value ?? null;
    case 'tim': {
      const material = materialOf(project.materials, parsed.id);
      if (!material) return undefined;
      return (parsed.prop === 'k' ? material.k_W_mK : material.blt_mm).value ?? null;
    }
  }
}

/**
 * Whether the value here is someone's statement rather than what the tool
 * starts with. Decides what the first link ticks: a shipped value is replaced,
 * a stated one is kept unless the engineer ticks it.
 */
function currentStated(project: Project, baseline: Scenario | null, key: string): boolean {
  const parsed = parseKey(key);
  if (!parsed) return false;
  switch (parsed.kind) {
    case 'name':
      return project.project_name.trim() !== '';
    case 'band':
      return project.project_context.frequency_range !== defaultProjectContext().frequency_range;
    case 'ambient':
      return !!baseline && baseline.ambient_C !== createBaselineScenario('').ambient_C;
    case 'fin':
      return projectAiCurrent(project, baseline, key) != null;
    case 'mat': {
      const value = project.materials[parsed.field];
      return value?.value != null && value.source !== 'Assumed';
    }
    case 'tim': {
      const material = materialOf(project.materials, parsed.id);
      const value = material ? (parsed.prop === 'k' ? material.k_W_mK : material.blt_mm) : null;
      return value?.value != null && value.source !== 'Assumed';
    }
  }
}

export function sameProjectAiValue(a: ProjectAiValue | null | undefined, b: ProjectAiValue | null | undefined): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return (a ?? null) === (b ?? null);
}

/** What the dialog and the locked boxes call a field. */
export function projectAiFieldInfo(
  key: string,
  materials: MaterialDefaults,
): { group: string; label: string; unit?: string } {
  const parsed = parseKey(key);
  if (!parsed) return { group: '', label: key };
  switch (parsed.kind) {
    case 'name':
      return { group: '基本資料', label: '專案名稱' };
    case 'band':
      return { group: '基本資料', label: '頻段' };
    case 'ambient':
      return { group: '情境', label: 'Baseline 環境溫度', unit: '°C' };
    case 'fin':
      return { group: '基本資料', label: '鰭片製程' };
    case 'mat':
      return AI_MAT_INFO[parsed.field];
    case 'tim': {
      const name = materialOf(materials, parsed.id)?.name ?? parsed.id;
      return { group: 'TIM', label: `${name} ${parsed.prop === 'k' ? 'k' : 'BLT'}`, unit: parsed.prop === 'k' ? 'W/m·K' : 'mm' };
    }
  }
}

/** A value as the engineer reads it. */
export function formatProjectAiValue(key: string, value: ProjectAiValue | null | undefined): string {
  if (value == null || value === '') return '—';
  if (key === AI_KEY.fin) return String(value).split(' + ').map((fin) => FIN_ZH[fin] ?? fin).join(' + ');
  if (typeof value === 'number') return String(+value.toFixed(4));
  return value;
}

/** Locked: the two tools state it and nobody took it over. */
export function isProjectAiLocked(project: Pick<Project, 'ai_link'>, key: string): boolean {
  const link = projectAiLinkOf(project);
  return !!link && key in link.values && !(link.unlocked ?? []).includes(key);
}

/** Taken over: the link has a value for it, but the engineer pressed ✂. */
export function isProjectAiUnlocked(project: Pick<Project, 'ai_link'>, key: string): boolean {
  const link = projectAiLinkOf(project);
  return !!link && key in link.values && (link.unlocked ?? []).includes(key);
}

/** Linked, but the two tools said nothing for this field at the last sync. */
export function projectAiNotStated(project: Pick<Project, 'ai_link'>, key: string): boolean {
  const link = projectAiLinkOf(project);
  return !!link && !(key in link.values);
}

// --- writing a value ----------------------------------------------------------

export interface ProjectAiWrite {
  project: Project;
  /** Set when the Baseline ambient has to change: the scenario store owns it. */
  ambient: number | null;
}

function writeValue(project: Project, key: string, value: ProjectAiValue, reference: string): ProjectAiWrite {
  const parsed = parseKey(key);
  if (!parsed) return { project, ambient: null };
  switch (parsed.kind) {
    case 'name':
      return { project: { ...project, project_name: String(value) }, ambient: null };
    case 'band':
      return FREQUENCY_RANGES.includes(value as FrequencyRange)
        ? {
            project: {
              ...project,
              project_context: { ...project.project_context, frequency_range: value as FrequencyRange },
            },
            ambient: null,
          }
        : { project, ambient: null };
    case 'ambient':
      return { project, ambient: typeof value === 'number' ? value : Number(value) };
    case 'fin': {
      const wanted = String(value).split(' + ') as CoolingArchitecture[];
      const kept = project.project_context.cooling_architecture.filter((entry) => !FINS.includes(entry));
      return {
        project: {
          ...project,
          project_context: { ...project.project_context, cooling_architecture: [...kept, ...wanted.filter((fin) => FINS.includes(fin))] },
        },
        ambient: null,
      };
    }
    case 'mat': {
      if (typeof value !== 'number') return { project, ambient: null };
      return {
        project: { ...project, materials: { ...project.materials, [parsed.field]: sourced(value, 'Imported', { reference }) } },
        ambient: null,
      };
    }
    case 'tim': {
      if (typeof value !== 'number') return { project, ambient: null };
      const prop = parsed.prop === 'k' ? 'k_W_mK' : 'blt_mm';
      const stamped: SourcedValue<number> = sourced(value, 'Imported', { reference });
      return {
        project: {
          ...project,
          materials: {
            ...project.materials,
            tim: project.materials.tim.map((m) => (m.id === parsed.id ? { ...m, [prop]: stamped } : m)),
          },
        },
        ambient: null,
      };
    }
  }
}

function referenceFor(link: { project_name: string }, source: ProjectAiSource | undefined): string {
  return source === '5G-RRU'
    ? `5G-RRU 參數控制台（${link.project_name}）`
    : `AI-Thermal（${link.project_name}）`;
}

// --- the plan -----------------------------------------------------------------

export interface ProjectAiRow {
  key: string;
  group: string;
  label: string;
  unit?: string;
  source: ProjectAiSource;
  from: string;
  current: ProjectAiValue | null;
  incoming: ProjectAiValue;
  /** The value taken at the last sync (null on a first link or a newly stated field). */
  before: ProjectAiValue | null;
  /** Ticked to begin with. */
  pick: boolean;
  /** Why it starts unticked. */
  note: string;
}

export interface ProjectAiPlan {
  /** No link to this AI-Thermal project yet: every difference is a decision. */
  first: boolean;
  /** Fields whose value here differs from what the two tools state now. */
  rows: ProjectAiRow[];
  /** Same value, stated now but not yet locked: locked by the update, unchanged. */
  relock: string[];
  /** Fields already locked with AI-Thermal's value. */
  same: number;
  /** Fields the two tools no longer state: they become this tool's. */
  dropped: string[];
}

export function planProjectAiUpdate(project: Project, baseline: Scenario | null, fresh: ProjectAiFresh): ProjectAiPlan {
  const prev = projectAiLinkOf(project);
  const link = prev && prev.project_id === fresh.project_id ? prev : null;
  const unlocked = new Set(link?.unlocked ?? []);
  const rows: ProjectAiRow[] = [];
  const relock: string[] = [];
  let same = 0;

  for (const [key, incoming] of Object.entries(fresh.values)) {
    const current = projectAiCurrent(project, baseline, key);
    if (current === undefined) continue;
    const info = projectAiFieldInfo(key, project.materials);
    const inLink = !!link && key in link.values;
    if (sameProjectAiValue(current, incoming.value)) {
      if (inLink && !unlocked.has(key)) same++;
      // A field the engineer took over keeps its ✂ even while the numbers agree.
      else if (!unlocked.has(key)) relock.push(key);
      continue;
    }
    const stated = currentStated(project, baseline, key);
    let pick: boolean;
    let note = '';
    if (!link) {
      pick = !stated;
      if (stated) note = '01 已填過';
    } else if (inLink && unlocked.has(key)) {
      pick = false;
      note = '已解開（用 01 的值）';
    } else if (inLink) {
      pick = true;
    } else {
      pick = !stated;
      if (stated) note = '01 已填過（上次同步時還沒有值）';
    }
    rows.push({
      key,
      ...info,
      source: incoming.source,
      from: incoming.from,
      current: current ?? null,
      incoming: incoming.value,
      before: inLink ? (link!.values[key] ?? null) : null,
      pick,
      note,
    });
  }

  const dropped = link ? Object.keys(link.values).filter((key) => !(key in fresh.values)) : [];
  return { first: !link, rows, relock, same, dropped };
}

/** What 01's header counts: the fields an update would change by default. */
export function projectAiPending(plan: ProjectAiPlan): number {
  return plan.rows.filter((row) => row.pick).length;
}

/**
 * The update (or the first link) applied: ticked rows take the two tools'
 * value and lock; unticked differing rows keep this tool's value and are
 * marked taken over; equal ones lock.
 */
export function applyProjectAiPlan(
  project: Project,
  fresh: ProjectAiFresh,
  plan: ProjectAiPlan,
  picks: Record<string, boolean> = {},
  now = new Date().toISOString(),
): ProjectAiWrite & { changed: string[] } {
  const prev = projectAiLinkOf(project);
  const sameProject = !!prev && prev.project_id === fresh.project_id;
  const unlocked = new Set(sameProject ? (prev!.unlocked ?? []) : []);
  const reference = { project_name: fresh.project_name };
  let next = project;
  let ambient: number | null = null;
  const changed: string[] = [];

  for (const row of plan.rows) {
    const picked = picks[row.key] ?? row.pick;
    if (picked) {
      const written = writeValue(next, row.key, row.incoming, referenceFor(reference, row.source));
      next = written.project;
      if (written.ambient != null) ambient = written.ambient;
      changed.push(row.key);
      unlocked.delete(row.key);
    } else {
      unlocked.add(row.key);
    }
  }
  for (const key of plan.relock) unlocked.delete(key);
  for (const key of [...unlocked]) if (!(key in fresh.values)) unlocked.delete(key);

  const values: Record<string, ProjectAiValue> = {};
  const sources: Record<string, ProjectAiSource> = {};
  for (const [key, entry] of Object.entries(fresh.values)) {
    values[key] = entry.value;
    sources[key] = entry.source;
  }
  const link: ProjectAiLink = {
    project_id: fresh.project_id,
    project_name: fresh.project_name,
    linked_at: sameProject && prev!.linked_at ? prev!.linked_at : now,
    synced_at: now,
    saved_at: fresh.saved_at,
    values,
    sources,
    ...(unlocked.size ? { unlocked: [...unlocked] } : {}),
    ...(fresh.rru_ambient_C != null ? { rru_ambient_C: fresh.rru_ambient_C } : {}),
    ...withRruDesign(fresh.rru_design),
  };
  return { project: { ...next, ai_link: link }, ambient, changed };
}

/** ✂ — this field becomes this tool's; the link keeps AI-Thermal's value for 改回. */
export function unlockProjectAiField(project: Project, key: string): Project {
  const link = projectAiLinkOf(project);
  if (!link || !(key in link.values)) return project;
  const unlocked = new Set(link.unlocked ?? []);
  unlocked.add(key);
  return { ...project, ai_link: { ...link, unlocked: [...unlocked] } };
}

/** ↺ — back to the linked value, and locked again. */
export function relockProjectAiField(project: Project, key: string): ProjectAiWrite {
  const link = projectAiLinkOf(project);
  if (!link || !(key in link.values)) return { project, ambient: null };
  const written = writeValue(project, key, link.values[key], referenceFor(link, link.sources[key]));
  const unlocked = (link.unlocked ?? []).filter((k) => k !== key);
  const nextLink: ProjectAiLink = { ...link };
  if (unlocked.length) nextLink.unlocked = unlocked;
  else delete nextLink.unlocked;
  return { project: { ...written.project, ai_link: nextLink }, ambient: written.ambient };
}

/** Unlinked: every value stays as it is, and is this tool's from now on. */
export function unlinkProjectAi(project: Project): Project {
  if (!projectAiLinkOf(project)) return project;
  const { ai_link: _drop, ...rest } = project;
  void _drop;
  return rest;
}

/** A copy that takes its own name keeps the link, with the name taken over. */
export function projectAiAfterRename(project: Project, name: string): Project {
  const link = projectAiLinkOf(project);
  if (!link || !(AI_KEY.name in link.values) || sameProjectAiValue(link.values[AI_KEY.name], name)) return project;
  return unlockProjectAiField(project, AI_KEY.name);
}

/** The AI-Thermal project most of the project's components came from (04's links). */
export function suggestedAiProject(
  components: ReadonlyArray<{ provenance: { ai_link?: unknown; source_type?: string; source_project_id?: string | null } }>,
): string | null {
  const counts = new Map<string, number>();
  for (const component of components) {
    const link = component.provenance.ai_link as { project_id?: unknown } | undefined;
    const id =
      (link && typeof link.project_id === 'string' && link.project_id) ||
      (component.provenance.source_type === 'AIThermal' ? component.provenance.source_project_id : null);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [id, count] of counts) if (best == null || count > (counts.get(best) ?? 0)) best = id;
  return best;
}

/**
 * 5G-RRU computes with a different ambient than the one linked from AI-Thermal:
 * 01 says so under the scenario table (the user's rule: AI-Thermal's wins).
 */
export function rruAmbientMismatch(project: Pick<Project, 'ai_link'>): { ai: number; rru: number } | null {
  const link = projectAiLinkOf(project);
  if (!link || link.sources[AI_KEY.ambient] !== 'AI-Thermal' || link.rru_ambient_C == null) return null;
  const ai = link.values[AI_KEY.ambient];
  return typeof ai === 'number' && !sameProjectAiValue(ai, link.rru_ambient_C) ? { ai, rru: link.rru_ambient_C } : null;
}
