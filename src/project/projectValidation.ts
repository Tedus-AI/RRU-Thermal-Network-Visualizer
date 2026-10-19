/**
 * Screen 01 validation — 01 §19.
 * Errors block creating the project.
 *
 * The informational warnings 01 §19 lists (customer, owner and description
 * empty; nothing imported; no FloTHERM) are not produced here any more. The
 * first three are said on the fields themselves, the import is a row of the
 * project progress panel, and FloTHERM is a deferred screen that has no business
 * raising a warning at all (AC-12).
 */

import {
  PROJECT_ID_PATTERN,
  SCENARIO_LIMITS,
  type Project,
  type Scenario,
} from '@/domain/project';

export interface FieldIssues {
  errors: Record<string, string>;
}

export function validateProjectForm(input: {
  project: Project;
  scenario: Scenario | null;
  isProjectIdTaken: (id: string) => boolean;
}): FieldIssues {
  const { project, scenario, isProjectIdTaken } = input;
  const errors: Record<string, string> = {};

  const name = project.project_name.trim();
  if (!name) {
    errors.project_name = '請填專案名稱。';
  } else if (name.length > 80) {
    errors.project_name = '專案名稱最多 80 字。';
  }

  const id = project.project_id.trim();
  if (!id) {
    errors.project_id = '請填專案代號。';
  } else if (!PROJECT_ID_PATTERN.test(id)) {
    errors.project_id = '專案代號限 3–64 字元：英數字、底線或連字號。';
  } else if (isProjectIdTaken(id)) {
    errors.project_id = `專案代號「${id}」已被使用。`;
  }

  if (scenario) {
    const { ambient_C, wind_mps, solar_W_m2, power_scale } = scenario;
    const { ambient_C: ambient, wind_mps: wind, solar_W_m2: solar, power_scale: scale } =
      SCENARIO_LIMITS;

    if (!Number.isFinite(ambient_C)) {
      errors.ambient_C = '請填環境溫度。';
    } else if (ambient_C < ambient.min || ambient_C > ambient.max) {
      errors.ambient_C = `環境溫度需介於 ${ambient.min}～${ambient.max} °C。`;
    }

    if (!Number.isFinite(wind_mps) || wind_mps < 0) {
      errors.wind_mps = '風速不可為負值。';
    } else if (wind_mps > wind.max) {
      errors.wind_mps = `風速最大 ${wind.max} m/s。`;
    }

    if (!Number.isFinite(solar_W_m2) || solar_W_m2 < 0) {
      errors.solar_W_m2 = '日照不可為負值。';
    } else if (solar_W_m2 > solar.max) {
      errors.solar_W_m2 = `日照最大 ${solar.max} W/m²。`;
    }

    if (!Number.isFinite(power_scale) || power_scale < 0) {
      errors.power_scale = '功耗倍率不可為負值。';
    } else if (power_scale > scale.max) {
      errors.power_scale = `功耗倍率最大 ${scale.max}。`;
    }

    if (!scenario.name.trim()) {
      errors.scenario_name = '請填情境名稱。';
    }
  }

  return { errors };
}
