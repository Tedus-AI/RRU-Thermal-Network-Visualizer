/**
 * TIM 型號目錄 — the TIM Management Tool's material library, as the other thermal tools read it.
 *
 * TIM materials are created in the TIM Management Tool (Tedus-AI/Project-TIM-management-tool). It keeps
 * a small read-only file next to its database on the shared SharePoint site,
 * `TIM_Manager/Database/tim_catalog.json`, holding material properties only:
 *
 *   { format: 'tim-catalog', version: 1, db_rev, updated_at,
 *     materials: [{ id, vendor, model, tim_type, type_label, family: 'Pad' | 'Putty' | 'Grease',
 *                   family_exact, k, k_method, avl_label, … }] }
 *
 * A project TIM here can be LINKED to one of them (`catalog.id`). Linked, the material's name and k
 * come from the TIM manager and follow it; the BLT stays the project's, because a bond line is a build
 * outcome, not a material property (see `TimMaterial`). Components reference the project material's
 * own `id`, so a name that changes in the TIM manager orphans nothing.
 *
 * Unknown stays unknown: a catalog entry without k leaves the project's k as it is rather than
 * writing a number nobody stated.
 */

import { sourced, type SourcedValue } from './sourcedValue';
import type { TimMaterial } from './materials';

export const TIM_CATALOG_PATH = 'TIM_Manager/Database/tim_catalog.json';

export type TimFamily = 'Pad' | 'Putty' | 'Grease';
const FAMILIES: readonly TimFamily[] = ['Pad', 'Putty', 'Grease'];

export interface TimCatalogMaterial {
  /** The TIM manager's material id — what a linked project material keeps. */
  id: string;
  vendor: string;
  model: string;
  family: TimFamily;
  /** False when the family is only a guess (phase change, graphite, tape, other). */
  family_exact: boolean;
  type_label: string;
  k: number | null;
  k_method: string;
  avl_label: string;
}

export interface TimCatalog {
  updated_at: string;
  materials: TimCatalogMaterial[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The file's content → a catalog, or null when it is not one. Entries without an id or model are left out. */
export function parseTimCatalog(raw: unknown): TimCatalog | null {
  if (!isObject(raw) || raw.format !== 'tim-catalog' || !Array.isArray(raw.materials)) return null;
  const materials: TimCatalogMaterial[] = [];
  for (const entry of raw.materials) {
    if (!isObject(entry)) continue;
    const id = text(entry.id);
    const model = text(entry.model);
    if (!id || !model) continue;
    const family = FAMILIES.includes(entry.family as TimFamily) ? (entry.family as TimFamily) : 'Pad';
    const k = typeof entry.k === 'number' && Number.isFinite(entry.k) && entry.k > 0 ? entry.k : null;
    materials.push({
      id,
      vendor: text(entry.vendor),
      model,
      family,
      family_exact: entry.family_exact !== false,
      type_label: text(entry.type_label),
      k,
      k_method: text(entry.k_method),
      avl_label: text(entry.avl_label),
    });
  }
  return { updated_at: text(raw.updated_at), materials };
}

/** "Vendor-B GF-750" — the name a linked project material carries. */
export function catalogMaterialName(material: TimCatalogMaterial): string {
  return [material.vendor, material.model].filter(Boolean).join(' ');
}

/** Where a linked k came from, for the provenance shown in review. */
export function catalogReference(material: TimCatalogMaterial): string {
  return ['TIM 管理工具', catalogMaterialName(material), material.k_method].filter(Boolean).join(' · ');
}

function catalogK(material: TimCatalogMaterial): SourcedValue<number> | null {
  if (material.k == null) return null;
  return sourced(material.k, 'Datasheet', { reference: catalogReference(material), confidence: 'medium' });
}

/** A typical bond line per family — shipped `Assumed`, so the screen shows nobody has chosen it yet. */
const DEFAULT_BLT_MM: Record<TimFamily, number> = { Grease: 0.05, Putty: 0.3, Pad: 0.5 };

/** A new project material linked to a catalog entry. */
export function timFromCatalog(material: TimCatalogMaterial, id: string): TimMaterial {
  return {
    id,
    name: catalogMaterialName(material),
    k_W_mK: catalogK(material) ?? sourced(1, 'Assumed', { confidence: 'low' }),
    blt_mm: sourced(DEFAULT_BLT_MM[material.family], 'Assumed', { confidence: 'low' }),
    catalog: { id: material.id },
  };
}

/** Link an existing project material (same name) instead of adding a second one. */
export function linkToCatalog(tim: TimMaterial, material: TimCatalogMaterial): TimMaterial {
  return { ...tim, catalog: { id: material.id } };
}

export interface CatalogChange {
  id: string;
  name: string;
  /** What changed, for the notice: "k 7.5 → 7.8", "名稱 A → B". */
  what: string[];
}

export interface CatalogFollow {
  /** The library after following; the same array when nothing changed. */
  tim: TimMaterial[];
  changed: CatalogChange[];
  /** Linked materials the TIM manager no longer has — kept as they are. */
  gone: string[];
}

/**
 * Linked materials take the catalog's name and k. Nothing else changes: the BLT and every
 * unlinked material stay as the engineer left them.
 */
export function followCatalog(tim: TimMaterial[], catalog: TimCatalog): CatalogFollow {
  const byId = new Map(catalog.materials.map((m) => [m.id, m]));
  const changed: CatalogChange[] = [];
  const gone: string[] = [];
  let any = false;
  const next = tim.map((material) => {
    if (!material.catalog) return material;
    const source = byId.get(material.catalog.id);
    if (!source) {
      gone.push(material.id);
      return material;
    }
    const what: string[] = [];
    let out = material;
    const name = catalogMaterialName(source);
    if (name && name !== material.name) {
      what.push(`名稱 ${material.name} → ${name}`);
      out = { ...out, name };
    }
    const k = catalogK(source);
    if (k && k.value !== material.k_W_mK.value) {
      what.push(`k ${material.k_W_mK.value ?? '—'} → ${k.value}`);
      out = { ...out, k_W_mK: k };
    }
    if (!what.length) return material;
    any = true;
    changed.push({ id: material.id, name, what });
    return out;
  });
  return { tim: any ? next : tim, changed, gone };
}

/** Same project material by name: "Vendor Model" or the bare model, case and spaces ignored. */
export function sameName(tim: TimMaterial, material: TimCatalogMaterial): boolean {
  const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const name = key(tim.name);
  return name === key(catalogMaterialName(material)) || name === key(material.model);
}
