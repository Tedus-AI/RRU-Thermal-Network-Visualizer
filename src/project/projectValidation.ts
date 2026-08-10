/**
 * Screen 01 validation — 01 §19.
 * Errors block Save. Warnings are informational and never block (AC-12).
 */

import {
  PROJECT_ID_PATTERN,
  SCENARIO_LIMITS,
  type Project,
  type Scenario,
} from '@/domain/project';

export interface FieldIssues {
  errors: Record<string, string>;
  warnings: string[];
}

export function validateProjectForm(input: {
  project: Project;
  scenario: Scenario | null;
  isProjectIdTaken: (id: string) => boolean;
  componentCount: number;
  flothermMappingCount: number;
}): FieldIssues {
  const { project, scenario, isProjectIdTaken, componentCount, flothermMappingCount } = input;
  const errors: Record<string, string> = {};
  const warnings: string[] = [];

  const name = project.project_name.trim();
  if (!name) {
    errors.project_name = 'Project Name is required.';
  } else if (name.length > 80) {
    errors.project_name = 'Project Name must be 80 characters or fewer.';
  }

  const id = project.project_id.trim();
  if (!id) {
    errors.project_id = 'Project ID is required.';
  } else if (!PROJECT_ID_PATTERN.test(id)) {
    errors.project_id =
      'Project ID must be 3–64 characters using letters, digits, underscore or hyphen only.';
  } else if (isProjectIdTaken(id)) {
    errors.project_id = `Project ID "${id}" is already in use.`;
  }

  if (scenario) {
    const { ambient_C, wind_mps, solar_W_m2, power_scale } = scenario;

    if (!Number.isFinite(ambient_C)) {
      errors.ambient_C = 'Ambient Temperature must be a number.';
    } else if (
      ambient_C < SCENARIO_LIMITS.ambient_C.min ||
      ambient_C > SCENARIO_LIMITS.ambient_C.max
    ) {
      errors.ambient_C = `Ambient Temperature must be between ${SCENARIO_LIMITS.ambient_C.min} and ${SCENARIO_LIMITS.ambient_C.max} °C.`;
    }

    if (!Number.isFinite(wind_mps) || wind_mps < 0) {
      errors.wind_mps = 'Wind Speed cannot be negative.';
    } else if (wind_mps > SCENARIO_LIMITS.wind_mps.max) {
      errors.wind_mps = `Wind Speed must be ${SCENARIO_LIMITS.wind_mps.max} m/s or less.`;
    }

    if (!Number.isFinite(solar_W_m2) || solar_W_m2 < 0) {
      errors.solar_W_m2 = 'Solar Load cannot be negative.';
    } else if (solar_W_m2 > SCENARIO_LIMITS.solar_W_m2.max) {
      errors.solar_W_m2 = `Solar Load must be ${SCENARIO_LIMITS.solar_W_m2.max} W/m² or less.`;
    }

    if (!Number.isFinite(power_scale) || power_scale < 0) {
      errors.power_scale = 'Power Scale cannot be negative.';
    } else if (power_scale > SCENARIO_LIMITS.power_scale.max) {
      errors.power_scale = `Power Scale must be ${SCENARIO_LIMITS.power_scale.max} or less.`;
    }

    if (!scenario.name.trim()) {
      errors.scenario_name = 'Scenario Name is required.';
    }
  }

  if (!project.project_context.customer.trim()) warnings.push('Customer / Program is empty.');
  if (!project.project_context.owner.trim()) warnings.push('Project Owner is empty.');
  if (!project.project_context.description.trim()) warnings.push('Project Description is empty.');
  if (project.project_context.main_heat_rejection.length === 0) {
    warnings.push('No main heat rejection path selected.');
  }
  if (componentCount === 0) warnings.push('No hardware components imported yet.');
  if (flothermMappingCount === 0) warnings.push('No FloTHERM data imported (optional).');

  return { errors, warnings };
}
