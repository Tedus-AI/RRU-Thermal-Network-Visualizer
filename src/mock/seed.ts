import { saveComponents, saveProject, saveScenarios } from '@/data/persistence';
import {
  DEMO_PROJECT_ID,
  DEMO_SOURCE_PROJECT_ID,
  demoComponents,
  demoProject,
  demoScenario,
  demoSourceComponents,
  demoSourceProject,
} from './demoProject';

/**
 * Writes the 01 mock dataset to storage and returns its project id.
 * Exists so the populated states of Screen 01 can be reviewed before the
 * Screen 02 importer is built.
 */
export function seedDemoProject(): string {
  saveProject(demoProject());
  saveScenarios(DEMO_PROJECT_ID, [demoScenario()]);
  saveComponents(DEMO_PROJECT_ID, demoComponents());

  // A second project so Screen 02's "Existing Project" source has real data to
  // read, including rows that collide with the demo project.
  saveProject(demoSourceProject());
  saveScenarios(DEMO_SOURCE_PROJECT_ID, [demoScenario(DEMO_SOURCE_PROJECT_ID)]);
  saveComponents(DEMO_SOURCE_PROJECT_ID, demoSourceComponents());

  return DEMO_PROJECT_ID;
}
