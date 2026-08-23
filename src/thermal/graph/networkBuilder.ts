/**
 * Turns component preferences into a thermal subgraph — 05 §2, §7, §12.
 *
 * The three rules this module exists to enforce:
 *   1. a template ends at a PORT, never at a named shared node (05 §10);
 *   2. Qty × Power aggregates a SOURCE, it is never an edge heat flow (05 §7);
 *   3. an input the component does not have leaves the edge UNRESOLVED, never 0.
 */

import {
  coinAreaMm2,
  isDirectContact,
  isMeasuredInterface,
  resolveTim,
  type MaterialDefaults,
} from '@/domain/materials';
import {
  metalBaseExposedAreaMm2,
  metalBaseExposedSurfaceEnabled,
  metalBaseSourceModel,
  powerWOf,
  sourceAreaMm2,
  spreadAreaMm2,
  spreadingAreaMm2,
  type Component,
  UNASSIGNED_ZONE,
} from '@/domain/component';
import { valueOf } from '@/domain/sourcedValue';
import { createRth } from '../rth';
import {
  computeRth,
  scaleParametersForDevices,
  type EdgeParameters,
} from '../resistance/calculators';
import { getTemplate } from '../templates/templateRegistry';
import type { ThermalTemplate } from '../templates/types';
import { edgeId, instanceKeys, instanceMultiplier, nodeId } from './idFactory';
import type {
  ComponentTemplateBinding,
  EdgeMethod,
  PortKind,
  ThermalEdge,
  ThermalNode,
  ThermalPort,
} from '../types';

export type QtyModel = 'AGGREGATE' | 'INDIVIDUAL' | 'GROUPED';

export interface Subgraph {
  nodes: ThermalNode[];
  edges: ThermalEdge[];
  binding: ComponentTemplateBinding;
}

/**
 * Resolves one template parameter link to a number.
 *
 * A link names either a field on the component, a value DERIVED from it, or a
 * project constant the component inherits — a copper coin's conductivity is not
 * a property of the part, but the edge through the coin still needs it. All
 * three arrive by the same string path so `parameterLinks` stays a flat map.
 *
 * Was `readComponentField`, which stopped being true once project constants
 * became linkable.
 */
export function readLinkedInput(
  component: Component,
  path: string,
  materials: MaterialDefaults,
): number | null {
  // --- Project constants -------------------------------------------------
  switch (path) {
    case 'materials.copper_k_W_mK':
      return materials.copper_k_W_mK.value;
    case 'materials.via_effective_k_W_mK':
      return materials.via_effective_k_W_mK.value;
    case 'materials.via_efficiency':
      return materials.via_efficiency.value;
    case 'materials.solder_k_W_mK':
      return materials.solder_k_W_mK.value;
    case 'materials.solder_thickness_mm':
      return materials.solder_thickness_mm.value;
    case 'materials.solder_voiding':
      return materials.solder_voiding.value;
    // Ships empty by design, so this is the one project constant that can be
    // null — and a null length leaves the coin edge honestly unresolved.
    case 'materials.coin_thickness_mm':
      return materials.coin_thickness_mm?.value ?? null;
    case 'materials.contact_conductance_W_m2K':
      return materials.contact_conductance_W_m2K.value;
  }

  // --- Derived component values ------------------------------------------
  //
  // `contact_area` is the name already-stored networks use; it resolves to the
  // source face, which is what it always meant. Templates now name the face
  // they actually need, because a TIM crosses the spread face and a conduction
  // edge through a spreader sees neither face but the mean of the two.
  const geometry = component.thermal_spec.geometry;
  const heatPath = component.thermal_spec.heat_path.type;
  const coinArea = coinAreaMm2(materials);
  switch (path) {
    case 'thermal_spec.geometry.contact_area':
    case 'thermal_spec.geometry.source_area':
      return sourceAreaMm2(geometry, heatPath, component.thermal_spec.heat_path.parameters);
    case 'thermal_spec.geometry.spread_area':
      return spreadAreaMm2(
        geometry,
        heatPath,
        coinArea,
        component.thermal_spec.heat_path.parameters,
      );
    case 'thermal_spec.geometry.spreading_area':
      return spreadingAreaMm2(
        geometry,
        heatPath,
        coinArea,
        component.thermal_spec.heat_path.parameters,
      );
    case 'thermal_spec.heat_path.parameters.exposed_surface_area':
      return metalBaseExposedAreaMm2(component.thermal_spec);
    // TIM properties go through inheritance, so a component that never states
    // k or BLT still resolves against the project's material table. Reading the
    // stored field directly would have left every inherited TIM unresolved.
    case 'thermal_spec.tim.k_W_mK':
      return resolveTim(component.thermal_spec.tim, materials).k_W_mK;
    case 'thermal_spec.tim.thickness_mm':
      return resolveTim(component.thermal_spec.tim, materials).thickness_mm;
  }

  const parts = path.split('.');
  let cursor: unknown = component;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== 'object') return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  if (cursor == null) return null;
  if (typeof cursor === 'number') return Number.isFinite(cursor) ? cursor : null;
  if (typeof cursor === 'object' && 'value' in (cursor as object)) {
    const inner = (cursor as { value: unknown }).value;
    return typeof inner === 'number' && Number.isFinite(inner) ? inner : null;
  }
  return null;
}

/** Which component fields a template needs but this component does not have. */
export function missingRequirements(
  component: Component,
  template: ThermalTemplate,
  materials: MaterialDefaults,
): Array<{ path: string; label: string; labelZh: string }> {
  return template.requiredComponentFields.filter(
    (field) => readLinkedInput(component, field.path, materials) == null,
  );
}

function instanceLabel(component: Component, instance: string, model: QtyModel): string {
  if (!instance) return component.name;
  if (model === 'INDIVIDUAL') return `${component.name} ${instance}`;
  return `${component.name} ${instance}`;
}

/**
 * Builds one component's local subgraph.
 *
 * `power_W` on the source node is the dissipation this instance represents:
 * the whole component for AGGREGATE, one device for INDIVIDUAL, the group's
 * share for GROUPED. That is source aggregation and nothing more (05 §7).
 */
/**
 * What an interface edge actually is for this component.
 *
 * A template says "TIM here", but a component bolted straight to the casting
 * has no TIM: the joint is metal on metal and resolves through a contact
 * conductance, not a k and a thickness. That is a different formula, so the
 * method itself changes — faking it as a very thin pseudo-TIM would put an
 * invented thickness and conductivity into the report.
 *
 * Everything else passes through untouched.
 */
function effectiveEdgeSpec(
  proto: { type: string; method: EdgeMethod; parameterLinks?: Record<string, string> },
  component: Component,
): { method: EdgeMethod; parameterLinks: Record<string, string> } {
  const links = proto.parameterLinks ?? {};
  if (proto.type !== 'tim') {
    return { method: proto.method, parameterLinks: links };
  }
  if (isMeasuredInterface(component.thermal_spec.tim)) {
    return {
      method: 'direct_rth',
      parameterLinks: {
        R_C_per_W: 'thermal_spec.tim.measured_rth_C_per_W',
        // Retain the physical exit face even when the interface itself is a
        // measured resistance. The following HSK-base conduction still needs
        // this area for L/(kA).
        ...(links.area_mm2 ? { area_mm2: links.area_mm2 } : {}),
      },
    };
  }
  if (!isDirectContact(component.thermal_spec.tim)) {
    return { method: proto.method, parameterLinks: links };
  }
  return {
    method: 'contact_hc',
    parameterLinks: {
      h_c_W_m2K: 'materials.contact_conductance_W_m2K',
      // The joint spans the same face the TIM would have covered.
      area_mm2: links.area_mm2 ?? 'thermal_spec.geometry.spread_area',
    },
  };
}

/**
 * DIRECT_METAL is one user-facing template with two mutually-exclusive source
 * models. Materializing it here keeps the registry data-driven while ensuring
 * Screen 05 previews and generated graphs use the component's actual choice.
 */
export function templateForComponent(
  component: Component,
  templateId: string,
): ThermalTemplate | null {
  const base = getTemplate(templateId);
  if (!base || base.id !== 'DIRECT_METAL') return base;

  const template = structuredClone(base);
  const sourceModel = metalBaseSourceModel(component.thermal_spec);
  const exposed = metalBaseExposedSurfaceEnabled(component.thermal_spec);

  if (sourceModel === 'SurfaceBodyBased') {
    template.nodes = template.nodes
      .filter((node) => node.role !== 'JUNCTION')
      .map((node) =>
        node.role === 'METAL_BASE'
          ? {
              ...node,
              label: 'Body / Metal Base',
              labelZh: '本體／金屬底面',
              heatSource: true,
            }
          : node,
      );
    template.edges = template.edges.filter((edge) => edge.fromRole !== 'JUNCTION');
  }

  if (isDirectContact(component.thermal_spec.tim)) {
    template.nodes = template.nodes.map((node) =>
      node.role === 'TIM' ? { ...node, label: 'Contact', labelZh: '金屬接觸' } : node,
    );
  } else if (isMeasuredInterface(component.thermal_spec.tim)) {
    template.nodes = template.nodes.map((node) =>
      node.role === 'TIM' ? { ...node, label: 'Interface', labelZh: '實測介面' } : node,
    );
  }

  if (exposed) {
    template.nodes.push({
      role: 'EXTERNAL_AMBIENT',
      label: 'Ambient',
      labelZh: '周圍環境',
      type: 'ambient',
      boundaryRole: 'placeholder',
    });
    template.edges.push({
      fromRole: 'METAL_BASE',
      toRole: 'EXTERNAL_AMBIENT',
      type: 'convection',
      method: 'convection_hA',
      label: 'Exposed surface',
      labelZh: '暴露表面邊界',
      requiredParameters: ['boundary_conditions'],
    });
  }

  const requirements: ThermalTemplate['requiredComponentFields'] = [];
  if (sourceModel === 'JunctionBased') {
    requirements.push({
      path: 'thermal_spec.r_jc_C_per_W',
      label: 'Rjc',
      labelZh: '接面熱阻',
    });
  }
  if (isDirectContact(component.thermal_spec.tim)) {
    requirements.push({
      path: 'materials.contact_conductance_W_m2K',
      label: 'Contact h',
      labelZh: '接觸導熱係數',
    });
  } else if (isMeasuredInterface(component.thermal_spec.tim)) {
    requirements.push({
      path: 'thermal_spec.tim.measured_rth_C_per_W',
      label: 'Measured interface Rth',
      labelZh: '實測介面熱阻',
    });
  } else {
    requirements.push(
      { path: 'thermal_spec.tim.k_W_mK', label: 'Interface k', labelZh: '介面導熱係數' },
      {
        path: 'thermal_spec.tim.thickness_mm',
        label: 'Interface BLT',
        labelZh: '介面壓合厚度',
      },
    );
  }
  requirements.push({
    path: 'thermal_spec.geometry.source_area',
    label: 'Contact area',
    labelZh: '有效接觸面積',
  });
  if (exposed) {
    requirements.push({
      path: 'thermal_spec.heat_path.parameters.exposed_surface_area',
      label: 'Exposed area',
      labelZh: '暴露表面積',
    });
  }
  template.requiredComponentFields = requirements;
  return template;
}

export function buildComponentSubgraph(
  component: Component,
  options: {
    templateId: string;
    qtyModel: QtyModel;
    groupCount?: number;
    /** Suggested shared node for the primary port, from 04's preferred zone. */
    suggestedZoneNodeId?: string | null;
    /** Project constants the component inherits from. Required, never defaulted:
     *  falling back to the shipped values would quietly ignore a project that
     *  had changed them. */
    materials: MaterialDefaults;
  },
): Subgraph | null {
  const template = templateForComponent(component, options.templateId);
  if (!template) return null;

  const nodes: ThermalNode[] = [];
  const edges: ThermalEdge[] = [];
  const keys = instanceKeys(component.qty, options.qtyModel, options.groupCount);
  const perDevicePower = powerWOf(component);

  keys.forEach((instance, instanceIndex) => {
    const multiplier = instanceMultiplier(
      component.qty,
      options.qtyModel,
      instanceIndex,
      options.groupCount,
    );
    const label = instanceLabel(component, instance, options.qtyModel);

    const roleToId = new Map<string, string>();
    for (const proto of template.nodes) {
      const id = nodeId(component.id, proto.role, instance);
      roleToId.set(proto.role, id);

      nodes.push({
        id,
        name: `${label} ${proto.label}`,
        type: proto.type,
        component_ref: component.id,
        // Only the source node carries dissipation; every other node is passive.
        power_W: proto.heatSource ? perDevicePower * multiplier : 0,
        temperature_C: null,
        temperature_source: null,
        limit_C: proto.heatSource ? valueOf(component.thermal_spec.limit_C) : null,
        limit_type: proto.heatSource ? component.thermal_spec.limit_type : null,
        boundary_type: null,
        boundary_role: proto.boundaryRole,
        zone_id: null,
        ports: [],
        origin: {
          kind: 'template',
          template_id: template.id,
          template_version: template.version,
          component_id: component.id,
          modified: false,
        },
        metadata: {
          ...(instance ? { instance } : {}),
          devices_represented: multiplier,
          component_power_linked: proto.heatSource,
          component_limit_linked: proto.heatSource,
          ...(proto.heatSource && component.thermal_spec.limit_reference_note?.trim()
            ? { limit_reference_note: component.thermal_spec.limit_reference_note.trim() }
            : {}),
          ...(template.id === 'DIRECT_METAL' &&
          proto.role === 'METAL_BASE' &&
          metalBaseExposedSurfaceEnabled(component.thermal_spec)
            ? {
                boundary_surface_name: `${component.name} Exposed Surface`,
                boundary_area_mm2: metalBaseExposedAreaMm2(component.thermal_spec),
                boundary_orientation: 'mixed',
              }
            : {}),
        },
      });
    }

    // Ports live on the last node that feeds them, so the canvas can draw them.
    const portsByNode = new Map<string, ThermalPort[]>();

    for (const proto of template.edges) {
      const fromId = roleToId.get(proto.fromRole);
      if (!fromId) continue;

      const isPort = template.ports.some((port) => port.kind === proto.toRole);
      if (isPort) {
        const portDef = template.ports.find((port) => port.kind === proto.toRole)!;
        const list = portsByNode.get(fromId) ?? [];
        list.push({
          kind: portDef.kind,
          required: portDef.required,
          // The suggested zone is a suggestion only — Step 4 must confirm it
          // explicitly, never connect silently (05 §16).
          connected_to: null,
        });
        portsByNode.set(fromId, list);
        continue;
      }

      const toId = roleToId.get(proto.toRole);
      if (!toId) continue;

      const spec = effectiveEdgeSpec(proto, component);

      // Seed parameters from the component wherever the template links them,
      // then widen them to however many devices this instance stands for: the
      // source node already carries N devices' power, so the resistance beside
      // it has to be N joints wide or the junction rise is N times too high.
      const perDevice: EdgeParameters = {};
      for (const [param, path] of Object.entries(spec.parameterLinks)) {
        const value = readLinkedInput(component, path, options.materials);
        if (value != null) perDevice[param] = value;
      }
      const parameters = scaleParametersForDevices(spec.method, perDevice, multiplier);

      const computed = computeRth(spec.method, parameters);

      edges.push({
        id: edgeId(component.id, proto.fromRole, proto.toRole, instance),
        from: fromId,
        to: toId,
        type: proto.type,
        method: spec.method,
        rth: createRth(computed.value, 'Analytical', computed.value == null ? 'low' : 'medium'),
        parameters: parameters as ThermalEdge['parameters'],
        parameter_links: spec.parameterLinks,
        heat_flow_W: null,
        delta_T_C: null,
        resolution: computed.resolution,
        resolution_note:
          computed.note ??
          (computed.missing.length > 0
            ? `Missing input: ${computed.missing.join(', ')}`
            : undefined),
        enabled: true,
        origin: {
          kind: 'template',
          template_id: template.id,
          template_version: template.version,
          component_id: component.id,
          modified: false,
        },
        // Re-projection re-reads the component's own numbers, so it has to know
        // how many devices to widen them to all over again.
        metadata: { devices_represented: multiplier },
      });
    }

    for (const [id, ports] of portsByNode) {
      const node = nodes.find((candidate) => candidate.id === id);
      if (node) node.ports = ports;
    }
  });

  return {
    nodes,
    edges,
    binding: {
      component_id: component.id,
      template_id: template.id,
      template_version: template.version,
      qty_model: options.qtyModel,
      instances: keys,
      applied_at: new Date().toISOString(),
    },
  };
}

export interface GeneratePreview {
  components_modeled: number;
  components_skipped: number;
  nodes: number;
  edges: number;
  ports: number;
  needs_review: Array<{ component: string; missing: string[] }>;
}

/** Dry run for the "Generate from Component Preferences" flow (05 §49). */
export function previewGeneration(
  components: Component[],
  materials: MaterialDefaults,
): GeneratePreview {
  let nodes = 0;
  let edges = 0;
  let ports = 0;
  let modeled = 0;
  let skipped = 0;
  const needsReview: GeneratePreview['needs_review'] = [];

  for (const component of components) {
    if (!component.enabled) {
      skipped++;
      continue;
    }
    const templateId = component.architecture_prep.template_preference;
    const template = templateForComponent(
      component,
      templateId === 'UNASSIGNED' ? 'CUSTOM' : templateId,
    );
    if (!template) {
      skipped++;
      continue;
    }

    const subgraph = buildComponentSubgraph(component, {
      materials,
      templateId: template.id,
      qtyModel:
        component.architecture_prep.qty_model_preference === 'DECIDE_LATER'
          ? 'AGGREGATE'
          : (component.architecture_prep.qty_model_preference as QtyModel),
    });
    if (!subgraph) {
      skipped++;
      continue;
    }

    modeled++;
    nodes += subgraph.nodes.length;
    edges += subgraph.edges.length;
    ports += subgraph.nodes.reduce((sum, node) => sum + (node.ports?.length ?? 0), 0);

    const missing = missingRequirements(component, template, materials);
    if (missing.length > 0) {
      needsReview.push({
        component: component.name,
        missing: missing.map((field) => field.label),
      });
    }
  }

  return {
    components_modeled: modeled,
    components_skipped: skipped,
    nodes,
    edges,
    ports,
    needs_review: needsReview,
  };
}

/** Maps 04's preferred base zone onto a shared-structure zone node id. */
export function suggestedZoneFor(component: Component, zoneIds: string[]): string | null {
  const preferred = component.architecture_prep.preferred_base_zone;
  if (preferred === UNASSIGNED_ZONE) return null;
  // SINGLE_MAIN_BASE keeps MAIN_BASE as its persisted compatibility key, while
  // the corrected Screen 05 structure exposes the one physical NODE_HSK_BASE.
  if (preferred === 'MAIN_BASE') {
    const sharedHsk = zoneIds.find((id) => id.endsWith('HSK_BASE'));
    if (sharedHsk) return sharedHsk;
  }
  // The stored value IS the zone key now, so no name mangling: a renamed zone
  // used to break this link without saying anything.
  return zoneIds.find((id) => id.endsWith(preferred)) ?? null;
}

export const PORT_LABELS: Record<PortKind, { label: string; zh: string }> = {
  HEAT_OUT: { label: 'Heat Out', zh: '主要散熱出口' },
  BOARD_OUT: { label: 'Board Out', zh: '板級出口' },
  TOP_OUT: { label: 'Top Out', zh: '頂部出口' },
  HEAT_PIPE_OUT: { label: 'Heat Pipe Out', zh: '熱管出口' },
  DIRECT_BASE_OUT: { label: 'Direct Base Out', zh: '直接基座出口' },
};
