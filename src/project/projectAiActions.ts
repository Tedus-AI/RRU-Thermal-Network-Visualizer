/**
 * Screen 01's AI-Thermal link edits, across the two stores they touch: the
 * project (name, context, materials, the link) and the scenario store (the
 * Baseline's ambient). The pure logic is `domain/projectAiLink.ts`.
 */

import {
  baselineOf,
  relockProjectAiField,
  ROOM_TEMP_SCENARIO,
  roomTempScenarioName,
  unlinkProjectAi,
  unlockProjectAiField,
  type ProjectAiWrite,
} from '@/domain/projectAiLink';
import { createScenario } from '@/domain/project';
import { useProjectStore } from '@/data/projectStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { patchScenarioValues } from './scenarioEnvironment';

export function commitProjectAiWrite(write: ProjectAiWrite): void {
  useProjectStore.getState().applyAiLink(write.project);
  if (write.ambient == null) return;
  const baseline = baselineOf(useScenarioStore.getState().scenarios);
  if (baseline) patchScenarioValues(baseline.id, { ambient_C: write.ambient });
}

/** ✂ */
export function unlockProjectAi(key: string): void {
  const draft = useProjectStore.getState().draft;
  if (draft) useProjectStore.getState().applyAiLink(unlockProjectAiField(draft, key));
}

/** ↺ 改回 / 鎖回 */
export function relockProjectAi(key: string): void {
  const draft = useProjectStore.getState().draft;
  if (draft) commitProjectAiWrite(relockProjectAiField(draft, key));
}

export function unlinkProjectAiNow(): void {
  const draft = useProjectStore.getState().draft;
  if (draft) useProjectStore.getState().applyAiLink(unlinkProjectAi(draft));
}

/**
 * AI-Thermal's room-temperature condition as a scenario of this project (25 °C,
 * 功耗＝常溫 Pd). Not selected — the engineer stays on the scenario they were
 * on. Returns its name, or null when the project already has one.
 */
export function addRoomTempScenario(projectId: string): string | null {
  const store = useScenarioStore.getState();
  // The list in memory is empty or another project's only if no screen loaded
  // this one's; appending to it would overwrite this project's scenarios on persist.
  let scenarios = store.scenarios;
  if (projectId && (scenarios.length === 0 || scenarios.some((scenario) => scenario.project_id !== projectId))) {
    scenarios = store.loadFor(projectId);
  }
  if (scenarios.some((scenario) => scenario.power_basis === 'rt')) return null;
  const { name: _name, ...values } = ROOM_TEMP_SCENARIO;
  void _name;
  const scenario = createScenario(projectId, roomTempScenarioName(scenarios), values);
  store.replaceAll([...scenarios, scenario]);
  if (projectId) store.persist(projectId);
  return scenario.name;
}
