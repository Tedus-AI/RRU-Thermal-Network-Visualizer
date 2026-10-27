/**
 * Writing a scenario's environment from Screen 01.
 *
 * Screen 06 mirrors ambient, wind and solar into the active scenario's boundary
 * set; when that mirror takes the change, the scenario itself must not also
 * advance its revision or invalidate the solve a second time. The scenario
 * table and the AI-Thermal link (the Baseline's ambient) both write through here.
 */

import type { Scenario } from '@/domain/project';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useScenarioStore } from '@/data/scenarioStore';

export function patchScenarioValues(scenarioId: string, values: Partial<Scenario>): void {
  const boundaryValues = {
    ...(Object.hasOwn(values, 'ambient_C') ? { ambient_C: values.ambient_C } : {}),
    ...(Object.hasOwn(values, 'wind_mps') ? { wind_mps: values.wind_mps } : {}),
    ...(Object.hasOwn(values, 'solar_W_m2') ? { solar_W_m2: values.solar_W_m2 } : {}),
  };
  const synchronized =
    Object.keys(boundaryValues).length > 0
      ? useBoundaryStore.getState().syncScenarioDefaults(scenarioId, boundaryValues)
      : false;
  useScenarioStore
    .getState()
    .updateScenario(scenarioId, values, synchronized ? { skipRevision: true, skipInvalidate: true } : undefined);
}
