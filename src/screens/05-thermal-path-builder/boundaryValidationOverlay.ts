/**
 * Screen 05 owns topology validation; Screen 06 owns scenario boundary data.
 * This view-only overlay removes topology placeholders that the active Screen
 * 06 scenario has actually completed. It never writes boundary Rth into the
 * saved graph and therefore preserves the cross-screen ownership contract.
 */
import type {
  BoundaryConditionProfile,
  BoundaryPort,
  ScenarioBoundaryConditionSet,
} from '@/thermal/boundary/types';
import type { GraphValidationResult } from '@/thermal/graph/graphValidation';
import type { ThermalNetwork } from '@/thermal/types';

const NON_REJECTION_TYPES = new Set<BoundaryConditionProfile['type']>([
  'solar_load',
  'ambient_reservoir',
  'external_cfd_placeholder',
]);

function completedBoundaryEdges(
  ports: BoundaryPort[],
  set: ScenarioBoundaryConditionSet,
): Set<string> {
  // A global Screen 06 error means the scenario boundary problem is not ready,
  // even if one port's local Rth preview happens to be calculable.
  if (set.validation.errors.length > 0) return new Set();

  const profileById = new Map(set.profiles.map((profile) => [profile.id, profile]));
  const previewByPort = new Map(
    set.derived_preview.map((preview) => [preview.boundary_port_id, preview]),
  );
  const assignmentByPort = new Map(
    set.assignments
      .filter((assignment) => assignment.enabled)
      .map((assignment) => [assignment.boundary_port_id, assignment]),
  );
  const completed = new Set<string>();

  for (const port of ports) {
    if (!port.dissipating || !port.boundary_edge_id) continue;
    const assignment = assignmentByPort.get(port.id);
    const profiles = (assignment?.profile_ids ?? [])
      .map((profileId) => profileById.get(profileId))
      .filter((profile): profile is BoundaryConditionProfile => profile != null);
    const hasPhysicalCondition = profiles.some(
      (profile) => !NON_REJECTION_TYPES.has(profile.type),
    );
    const preview = previewByPort.get(port.id);
    if (hasPhysicalCondition && preview && preview.completeness !== 'blocked') {
      completed.add(port.boundary_edge_id);
    }
  }
  return completed;
}

export function applyBoundaryValidationOverlay(
  validation: GraphValidationResult | null,
  network: ThermalNetwork | null,
  ports: BoundaryPort[],
  set: ScenarioBoundaryConditionSet | null,
): GraphValidationResult | null {
  if (!validation || !network || !set) return validation;
  const completedEdges = completedBoundaryEdges(ports, set);
  if (completedEdges.size === 0) return validation;

  const completedPlaceholderNodes = new Set<string>();
  for (const node of Object.values(network.nodes)) {
    if (node.boundary_role !== 'placeholder') continue;
    const incidentBoundaryEdges = Object.values(network.edges)
      .filter(
        (edge) =>
          (edge.from === node.id || edge.to === node.id) &&
          (edge.method === 'convection_hA' || edge.method === 'radiation_hA'),
      )
      .map((edge) => edge.id);
    if (
      incidentBoundaryEdges.length > 0 &&
      incidentBoundaryEdges.every((edgeId) => completedEdges.has(edgeId))
    ) {
      completedPlaceholderNodes.add(node.id);
    }
  }

  const issues = validation.issues.filter((issue) => {
    if (issue.code === 'BOUNDARY_NOT_CONFIGURED' && issue.edgeId) {
      return !completedEdges.has(issue.edgeId);
    }
    if (issue.code === 'BOUNDARY_PLACEHOLDER' && issue.nodeId) {
      return !completedPlaceholderNodes.has(issue.nodeId);
    }
    return true;
  });
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  const info = issues.filter((issue) => issue.severity === 'info').length;
  return { issues, errors, warnings, info, canContinue: errors === 0 };
}
