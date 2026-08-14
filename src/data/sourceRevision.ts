import type { Scenario } from '@/domain/project';
import { hydrateSourceRevision, type SourceRevision } from '@/domain/revision';
import type { ThermalNetwork } from '@/thermal/types';

import { useComponentStore } from './componentStore';
import { loadComponentRevisions, loadProject } from './persistence';

/** Current authoritative clocks, independent of any previously produced result. */
export function currentSourceRevision(
  projectId: string,
  network: ThermalNetwork,
  scenario: Scenario | null | undefined,
): SourceRevision {
  const components = useComponentStore.getState();
  const componentRevisions =
    components.loaded_project_id === projectId
      ? components.revisions
      : loadComponentRevisions(projectId);

  return hydrateSourceRevision(
    {
      project_revision: loadProject(projectId)?.revision,
      ...componentRevisions,
      network_revision: network.revision,
      scenario_revision: scenario?.revision,
    },
    `${projectId}:${network.network_name}:${scenario?.id ?? 'no-scenario'}`,
  );
}
