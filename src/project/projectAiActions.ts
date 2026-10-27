/**
 * Screen 01's AI-Thermal link edits, across the two stores they touch: the
 * project (name, context, materials, the link) and the scenario store (the
 * Baseline's ambient). The pure logic is `domain/projectAiLink.ts`.
 */

import {
  baselineOf,
  relockProjectAiField,
  unlinkProjectAi,
  unlockProjectAiField,
  type ProjectAiWrite,
} from '@/domain/projectAiLink';
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
