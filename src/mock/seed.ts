import { saveComponents, saveProject, saveScenarios } from '@/data/persistence';
import { DEMO_PROJECT_ID, demoComponents, demoProject, demoScenario } from './demoProject';

/**
 * Writes the 01 mock dataset to storage and returns its project id.
 * Exists so the populated states of Screen 01 can be reviewed before the
 * Screen 02 importer is built.
 */
export function seedDemoProject(): string {
  saveProject(demoProject());
  saveScenarios(DEMO_PROJECT_ID, [demoScenario()]);
  saveComponents(DEMO_PROJECT_ID, demoComponents());
  return DEMO_PROJECT_ID;
}
