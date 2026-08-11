/**
 * Boundary validation — 06 §12.
 *
 * Errors block `Continue to 07`. Warnings and info do not: an assumption the
 * engineer can see is not the same as an incomplete model.
 *
 * A note on what is checked but should never fire: the boundary set is scanned
 * for solved values. Screen 06 must not carry a node temperature or an edge
 * heat flow (06 §12.1 last bullet), so if one ever appears it is a bug and the
 * screen says so rather than quietly passing it to Screen 07.
 */

import { buildDerivedPreview } from './calculations';
import type {
  BoundaryConditionProfile,
  BoundaryDerivedPreview,
  BoundaryPort,
  BoundaryValidationMessage,
  BoundaryValidationState,
  ScenarioBoundaryConditionSet,
} from './types';

const SOLVED_KEYS = [
  'temperature_C',
  'solvedTemperature_C',
  'heat_flow_W',
  'heatFlow_W',
  'delta_T_C',
  'deltaT_C',
];

function message(
  severity: BoundaryValidationMessage['severity'],
  id: string,
  message: string,
  messageZh: string,
  extra: Partial<BoundaryValidationMessage> = {},
): BoundaryValidationMessage {
  return { id, severity, message, message_zh: messageZh, ...extra };
}

function inUnitRange(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function positive(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export interface BoundaryValidationInput {
  set: ScenarioBoundaryConditionSet | null;
  ports: BoundaryPort[];
  hasTopology: boolean;
  hasScenario: boolean;
  /** Topology version currently saved by Screen 05. */
  topologyVersion: number;
}

export function validateBoundarySet(input: BoundaryValidationInput): BoundaryValidationState {
  const errors: BoundaryValidationMessage[] = [];
  const warnings: BoundaryValidationMessage[] = [];
  const infos: BoundaryValidationMessage[] = [];

  if (!input.hasTopology) {
    errors.push(
      message(
        'error',
        'NO_TOPOLOGY',
        'Boundary Conditions require a saved thermal graph topology.',
        '邊界條件需要 05 已儲存的熱網路拓樸。',
        { suggested_action: 'Return to 05 Thermal Path Builder.' },
      ),
    );
  }

  if (!input.hasScenario) {
    errors.push(
      message('error', 'NO_SCENARIO', 'No active scenario.', '尚未選擇作用中的情境。', {
        suggested_action: 'Create or select a scenario first.',
      }),
    );
  }

  const set = input.set;
  if (!set) {
    return { status: 'blocked', errors, warnings, infos };
  }

  if (set.network_topology_version !== input.topologyVersion) {
    warnings.push(
      message(
        'warning',
        'STALE_TOPOLOGY',
        'The thermal graph topology has changed since this boundary set was saved. Review boundary assignments before continuing to Screen 07.',
        '拓樸在此邊界條件儲存後已變更，請重新檢查指派後再進入 07。',
      ),
    );
  }

  const profileById = new Map(set.profiles.map((profile) => [profile.id, profile]));
  const assignmentsByPort = new Map(
    set.assignments.filter((a) => a.enabled).map((a) => [a.boundary_port_id, a]),
  );

  // --- Ambient -----------------------------------------------------------
  const dissipating = input.ports.filter((port) => port.dissipating);
  const everyPortIsFixedOrAdiabatic =
    dissipating.length > 0 &&
    dissipating.every((port) => {
      const profiles = (assignmentsByPort.get(port.id)?.profile_ids ?? [])
        .map((id) => profileById.get(id))
        .filter(Boolean) as BoundaryConditionProfile[];
      return (
        profiles.length > 0 &&
        profiles.every(
          (profile) =>
            profile.type === 'fixed_temperature_boundary' ||
            profile.type === 'adiabatic_symmetry',
        )
      );
    });

  if (set.ambient.external_ambient_C == null && !everyPortIsFixedOrAdiabatic) {
    errors.push(
      message(
        'error',
        'MISSING_AMBIENT',
        'External ambient temperature is required for this scenario.',
        '此情境缺少外部環境溫度。',
        { suggested_action: 'Enter the external ambient temperature in Scenario Environment.' },
      ),
    );
  }

  if (set.ambient.confidence === 'low') {
    warnings.push(
      message(
        'warning',
        'AMBIENT_LOW_CONFIDENCE',
        'Ambient temperature is recorded with low confidence.',
        '環境溫度的信心度為低。',
      ),
    );
  }

  // --- Ports -------------------------------------------------------------
  for (const port of input.ports) {
    const assignment = assignmentsByPort.get(port.id);
    const profiles = (assignment?.profile_ids ?? [])
      .map((id) => profileById.get(id))
      .filter(Boolean) as BoundaryConditionProfile[];

    if (port.dissipating && profiles.length === 0) {
      errors.push(
        message(
          'error',
          `PORT_UNASSIGNED_${port.id}`,
          `Boundary port "${port.name}" has no boundary condition.`,
          `邊界端口「${port.name}」尚未指定邊界條件。`,
          {
            boundary_port_id: port.id,
            suggested_action: 'Assign a convection, radiation, fixed-temperature or adiabatic profile.',
          },
        ),
      );
      continue;
    }

    if (profiles.length > 1) {
      const representations = new Set(profiles.map((profile) => profile.representation));
      if (representations.size > 1) {
        warnings.push(
          message(
            'warning',
            `PORT_MIXED_REPRESENTATION_${port.id}`,
            `Port "${port.name}" has profiles with different representations.`,
            `端口「${port.name}」的多個 profile 表示方式不一致。`,
            { boundary_port_id: port.id },
          ),
        );
      }
    }

    if (profiles.some((profile) => profile.type === 'adiabatic_symmetry')) {
      warnings.push(
        message(
          'warning',
          `PORT_ADIABATIC_${port.id}`,
          `Port "${port.name}" is intentionally adiabatic — no heat leaves here.`,
          `端口「${port.name}」被設為絕熱，此處不會有熱流出。`,
          { boundary_port_id: port.id },
        ),
      );
    }
  }

  // --- Profiles ----------------------------------------------------------
  for (const profile of set.profiles) {
    const p = profile.parameters;
    const id = profile.id;

    switch (profile.type) {
      case 'convection_to_ambient':
      case 'combined_convection_radiation': {
        if (!positive(p.h_W_m2K)) {
          errors.push(
            message(
              'error',
              `PROFILE_H_${id}`,
              `"${profile.name}": convection coefficient h must be a positive number.`,
              `「${profile.name}」的對流係數 h 必須為正數。`,
              { profile_id: id },
            ),
          );
        } else if (profile.confidence === 'low' && profile.source === 'manual') {
          warnings.push(
            message(
              'warning',
              `PROFILE_H_LOW_${id}`,
              `"${profile.name}": manual h entered with low confidence.`,
              `「${profile.name}」的手動 h 信心度為低。`,
              { profile_id: id },
            ),
          );
        }
        if (!positive(p.area_m2)) {
          errors.push(
            message(
              'error',
              `PROFILE_AREA_${id}`,
              `"${profile.name}": area must be a positive number.`,
              `「${profile.name}」的面積必須為正數。`,
              { profile_id: id },
            ),
          );
        }
        if (profile.type === 'combined_convection_radiation') {
          if (!inUnitRange(p.emissivity)) {
            errors.push(
              message(
                'error',
                `PROFILE_EMISSIVITY_${id}`,
                `"${profile.name}": emissivity must be between 0 and 1.`,
                `「${profile.name}」的發射率必須介於 0 與 1。`,
                { profile_id: id },
              ),
            );
          }
          if (!inUnitRange(p.viewFactor)) {
            errors.push(
              message(
                'error',
                `PROFILE_VIEWFACTOR_${id}`,
                `"${profile.name}": view factor must be between 0 and 1.`,
                `「${profile.name}」的視角因子必須介於 0 與 1。`,
                { profile_id: id },
              ),
            );
          }
        }
        break;
      }

      case 'radiation_to_surroundings': {
        if (!inUnitRange(p.emissivity)) {
          errors.push(
            message(
              'error',
              `PROFILE_EMISSIVITY_${id}`,
              `"${profile.name}": emissivity must be between 0 and 1.`,
              `「${profile.name}」的發射率必須介於 0 與 1。`,
              { profile_id: id },
            ),
          );
        }
        if (!inUnitRange(p.viewFactor)) {
          errors.push(
            message(
              'error',
              `PROFILE_VIEWFACTOR_${id}`,
              `"${profile.name}": view factor must be between 0 and 1.`,
              `「${profile.name}」的視角因子必須介於 0 與 1。`,
              { profile_id: id },
            ),
          );
        }
        if (!positive(p.area_m2)) {
          errors.push(
            message(
              'error',
              `PROFILE_AREA_${id}`,
              `"${profile.name}": area must be a positive number.`,
              `「${profile.name}」的面積必須為正數。`,
              { profile_id: id },
            ),
          );
        }
        if (p.surfaceReferenceTemperatureGuess_C == null) {
          warnings.push(
            message(
              'warning',
              `PROFILE_RAD_GUESS_${id}`,
              `"${profile.name}": radiation preview uses an assumed surface temperature. The real one is solved in Screen 07.`,
              `「${profile.name}」的輻射預覽採用假設的表面溫度，實際值由 07 求解。`,
              { profile_id: id },
            ),
          );
        }
        break;
      }

      case 'solar_load': {
        const required: Array<[string, string, (value: unknown) => boolean]> = [
          ['irradiance_W_m2', 'irradiance', positive],
          ['receivingArea_m2', 'receiving area', positive],
          ['absorptivity', 'absorptivity', inUnitRange],
          ['projectedAreaFactor', 'projected area factor', inUnitRange],
          ['shadingFactor', 'shading factor', inUnitRange],
        ];
        for (const [key, label, check] of required) {
          if (!check(p[key])) {
            errors.push(
              message(
                'error',
                `PROFILE_SOLAR_${key}_${id}`,
                `"${profile.name}": ${label} is missing or out of range.`,
                `「${profile.name}」的${label}缺少或超出範圍。`,
                { profile_id: id },
              ),
            );
          }
        }
        break;
      }

      case 'fixed_temperature_boundary': {
        if (typeof p.fixedTemperature_C !== 'number' || !Number.isFinite(p.fixedTemperature_C)) {
          errors.push(
            message(
              'error',
              `PROFILE_FIXED_T_${id}`,
              `"${profile.name}": a fixed temperature is required.`,
              `「${profile.name}」必須輸入固定溫度。`,
              { profile_id: id },
            ),
          );
        }
        break;
      }

      case 'adiabatic_symmetry': {
        if (!p.reason) {
          errors.push(
            message(
              'error',
              `PROFILE_ADIABATIC_REASON_${id}`,
              `"${profile.name}": an adiabatic boundary needs a stated reason.`,
              `「${profile.name}」的絕熱邊界必須說明理由。`,
              { profile_id: id },
            ),
          );
        }
        break;
      }

      case 'ambient_reservoir': {
        if (typeof p.temperature_C !== 'number') {
          errors.push(
            message(
              'error',
              `PROFILE_AMBIENT_T_${id}`,
              `"${profile.name}": a reference temperature is required.`,
              `「${profile.name}」必須輸入參考溫度。`,
              { profile_id: id },
            ),
          );
        }
        break;
      }

      case 'external_cfd_placeholder': {
        infos.push(
          message(
            'info',
            `PROFILE_CFD_${id}`,
            `"${profile.name}": FloTHERM parser deferred. The alias is stored for future import mapping only.`,
            `「${profile.name}」：FloTHERM 解析延後，別名僅供未來匯入對照使用。`,
            { profile_id: id },
          ),
        );
        break;
      }
    }

    // 06 §12.1 — a profile that claims a FloTHERM source while Screen 03 is
    // deferred must say it is metadata only, or it looks like imported data.
    if (
      profile.source === 'flotherm' &&
      profile.external_mappings?.import_status !== 'mapped_metadata_only' &&
      profile.external_mappings?.import_status !== 'deferred'
    ) {
      errors.push(
        message(
          'error',
          `PROFILE_FLOTHERM_STATUS_${id}`,
          `"${profile.name}" claims a FloTHERM source, but Screen 03 is deferred. Mark it as metadata only.`,
          `「${profile.name}」宣稱來源為 FloTHERM，但 Screen 03 尚未實作，請標示為僅中繼資料。`,
          { profile_id: id },
        ),
      );
    }

    // Solved values must never live in a boundary set.
    for (const key of SOLVED_KEYS) {
      if (p[key] != null) {
        errors.push(
          message(
            'error',
            `PROFILE_SOLVED_VALUE_${id}_${key}`,
            `"${profile.name}" carries a solved value ("${key}"). Screen 06 stores boundary inputs only.`,
            `「${profile.name}」含有求解結果（${key}），06 只儲存邊界輸入。`,
            { profile_id: id },
          ),
        );
      }
    }
  }

  // --- Site-level warnings ----------------------------------------------
  if ((set.site.wind_speed_m_s ?? 0) > 0 && set.site.convection_method === 'manual_h') {
    warnings.push(
      message(
        'warning',
        'WIND_WITH_MANUAL_H',
        'Wind speed is set but convection still uses a manual h. The wind value is recorded, not applied.',
        '已設定風速，但對流仍使用手動 h；風速只被記錄，不會自動套用。',
      ),
    );
  }

  if (set.site.solar_enabled) {
    const hasSolarProfile = set.profiles.some((profile) => profile.type === 'solar_load');
    const assignedSolar = set.assignments.some((assignment) =>
      assignment.profile_ids.some(
        (id) => profileById.get(id)?.type === 'solar_load' && assignment.enabled,
      ),
    );
    if (!hasSolarProfile || !assignedSolar) {
      warnings.push(
        message(
          'warning',
          'SOLAR_WITHOUT_SURFACE',
          'Solar load is enabled but no surface is assigned a solar profile.',
          '已啟用太陽負載，但沒有任何表面指派太陽 profile。',
        ),
      );
    }
  }

  // --- Informational notes ----------------------------------------------
  for (const preview of set.derived_preview) {
    if (preview.r_combined_C_per_W != null || preview.r_conv_C_per_W != null) {
      infos.push(
        message(
          'info',
          `PREVIEW_RTH_${preview.boundary_port_id}`,
          'Boundary Rth preview calculated (pre-solve boundary input only).',
          '已計算邊界熱阻預覽（僅為求解前的邊界輸入）。',
          { boundary_port_id: preview.boundary_port_id },
        ),
      );
    }
    if (preview.q_solar_W != null) {
      infos.push(
        message(
          'info',
          `PREVIEW_SOLAR_${preview.boundary_port_id}`,
          'Solar heat load preview calculated. It is stored separately from component power.',
          '已計算太陽熱負載預覽，並與元件功耗分開儲存。',
          { boundary_port_id: preview.boundary_port_id },
        ),
      );
    }
  }

  for (const assignment of set.assignments) {
    if (assignment.assignment_mode === 'generated_default') {
      infos.push(
        message(
          'info',
          `GENERATED_${assignment.id}`,
          'Profile generated from project defaults — review before solving.',
          '此 profile 由專案預設值產生，求解前請檢查。',
          { boundary_port_id: assignment.boundary_port_id },
        ),
      );
    }
  }

  const status: BoundaryValidationState['status'] =
    errors.length > 0 ? 'blocked' : warnings.length > 0 ? 'warnings' : 'ready_for_07';

  return { status, errors, warnings, infos };
}

/** Rebuilds every port's derived preview from the current profiles. */
export function buildAllPreviews(
  set: ScenarioBoundaryConditionSet,
  ports: BoundaryPort[],
): BoundaryDerivedPreview[] {
  const profileById = new Map(set.profiles.map((profile) => [profile.id, profile]));

  return ports.map((port) => {
    const assignment = set.assignments.find(
      (candidate) => candidate.boundary_port_id === port.id && candidate.enabled,
    );
    const profiles = (assignment?.profile_ids ?? [])
      .map((id) => profileById.get(id))
      .filter(Boolean) as BoundaryConditionProfile[];

    return buildDerivedPreview(port, profiles, {
      ambient_C: set.ambient.external_ambient_C,
    });
  });
}
