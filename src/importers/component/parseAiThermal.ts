/**
 * AI-Thermal project source — reads a project out of the shared `thermal_db.json`
 * that the AI-Thermal pad & stud tool and the 5G-RRU Volume tool write together,
 * and turns it into the same ParsedTable an existing-project import produces. One
 * pipeline: the same mapping, validation, review table and duplicate handling.
 *
 * WHAT CROSSES OVER
 * -----------------
 * The shared component record (`rf_data` / `digital_data` / `pwr_data`) plus the
 * AI-Thermal TH/ME page's `thermal_specs[specKey(name)]`, which holds the parts of
 * a component the shared record does not: its body size and height, its E-PAD,
 * the boss it sits under and the TIM gap. Where both say something, the TH/ME
 * page wins — it is where the engineer typed it; the shared record's
 * `Board_Type` / `Pad_*` are only derived from it at AI-Thermal's save, and are
 * stale until then.
 *
 *   Component                       → name
 *   rf / digital / pwr list         → category (Type `filter` → Filter)
 *   Qty, Power(W), Limit(C)         → qty, power, limit
 *   Limit_Ref (or the shared auto   → limit type, confirmed either way: AI-Thermal
 *   rule, `CompMerge.limitRef`)       owns it, so a change is made there and
 *                                     re-imported, not re-confirmed here
 *   R_jc (else θJC from `Rth`)      → Rjc. R_jc = 0 is how both tools say "no
 *                                     junction", and in this tool that is the
 *                                     surface/body source model, never an Rjc of 0
 *                                     (Screen 07 rejects a zero-resistance edge)
 *   heatDirection / Board_Type      → heat path (Copper Coin → Coin, Thermal Via →
 *                                     Board, IC top → TopSurface, Metal Face →
 *                                     DirectMetal; None → inferred)
 *   heatSourceSize / Height         → package L × W × H
 *   epadSize (or Pad_L/W from it)   → E-PAD, the source face of a board path
 *   pcb_thickness[RF|Digital|PWR]   → board thickness of a board path; else the
 *                                     5G-RRU row's Thick(mm), else its t_PCB
 *   thermal_specs[…].via (the        → the part's own via k (K_eff) with a process
 *   Thermal Via page's design)        efficiency of 1, through the shared
 *                                     `viaCalc.js`; no complete design → nothing
 *                                     stated, 01's generic via k applies. A round
 *                                     pad with no epadSize → the equal-area square
 *   TIM_Model / TIM_Type            → TIM, by NAME against this project's library
 *                                     (model first); None → dry metal contact
 *   icToHSK (the compressed gap)    → BLT, only where it differs from the material
 *   bossSize on a top-surface part  → remembered as the Pedestal mount's size, so
 *                                     picking "凸台" in Screen 04 starts from it;
 *                                     the mount itself stays Direct — AI-Thermal
 *                                     does not say whether the boss is modelled
 *   note (both pages)               → notes
 *   _excluded (5G-RRU 👁)            → arrives switched off, only when asked for
 *
 * Nothing here invents a value: a field the source does not state stays empty and
 * Screen 02 / 04 report it as missing, exactly as for a spreadsheet.
 *
 * TH/ME's `hidden_components` is NOT an exclusion. It hides rows from the
 * mechanical spec list (a via-cooled driver has no boss to spec), and treating it
 * as "excluded" would drop real heat sources.
 */

import {
  emptyArchitecturePrep,
  emptyMount,
  emptyThermalSpec,
  emptyTim,
  inferHeatPath,
  TEMPLATE_FOR_HEAT_PATH,
  type ComponentCategory,
  type HeatPathType,
  type LimitType,
  type ThermalSpec,
} from '@/domain/component';
import { BUILTIN_TIM_IDS, DIRECT_CONTACT_TIM_ID, type MaterialDefaults } from '@/domain/materials';
import { aiThermalViaKeff, aiThermalViaReason, equalAreaSide } from './aiThermalVia';
import { CARRIED_SPEC_COLUMN, type CarriedSpec } from './carriedSpec';
import { CANONICAL_FIELDS, type CanonicalField, type ParsedTable } from './types';

/** Where AI-Thermal keeps the shared database, inside the site's document library. */
export const AI_THERMAL_DB_PATH = 'ToolDatabase/thermal_db.json';

type Raw = Record<string, unknown>;
const isObj = (value: unknown): value is Raw =>
  value != null && typeof value === 'object' && !Array.isArray(value);

export interface AiThermalDb {
  projects: Record<string, Raw>;
  tim_library: Record<string, Raw>;
}

/** The parsed database, or null for anything that is not one. */
export function parseAiThermalDb(raw: unknown): AiThermalDb | null {
  if (!isObj(raw) || !isObj(raw.projects)) return null;
  return {
    projects: raw.projects as Record<string, Raw>,
    tim_library: isObj(raw.tim_library) ? (raw.tim_library as Record<string, Raw>) : {},
  };
}

/** AI-Thermal's three lists in its own order, with its own keys (`pcb_thickness` uses them). */
export const AI_THERMAL_LISTS = [
  { field: 'rf_data', key: 'RF', category: 'RF' },
  { field: 'digital_data', key: 'Digital', category: 'Digital' },
  { field: 'pwr_data', key: 'PWR', category: 'Power' },
] as const;
export type AiThermalList = (typeof AI_THERMAL_LISTS)[number]['key'];

const listOf = (project: Raw, field: string): Raw[] =>
  Array.isArray(project[field]) ? (project[field] as unknown[]).filter(isObj) : [];

// --- small parsers, the same rules as the two tools ------------------------------

const num = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const positive = (value: unknown): number | null => {
  const parsed = num(value);
  return parsed != null && parsed > 0 ? parsed : null;
};
const text = (value: unknown): string => (value == null ? '' : String(value).trim());
const cell = (value: number | null): string => (value == null ? '' : String(value));

/** AI-Thermal's `sgSpecKey`: the TH/ME page keys a component by its name, spaces and slashes swapped. */
export function aiThermalSpecKey(name: unknown): string {
  return String(name ?? '')
    .replace(/ /g, '_')
    .replace(/\//g, '-');
}

/** AI-Thermal's `sgParseLW`: "35*35", "7.3×5.3", "10x10" or a single "12". */
export function parseAiThermalSize(value: unknown): { L: number; W: number } | null {
  const t = text(value);
  if (!t) return null;
  const pair = t.match(/(\d+\.?\d*)\s*[×xX*]\s*(\d+\.?\d*)/);
  if (pair) {
    const L = Number(pair[1]);
    const W = Number(pair[2]);
    return L > 0 && W > 0 ? { L, W } : null;
  }
  const one = t.match(/^(\d+\.?\d*)$/);
  if (one && Number(one[1]) > 0) return { L: Number(one[1]), W: Number(one[1]) };
  return null;
}

/**
 * The limit reference, as both tools decide it (`CompMerge.limitRef` in the shared
 * `compMerge.js`). Repeated here rather than imported: that file belongs to the
 * other two repositories and is kept byte-identical between them.
 */
const LIMIT_REF_TC_TYPES = ['DDR', 'eMMC', 'SFP', 'GPS module', 'Power Modules', 'filter', 'CR'];
const LIMIT_REF_TJ_TYPES = [
  'Final PA',
  'Driver',
  'Pre-driver',
  'DC-DC',
  'LDO',
  'HOTSWAP',
  'Power MOSFET',
  'CLK IC',
  'CPU',
  'Baseband Processor',
  'CLK buffer',
  'Ethernet Transceiver',
  'retimer',
];
export function aiThermalLimitRef(comp: Raw, list: AiThermalList): { ref: 'Tj' | 'Tc'; auto: boolean } {
  const stated = comp.Limit_Ref;
  if (stated === 'Tj' || stated === 'Tc') return { ref: stated, auto: false };
  const type = text(comp.Type);
  if (LIMIT_REF_TC_TYPES.includes(type)) return { ref: 'Tc', auto: true };
  if (LIMIT_REF_TJ_TYPES.includes(type)) return { ref: 'Tj', auto: true };
  if (list === 'PWR') return { ref: 'Tc', auto: true };
  const name = text(comp.Component);
  if (/ddr/i.test(name) || /sfp|光模組/i.test(name)) return { ref: 'Tc', auto: true };
  return { ref: 'Tj', auto: true };
}

const HEAT_DIRECTIONS: Record<string, HeatPathType> = {
  'Copper Coin': 'Coin',
  'Thermal Via': 'Board',
  'IC top': 'TopSurface',
  // A baseplate, flange or filter body on the housing (AI-Thermal's 金屬散熱面).
  'Metal Face': 'DirectMetal',
};

/** θJC for the face heat leaves through, as AI-Thermal's `sgRjcFromRth` picks it. */
function rjcFromRth(comp: Raw, heatPath: HeatPathType): number | null {
  const rows = Array.isArray(comp.Rth) ? (comp.Rth as unknown[]).filter(isObj) : [];
  const jc = rows.filter((row) => (row.type === 'JC_top' || row.type === 'JC_bot') && positive(row.value) != null);
  const pick = (type: string) =>
    jc.filter((row) => row.type === type).sort((a, b) => Number(!!b.primary) - Number(!!a.primary))[0];
  const want = heatPath === 'TopSurface' ? 'JC_top' : 'JC_bot';
  const row = pick(want) ?? pick(want === 'JC_top' ? 'JC_bot' : 'JC_top');
  return row ? positive(row.value) : null;
}

// --- the table -----------------------------------------------------------------

/** Values this tool does not model, kept on the component's 來源 tab. */
const EXTRA_COLUMNS = [
  'AI-Thermal 元件類型',
  '常溫功耗 Pd@25°C(W)',
  '限溫對象',
  'TIM 型號',
  'Thermal Via 內徑(mil)',
  'Thermal Via 數量',
  'Thermal Via 等效 k',
  '凸台大小(mm)',
  '板厚來源',
] as const;
type ExtraColumn = (typeof EXTRA_COLUMNS)[number];

/**
 * Every canonical field leads, in canonical order, so `autoMapColumns` claims
 * them all before it reaches the preserved columns on the right.
 */
export const AI_THERMAL_HEADERS: string[] = [
  ...CANONICAL_FIELDS,
  '_ref_origin_project',
  '_ref_origin_id',
  CARRIED_SPEC_COLUMN,
  ...EXTRA_COLUMNS,
];

export interface AiThermalProjectSummary {
  id: string;
  name: string;
  /** ISO time of AI-Thermal's last save, when it recorded one. */
  updated: string;
  counts: Record<AiThermalList, number>;
  /** Components 5G-RRU has excluded (👁), in all and per list. */
  excluded: number;
  excludedBy: Record<AiThermalList, number>;
  pcb: Partial<Record<AiThermalList, number>>;
}

export function summarizeAiThermalProject(id: string, project: Raw): AiThermalProjectSummary {
  const counts = { RF: 0, Digital: 0, PWR: 0 } as Record<AiThermalList, number>;
  const excludedBy = { RF: 0, Digital: 0, PWR: 0 } as Record<AiThermalList, number>;
  const pcb: Partial<Record<AiThermalList, number>> = {};
  const thickness = isObj(project.pcb_thickness) ? project.pcb_thickness : {};
  for (const list of AI_THERMAL_LISTS) {
    const rows = listOf(project, list.field).filter((comp) => text(comp.Component));
    counts[list.key] = rows.length;
    excludedBy[list.key] = rows.filter((comp) => comp._excluded === true).length;
    const t = positive(thickness[list.key]);
    if (t != null) pcb[list.key] = t;
  }
  const meta = isObj(project.meta) ? project.meta : {};
  const excluded = excludedBy.RF + excludedBy.Digital + excludedBy.PWR;
  return { id, name: text(project.project_name) || id, updated: text(meta.timestamp), counts, excluded, excludedBy, pcb };
}

/** Every project in the database, by name. */
export function listAiThermalProjects(db: AiThermalDb): AiThermalProjectSummary[] {
  return Object.entries(db.projects)
    .filter(([, project]) => isObj(project))
    .map(([id, project]) => summarizeAiThermalProject(id, project))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
}

export interface AiThermalScope {
  lists: AiThermalList[];
  /** Include what 5G-RRU has excluded; they arrive switched off. */
  includeExcluded: boolean;
}

/** One component, mapped. Exposed for the tests and for the source panel's tally. */
export interface AiThermalMapped {
  cells: string[];
  name: string;
  excluded: boolean;
}

/** A name compared loosely: case, spaces and punctuation do not count ("T-Grease 2500" = "tgrease2500"). */
const looseKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');

/** AI-Thermal's TIM types and the built-in material a new project starts with for each. */
const BUILTIN_FOR_TYPE: Record<string, string> = {
  grease: BUILTIN_TIM_IDS.grease,
  pad: BUILTIN_TIM_IDS.pad,
  putty: BUILTIN_TIM_IDS.putty,
};

/**
 * Which of this project's materials an AI-Thermal component's TIM is.
 *
 * In order: the material linked to the same TIM Management Tool material as
 * AI-Thermal's model (`tim_library[].srcId` = `catalog.id`); a material named as
 * the model; one named as the type; the built-in material of that type, even
 * renamed. Names are compared loosely. A project that links its TIMs to the TIM
 * Management Tool renames them to the catalogue's names, which is how every TIM
 * used to arrive empty: only an exact "Grease" or model name matched.
 */
export function resolveAiThermalTim(
  comp: Raw,
  spec: Raw,
  db: AiThermalDb,
  materials: MaterialDefaults,
): {
  timType: string;
  timModel: string;
  direct: boolean;
  material: MaterialDefaults['tim'][number] | undefined;
  libraryRow: Raw | null;
} {
  const timType = text(spec.timType) || text(comp.TIM_Type);
  const timModel = text(spec.timModel) || text(comp.TIM_Model);
  const direct = timType === 'None';
  const rows = Object.values(db.tim_library).filter(isObj);
  const libraryRow = timModel
    ? (rows.find(
        (row) => looseKey(text(row.model)) === looseKey(timModel) && text(row.timType) === timType,
      ) ??
      rows.find((row) => looseKey(text(row.model)) === looseKey(timModel)) ??
      null)
    : null;
  if (direct || (!timType && !timModel)) return { timType, timModel, direct, material: undefined, libraryRow };

  const byName = (wanted: string) =>
    wanted ? materials.tim.find((m) => looseKey(m.name) === looseKey(wanted)) : undefined;
  const srcId = libraryRow ? text(libraryRow.srcId) : '';
  const builtin = BUILTIN_FOR_TYPE[timType.toLowerCase()];
  const material =
    (srcId ? materials.tim.find((m) => m.catalog?.id === srcId) : undefined) ??
    byName(timModel) ??
    byName(timType) ??
    (builtin ? materials.tim.find((m) => m.id === builtin) : undefined);
  return { timType, timModel, direct, material, libraryRow };
}

/** An AI-Thermal TIM model a project's components use that 01 has no material for. */
export interface AiThermalTimNeed {
  model: string;
  type: string;
  k: number | null;
  /** Compressed gap — this tool's bond line. */
  gap_mm: number | null;
  /** The TIM Management Tool material it is linked to there. */
  catalogId: string | null;
  /** Components that use it. */
  components: string[];
}

/** The TIM models the components in `scope` use that `materials` cannot resolve. */
export function missingAiThermalTims(
  db: AiThermalDb,
  projectId: string,
  materials: MaterialDefaults,
  scope: AiThermalScope = { lists: AI_THERMAL_LISTS.map((list) => list.key), includeExcluded: false },
): AiThermalTimNeed[] {
  const project = db.projects[projectId];
  if (!isObj(project)) return [];
  const specs: Raw = isObj(project.thermal_specs) ? project.thermal_specs : {};
  const needs = new Map<string, AiThermalTimNeed>();
  for (const list of AI_THERMAL_LISTS) {
    if (!scope.lists.includes(list.key)) continue;
    for (const comp of listOf(project, list.field)) {
      const name = text(comp.Component);
      if (!name || (!scope.includeExcluded && comp._excluded === true)) continue;
      const found = specs[aiThermalSpecKey(name)];
      const spec: Raw = isObj(found) ? found : {};
      const tim = resolveAiThermalTim(comp, spec, db, materials);
      if (tim.direct || tim.material || !(tim.timModel || tim.timType)) continue;
      const key = looseKey(tim.timModel || tim.timType);
      const entry = needs.get(key) ?? {
        model: tim.timModel || tim.timType,
        type: tim.timType,
        k: tim.libraryRow ? positive(tim.libraryRow.k) : null,
        gap_mm: tim.libraryRow ? positive(tim.libraryRow.gapThickness) : null,
        catalogId: tim.libraryRow ? text(tim.libraryRow.srcId) || null : null,
        components: [],
      };
      entry.components.push(name);
      needs.set(key, entry);
    }
  }
  return [...needs.values()];
}

export function mapAiThermalComponent(
  comp: Raw,
  list: (typeof AI_THERMAL_LISTS)[number],
  projectId: string,
  project: Raw,
  db: AiThermalDb,
  materials: MaterialDefaults,
): AiThermalMapped {
  const name = text(comp.Component);
  const specs: Raw = isObj(project.thermal_specs) ? project.thermal_specs : {};
  const specAt = (key: unknown): Raw | null => {
    const found = specs[aiThermalSpecKey(key)];
    return isObj(found) ? found : null;
  };
  // A part 5G-RRU renamed keeps its TH/ME row under the old name until AI-Thermal next saves.
  const spec: Raw = specAt(name) ?? (comp._renamed_from ? specAt(comp._renamed_from) : null) ?? {};
  const type = text(comp.Type);
  const category: ComponentCategory = type === 'filter' ? 'Filter' : list.category;

  // Heat path: the TH/ME page first, it is the source the shared field is derived from.
  const stated =
    HEAT_DIRECTIONS[text(spec.heatDirection)] ?? HEAT_DIRECTIONS[text(comp.Board_Type)] ?? null;
  const heatPath = stated ?? inferHeatPath(category);

  // Rjc. Zero means "no junction" in both source tools.
  const rjcStated = num(comp.R_jc);
  const body = rjcStated === 0;
  const rjc = body ? null : (positive(comp.R_jc) ?? rjcFromRth(comp, heatPath));

  const ref = aiThermalLimitRef(comp, list.key);
  // A body source has no junction to hold a Tj, and Screen 04 rejects the pair.
  const limitType: LimitType = body && ref.ref === 'Tj' ? 'Tc' : ref.ref;
  // Confirmed even when AI-Thermal decided it automatically (the user's call): the
  // reference belongs to AI-Thermal, which both tools read it from, so it is
  // changed there and imported again rather than re-confirmed part by part here.
  const limitConfirmed = true;
  const limitNote =
    `${limitType}（AI-Thermal ${ref.auto ? '自動判定' : '指定'}` +
    (limitType !== ref.ref ? `為 ${ref.ref}；Rjc 為 0 → 本體型熱源，改用 Tc` : '') +
    '）';

  // Geometry: the TH/ME page's sizes, else the shared pad when it says it came from them.
  const padL = positive(comp.Pad_L);
  const padW = positive(comp.Pad_W);
  const pad = padL != null && padW != null ? { L: padL, W: padW } : null;
  const pkg =
    parseAiThermalSize(spec.heatSourceSize) ?? (comp._pad_from === 'heatSourceSize' ? pad : null);
  const pkgH = positive(spec.heatSourceHeight);
  const globals: Raw = isObj(project.global_params) ? project.global_params : {};
  // The Thermal Via page's design, read by the same code as AI-Thermal and 5G-RRU.
  const via = heatPath === 'Board' ? aiThermalViaKeff(comp, specs, globals) : null;
  const viaK = via?.ok && via.keff != null ? Math.round(via.keff * 1000) / 1000 : null;
  const roundPad = via?.shape === 'circle' && via.D != null && via.D > 0 ? via.D : null;
  const statedEpad =
    parseAiThermalSize(spec.epadSize) ??
    (comp._pad_from === 'epadSize' || text(comp.Board_Type) === 'Thermal Via' ? pad : null);
  // The Thermal Via page may describe a round pad the TH/ME page never sized.
  const roundEpad =
    !statedEpad && roundPad != null ? { L: equalAreaSide(roundPad), W: equalAreaSide(roundPad) } : null;
  const epad = statedEpad ?? roundEpad;

  // Board thickness, only where a path conducts through the board.
  let boardT: number | null = null;
  let boardFrom = '';
  if (heatPath === 'Board') {
    const fromPcb = isObj(project.pcb_thickness) ? positive(project.pcb_thickness[list.key]) : null;
    const fromRow = text(comp.Board_Type) === 'Thermal Via' ? positive(comp['Thick(mm)']) : null;
    const fromGlobal = positive(globals.t_PCB);
    if (fromPcb != null) [boardT, boardFrom] = [fromPcb, `AI-Thermal ${list.key} PCB 板厚`];
    else if (fromRow != null) [boardT, boardFrom] = [fromRow, '5G-RRU 元件板厚'];
    else if (fromGlobal != null) [boardT, boardFrom] = [fromGlobal, '5G-RRU 參數 t_PCB'];
  }

  // TIM: this project's material for AI-Thermal's model (`resolveAiThermalTim`).
  const { timType, timModel, direct, material, libraryRow } = resolveAiThermalTim(comp, spec, db, materials);
  // Unmatched: the model's name, so the review says which one 01 is missing.
  const timName = direct ? '' : material ? material.name : timModel || timType;
  // The compressed gap IS the bond line (5G-RRU's t_Pad 1.7 is AI-Thermal's 1.7 gap,
  // not its 2.5 mm sheet). Stated only where it differs from the material's own.
  const gap = positive(spec.icToHSK);
  const libraryGap = libraryRow ? positive(libraryRow.gapThickness) : null;
  const blt = direct ? null : (gap ?? libraryGap);
  const bltCell = blt != null && material && material.blt_mm.value === blt ? null : blt;

  const boss = heatPath === 'TopSurface' ? parseAiThermalSize(spec.bossSize) : null;
  const packageType = type === 'filter' ? 'Cavity Filter' : type === 'Power Modules' ? 'Module' : '';

  const parameters: Record<string, string | number | boolean | null> =
    heatPath === 'DirectMetal'
      ? {
          source_model: body || category === 'Filter' ? 'SurfaceBodyBased' : 'JunctionBased',
          contact_geometry: 'FullBase',
          exposed_surface_enabled: false,
          exposed_area_mode: 'DerivedPackage',
        }
      : body
        ? { source_model: 'SurfaceBodyBased' }
        : {};
  // K_eff already holds the copper, fill and FR4 fractions → no further derate.
  if (viaK != null) Object.assign(parameters, { via_effective_k_W_mK: viaK, via_efficiency: 1 });
  const viaNote = !via
    ? ''
    : viaK != null
      ? [
          `${viaK} W/m·K（AI-Thermal via 設計，製程係數 1）`,
          ...(roundEpad ? [`圓形焊盤 Ø${roundPad} mm → E-PAD 用等面積方形 ${roundEpad.L} × ${roundEpad.W} mm`] : []),
          ...via.issues.map((issue) => `⚠ ${issue.text}`),
        ].join('；')
      : `用 01 的通用值：${aiThermalViaReason(via)}`;
  const thermal: ThermalSpec = {
    ...emptyThermalSpec(limitType, heatPath),
    limit_type_confirmed: limitConfirmed,
    heat_path: { type: heatPath, parameters },
    heat_path_confirmed: stated != null,
    tim: emptyTim(direct ? DIRECT_CONTACT_TIM_ID : null),
    mount: emptyMount('Direct'),
    ...(boss
      ? {
          mount_by_type: {
            Pedestal: { ...emptyMount('Pedestal'), contact_L_mm: boss.L, contact_W_mm: boss.W },
          },
        }
      : {}),
  };
  const excluded = comp._excluded === true;
  const notes = [text(comp.note), text(spec.note)].filter(Boolean).join('\n');
  const carried: CarriedSpec = {
    v: 1,
    thermal_spec: thermal,
    architecture_prep: { ...emptyArchitecturePrep(), template_preference: TEMPLATE_FOR_HEAT_PATH[heatPath] },
    enabled: !excluded,
    ...(notes ? { notes } : {}),
  };

  const canonical: Record<CanonicalField, string> = {
    Component: name,
    Qty: cell(num(comp.Qty)),
    'Power(W)': cell(num(comp['Power(W)'])),
    Category: category,
    'Limit(C)': cell(num(comp['Limit(C)'])),
    R_jc: cell(rjc),
    Package: packageType,
    Package_L: cell(pkg?.L ?? null),
    Package_W: cell(pkg?.W ?? null),
    Package_H: cell(pkgH),
    // Blank when inferred, so it reads as inferred in the review table.
    Heat_Path: stated ?? '',
    TIM_Type: timName,
    TIM_BLT: cell(bltCell),
    // Only a board path reads a stated face; the other paths take it off the package.
    Source_L: heatPath === 'Board' ? cell(epad?.L ?? null) : '',
    Source_W: heatPath === 'Board' ? cell(epad?.W ?? null) : '',
    'Thick(mm)': cell(boardT),
  };
  const extra: Record<ExtraColumn, string> = {
    'AI-Thermal 元件類型': type,
    '常溫功耗 Pd@25°C(W)': cell(num(comp['Power_RT(W)'])),
    限溫對象: limitNote,
    'TIM 型號': timModel,
    'Thermal Via 內徑(mil)': cell(positive(comp.TV_ID_mil)),
    'Thermal Via 數量': cell(positive(comp.TV_Qty)),
    'Thermal Via 等效 k': viaNote,
    '凸台大小(mm)': boss ? `${boss.L} × ${boss.W}` : '',
    板厚來源: boardFrom,
  };
  const cells = [
    ...CANONICAL_FIELDS.map((field) => canonical[field]),
    text(project.project_name) || projectId,
    text(comp._cid),
    JSON.stringify(carried),
    ...EXTRA_COLUMNS.map((column) => extra[column]),
  ];
  return { cells, name, excluded };
}

/** The selected project as a ParsedTable for the import pipeline. */
export function parseAiThermalProject(
  db: AiThermalDb,
  projectId: string,
  scope: AiThermalScope,
  /** THIS project's materials — the TIM is matched against them by name. */
  materials: MaterialDefaults,
): ParsedTable {
  const project = db.projects[projectId];
  if (!isObj(project)) throw new Error(`AI-Thermal 資料庫裡沒有專案「${projectId}」。`);
  const rows: string[][] = [];
  for (const list of AI_THERMAL_LISTS) {
    if (!scope.lists.includes(list.key)) continue;
    for (const comp of listOf(project, list.field)) {
      if (!text(comp.Component)) continue;
      const mapped = mapAiThermalComponent(comp, list, projectId, project, db, materials);
      if (mapped.excluded && !scope.includeExcluded) continue;
      rows.push(mapped.cells);
    }
  }
  return { headers: AI_THERMAL_HEADERS, rows, sourceName: text(project.project_name) || projectId };
}
