import {
  saveAnalysis,
  saveBoundarySet,
  saveComponentRevisions,
  saveComponents,
  saveExportPayload,
  saveNetwork,
  saveProject,
  saveReportConfig,
  saveScenarios,
  saveSnapshot,
  saveSolution,
} from '@/data/persistence';
import {
  DEMO_PROJECT_ID,
  DEMO_SOURCE_PROJECT_ID,
  demoProject,
  demoScenario,
  demoSourceComponents,
  demoSourceProject,
} from './demoProject';
import { buildDemoGoldenFlow } from './demoGoldenFlow';

/**
 * Builds the analytical Golden Flow and writes every authoritative artifact to
 * storage so Screens 01-12 can be reviewed without manual data entry.
 * Screen 03 remains Deferred and receives no parser or synthetic CFD result.
 */
export async function seedDemoProject(): Promise<string> {
  const flow = await buildDemoGoldenFlow();

  saveProject(demoProject());
  saveScenarios(DEMO_PROJECT_ID, [demoScenario()]);
  saveComponents(DEMO_PROJECT_ID, flow.components);
  saveComponentRevisions(DEMO_PROJECT_ID, flow.componentRevisions);
  saveNetwork(DEMO_PROJECT_ID, flow.network);
  saveBoundarySet(DEMO_PROJECT_ID, flow.boundary);
  saveSolution(DEMO_PROJECT_ID, flow.solution);
  saveAnalysis(DEMO_PROJECT_ID, flow.analysis);
  saveSnapshot(DEMO_PROJECT_ID, flow.snapshot);
  saveReportConfig(DEMO_PROJECT_ID, flow.reportConfig);
  saveExportPayload(DEMO_PROJECT_ID, flow.reportPayload);

  // A second project so Screen 02's "Existing Project" source has real data to
  // read, including rows that collide with the demo project.
  saveProject(demoSourceProject());
  saveScenarios(DEMO_SOURCE_PROJECT_ID, [demoScenario(DEMO_SOURCE_PROJECT_ID)]);
  saveComponents(DEMO_SOURCE_PROJECT_ID, demoSourceComponents());
  saveComponentRevisions(DEMO_SOURCE_PROJECT_ID, {
    component_revision: 'rev:component:golden-demo-source-v1',
    solver_input_revision: 'rev:solver_input:golden-demo-source-v1',
    limit_revision: 'rev:limit:golden-demo-source-v1',
  });

  return DEMO_PROJECT_ID;
}
