/**
 * AI-Thermal's current components for one project, built exactly as Screen 02
 * would import them — the "fresh" side of 04's 「從 AI-Thermal 更新」
 * (`planAiUpdate` in `aiThermalLink.ts` compares them with the project).
 *
 * Every list and every component, the excluded ones too: an update has to tell
 * "excluded in 5G-RRU" (still there, arrives switched off) from "deleted".
 */

import type { Component } from '@/domain/component';
import type { MaterialDefaults } from '@/domain/materials';
import { autoMapColumns } from './autoMapColumns';
import { buildStagingRows } from './buildStagingRows';
import { componentsFromRows } from './applyImport';
import {
  AI_THERMAL_LISTS,
  parseAiThermalProject,
  summarizeAiThermalProject,
  type AiThermalDb,
} from './parseAiThermal';

export interface AiThermalFresh {
  name: string;
  /** AI-Thermal's last save of the project, when it recorded one. */
  savedAt: string | null;
  components: Component[];
}

export function freshAiThermalComponents(
  db: AiThermalDb,
  projectId: string,
  materials: MaterialDefaults,
  /** The project's own ids, so a component added from here does not collide. */
  existingIds: Iterable<string>,
  label: string,
): AiThermalFresh {
  const table = parseAiThermalProject(
    db,
    projectId,
    { lists: AI_THERMAL_LISTS.map((list) => list.key), includeExcluded: true },
    materials,
  );
  const rows = buildStagingRows({ table, mapping: autoMapColumns(table.headers), existingComponents: [] });
  const summary = summarizeAiThermalProject(projectId, db.projects[projectId]);
  const savedAt = summary.updated || null;
  return {
    name: summary.name,
    savedAt,
    components: componentsFromRows(
      rows,
      {
        source_type: 'AIThermal',
        source_project_id: projectId,
        source_project_name: summary.name,
        source_file: label,
        source_saved_at: savedAt,
      },
      materials,
      existingIds,
    ),
  };
}
