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

import {
  buildDerivedPreview,
  finArrayOf,
  plateConvectionOf,
  usesFinGeometry,
  usesPlateGeometry,
} from './calculations';
import { FIN_ASPECT_RATIO_BAND, finAspectRatioVerdict } from './finArray';
import { isFinnedSurfacePort } from './boundaryPorts';
import { OPEN_SURFACE_VIEW_FACTOR_FLOOR } from './flatPlate';
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

function isHeatRejectionProfile(profile: BoundaryConditionProfile): boolean {
  return ![
    'solar_load',
    'ambient_reservoir',
    'external_cfd_placeholder',
  ].includes(profile.type);
}

/**
 * "85 nodes / 84 edges", from the packed version `topologyVersionOf` produces.
 *
 * Worth unpacking rather than printing the raw number: it is what lets a reader
 * recognise their own edit — one edge fewer IS the heat pipe they just removed
 * — instead of being told only that something, somewhere, moved.
 */
function describeTopology(version: number): string {
  if (!Number.isFinite(version) || version <= 0) return 'unknown';
  return `${Math.floor(version / 1000)} nodes / ${version % 1000} edges`;
}

function isSolarActive(set: ScenarioBoundaryConditionSet): boolean {
  return set.site.solar_enabled && (set.site.solar_irradiance_W_m2 ?? 0) > 0;
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

  // --- topology drift ------------------------------------------------------
  // The stored version is a shape hash of the WHOLE graph, so it moves for any
  // edit anywhere — deleting a heat pipe on one component moved it, and the
  // screen then asked for a review of boundary assignments that the deletion
  // could not possibly have touched. A warning that fires on unrelated edits
  // teaches the reader to dismiss it, which is the opposite of its job.
  //
  // What the boundary set actually depends on is its PORTS. So the severity is
  // decided by whether any port it describes is gone: that orphans an
  // assignment and is worth stopping for. Everything else is a note saying the
  // graph moved and how to clear it.
  if (set.network_topology_version !== input.topologyVersion) {
    const livePortIds = new Set(input.ports.map((port) => port.id));
    const orphaned = set.assignments
      .filter((assignment) => assignment.enabled && !livePortIds.has(assignment.boundary_port_id))
      .map((assignment) => assignment.boundary_port_id);
    const drift = `${describeTopology(set.network_topology_version)} → ${describeTopology(input.topologyVersion)}`;

    if (orphaned.length > 0) {
      warnings.push(
        message(
          'warning',
          'STALE_TOPOLOGY',
          `The thermal graph changed since this boundary set was saved (${drift}), and ${orphaned.length} boundary port(s) it describes no longer exist: ${orphaned.join(', ')}. Review boundary assignments before continuing to Screen 07.`,
          `拓樸在此邊界條件儲存後已變更（${drift}），且其中 ${orphaned.length} 個邊界端口已不存在：${orphaned.join('、')}。請重新檢查指派後再進入 07。`,
          { suggested_action: 'Reassign or remove the orphaned boundary conditions, then save the boundary set.' },
        ),
      );
    } else {
      infos.push(
        message(
          'info',
          'STALE_TOPOLOGY',
          `The thermal graph changed since this boundary set was saved (${drift}), but every boundary port it describes still exists, so no assignment is affected.`,
          `拓樸在此邊界條件儲存後已變更（${drift}），但其描述的邊界端口都還在，指派不受影響。`,
          { suggested_action: 'Save Boundary Set to record that this topology was reviewed.' },
        ),
      );
    }
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
        .filter(
          (profile): profile is BoundaryConditionProfile =>
            profile != null && isHeatRejectionProfile(profile),
        );
      return (
        profiles.length > 0 &&
        profiles.every(
          (profile) =>
            profile.type === 'fixed_temperature_boundary' ||
            profile.type === 'adiabatic_symmetry',
        )
      );
    });

  if (
    (set.ambient.external_ambient_C == null ||
      !Number.isFinite(set.ambient.external_ambient_C)) &&
    !everyPortIsFixedOrAdiabatic
  ) {
    errors.push(
      message(
        'error',
        'MISSING_AMBIENT',
        'External ambient temperature is required for this scenario.',
        '此情境缺少外部環境溫度。',
        { suggested_action: 'Enter the external ambient temperature in Screen 01 Scenario Settings.' },
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
    const heatRejectionProfiles = profiles.filter(isHeatRejectionProfile);

    if (port.dissipating && heatRejectionProfiles.length === 0) {
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

    if (heatRejectionProfiles.length > 1) {
      const representations = new Set(
        heatRejectionProfiles.map((profile) => profile.representation),
      );
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

    if (heatRejectionProfiles.some((profile) => profile.type === 'adiabatic_symmetry')) {
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
  // Which surface each profile lands on. A finned port requires fin geometry,
  // so a profile assigned to one is validated as fin-derived whether or not it
  // carries the flag.
  const portByProfile = new Map<string, BoundaryPort>();
  for (const assignment of set.assignments) {
    if (!assignment.enabled) continue;
    const port = input.ports.find((entry) => entry.id === assignment.boundary_port_id);
    if (!port) continue;
    for (const profileId of assignment.profile_ids) portByProfile.set(profileId, port);
  }

  for (const profile of set.profiles) {
    const p = profile.parameters;
    const id = profile.id;
    const profilePort = portByProfile.get(id) ?? null;

    switch (profile.type) {
      case 'convection_to_ambient':
      case 'combined_convection_radiation': {
        // A fin-derived profile states geometry and computes h, the area and —
        // for the combined type — the radiation coefficient. Asking it for
        // those as well would demand the four numbers this mode exists to stop
        // anyone typing.
        // A finned surface still carrying an h and an area was described before
        // the geometry mode existed. It keeps solving — reinterpreting stored
        // numbers under a different model would be worse than leaving them —
        // but it is named, because those four values cannot be checked against
        // anything: there is no fin height they follow from.
        if (profilePort != null && isFinnedSurfacePort(profilePort) && !usesFinGeometry(profile, profilePort)) {
          warnings.push(
            message(
              'warning',
              `PROFILE_FIN_LEGACY_MANUAL_${id}`,
              `"${profile.name}" describes a finned surface with a stated h and area. Restate it as fin geometry so h, the radiation term, the fin efficiency and the wetted area follow from the heat sink.`,
              `「${profile.name}」以手動 h 與面積描述鰭片表面。請改以鰭片幾何描述，讓 h、輻射項、鰭片效率與散熱面積由散熱器本身推導。`,
              { profile_id: id },
            ),
          );
        }

        if (usesFinGeometry(profile, profilePort)) {
          const fin = finArrayOf(profile, profilePort);
          if (fin == null) {
            errors.push(
              message(
                'error',
                `PROFILE_FIN_GEOMETRY_${id}`,
                `"${profile.name}": the fin geometry is incomplete, so no boundary resistance can be computed. Base L and W, fin height, channel gap and fin thickness are all required.`,
                `「${profile.name}」的鰭片幾何不完整，無法計算邊界熱阻。底座長寬、鰭片高度、通道間距與鰭片厚度皆為必填。`,
                { profile_id: id },
              ),
            );
            break;
          }
          const verdict = finAspectRatioVerdict(fin.aspect_ratio);
          if (verdict !== 'inside') {
            warnings.push(
              message(
                'warning',
                `PROFILE_FIN_ASPECT_${id}`,
                `"${profile.name}": channel aspect ratio ${fin.aspect_ratio.toFixed(1)} is outside the ${FIN_ASPECT_RATIO_BAND.min}–${FIN_ASPECT_RATIO_BAND.max} band the h correlation was calibrated on, so h is being extrapolated.`,
                `「${profile.name}」的流阻比 ${fin.aspect_ratio.toFixed(1)} 超出 h 關聯式的校準範圍 ${FIN_ASPECT_RATIO_BAND.min}–${FIN_ASPECT_RATIO_BAND.max}，此處的 h 為外推值。`,
                { profile_id: id },
              ),
            );
          }
          // Above 1 it is not a fin efficiency at all — it is a residual
          // absorbing physics the fin model has no term for, and the largest
          // such term in THIS tool is computed separately as spreading
          // resistance. Left unflagged, the same heat gets credited twice.
          if ((fin.effectiveness ?? 0) > fin.eta_fin + 1e-9) {
            warnings.push(
              message(
                'warning',
                `PROFILE_FIN_PROCESS_${id}`,
                `"${profile.name}": a process factor above 1 makes the surface better than its own fin efficiency. It absorbs physics the fin model omits — and this tool computes spreading resistance separately, so the same heat may be credited twice.`,
                `「${profile.name}」的製程係數大於 1，使表面效能超過鰭片效率本身。它吸收的是鰭片模型缺少的物理量，而本工具另外計算擴散熱阻，可能重複計入。`,
                { profile_id: id },
              ),
            );
          }
          break;
        }
        // A plate-derived profile computes h, so it is not asked for one. What
        // it does need is the geometry that produces it.
        if (usesPlateGeometry(profile)) {
          if (plateConvectionOf(profile, set.ambient.external_ambient_C) == null) {
            errors.push(
              message(
                'error',
                `PROFILE_PLATE_GEOMETRY_${id}`,
                `"${profile.name}": the plate geometry is incomplete, so no convection coefficient can be computed. State the characteristic length, and the second side for a horizontal plate.`,
                `「${profile.name}」的平板幾何不完整，無法計算對流係數。請填寫特徵長度；水平板另需第二邊長。`,
                { profile_id: id },
              ),
            );
          }
        } else if (!positive(p.h_W_m2K)) {
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
          } else if (
            typeof p.viewFactor === 'number' &&
            p.viewFactor < OPEN_SURFACE_VIEW_FACTOR_FLOOR
          ) {
            // An outer wall sees sky and ground across most of its hemisphere,
            // so its view factor is near 1. A markedly low one is usually not a
            // view factor at all but an area ratio pushed into the only field
            // that would take it — worth naming, because it under-credits
            // radiation by the same factor and can look reasonable next to a
            // convection coefficient that is too high.
            warnings.push(
              message(
                'warning',
                `PROFILE_VIEWFACTOR_LOW_${id}`,
                `"${profile.name}": a view factor of ${p.viewFactor} is low for a surface open to the environment, where it is usually near 1. Check that it is a view factor and not an area ratio.`,
                `「${profile.name}」的視角因子 ${p.viewFactor} 對於面向開放環境的表面偏低（通常接近 1）。請確認它是視角因子，而不是被借用來表示面積比。`,
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
        // The profile is retained so a scenario can turn solar back on without
        // losing its projected-area and shading setup. At zero irradiance it is
        // inactive and must neither block validation nor inject heat.
        if (!isSolarActive(set)) break;
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
          warnings.push(
            message(
              'warning',
              `PROFILE_ADIABATIC_REASON_${id}`,
              `"${profile.name}": add a reason for audit traceability when practical.`,
              `「${profile.name}」可補充絕熱理由，方便日後稽核。`,
              { profile_id: id },
            ),
          );
        }
        break;
      }

      case 'ambient_reservoir': {
        // Legacy profile retained for data compatibility. Scenario
        // Environment owns the ambient reference and validation occurs there.
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
      // `temperature_C` is a legacy ambient-reservoir input name, not a solved
      // result for that profile type. Other profile types must still reject it.
      if (key === 'temperature_C' && profile.type === 'ambient_reservoir') continue;
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

  if (isSolarActive(set)) {
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
  } else if (set.profiles.some((profile) => profile.type === 'solar_load')) {
    infos.push(
      message(
        'info',
        'SOLAR_PROFILES_INACTIVE',
        'Solar profiles are retained but inactive because Screen 01 solar load is 0 W/m².',
        'SCR01 日照負載為 0 W/m²；太陽 profile 已保留但不參與計算。',
      ),
    );
  }

  // --- Informational notes ----------------------------------------------
  // Named per port. These lines used to carry no port at all, so a project with
  // two finished surfaces showed two identical rows and the panel read as if
  // something were wrong twice over rather than as two ports each being fine.
  const portNameById = new Map(input.ports.map((port) => [port.id, port.name]));
  for (const preview of set.derived_preview) {
    const portName = portNameById.get(preview.boundary_port_id) ?? preview.boundary_port_id;
    if (preview.r_combined_C_per_W != null || preview.r_conv_C_per_W != null) {
      infos.push(
        message(
          'info',
          `PREVIEW_RTH_${preview.boundary_port_id}`,
          `${portName}: boundary Rth preview calculated (pre-solve boundary input only).`,
          `${portName}：已計算邊界熱阻預覽（僅為求解前的邊界輸入）。`,
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
      .filter(Boolean)
      .filter(
        (profile) => isSolarActive(set) || profile?.type !== 'solar_load',
      ) as BoundaryConditionProfile[];

    return buildDerivedPreview(port, profiles, {
      ambient_C: set.ambient.external_ambient_C,
    });
  });
}
