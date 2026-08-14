/**
 * Turns component preferences into a thermal subgraph — 05 §2, §7, §12.
 *
 * The three rules this module exists to enforce:
 *   1. a template ends at a PORT, never at a named shared node (05 §10);
 *   2. Qty × Power aggregates a SOURCE, it is never an edge heat flow (05 §7);
 *   3. an input the component does not have leaves the edge UNRESOLVED, never 0.
 */

import {
  contactAreaMm2,
  powerWOf,
  type Component,
} from '@/domain/component';
import { valueOf } from '@/domain/sourcedValue';
import { createRth } from '../rth';
import { computeRth, type EdgeParameters } from '../resistance/calculators';
import { getTemplate } from '../templates/templateRegistry';
import type { ThermalTemplate } from '../templates/types';
import { edgeId, instanceKeys, instanceMultiplier, nodeId } from './idFactory';
import type {
  ComponentTemplateBinding,
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

/** Reads a dotted path out of a component, unwrapping SourcedValue as needed. */
export function readComponentField(component: Component, path: string): number | null {
  if (path === 'thermal_spec.geometry.contact_area') {
    return contactAreaMm2(component.thermal_spec.geometry);
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
): Array<{ path: string; label: string; labelZh: string }> {
  return template.requiredComponentFields.filter(
    (field) => readComponentField(component, field.path) == null,
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
export function buildComponentSubgraph(
  component: Component,
  options: {
    templateId: string;
    qtyModel: QtyModel;
    groupCount?: number;
    /** Suggested shared node for the primary port, from 04's preferred zone. */
    suggestedZoneNodeId?: string | null;
  },
): Subgraph | null {
  const template = getTemplate(options.templateId);
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
        limit_type: proto.heatSource ? component.thermal_spec.limit_type as never : null,
        boundary_type: null,
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

      // Seed parameters from the component wherever the template links them.
      const parameters: EdgeParameters = {};
      for (const [param, path] of Object.entries(proto.parameterLinks ?? {})) {
        const value = readComponentField(component, path);
        if (value != null) parameters[param] = value;
      }

      const computed = computeRth(proto.method, parameters);

      edges.push({
        id: edgeId(component.id, proto.fromRole, proto.toRole, instance),
        from: fromId,
        to: toId,
        type: proto.type,
        method: proto.method,
        rth: createRth(computed.value, 'Analytical', computed.value == null ? 'low' : 'medium'),
        parameters: parameters as ThermalEdge['parameters'],
        parameter_links: proto.parameterLinks,
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
export function previewGeneration(components: Component[]): GeneratePreview {
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
    const template = getTemplate(templateId === 'UNASSIGNED' ? 'CUSTOM' : templateId);
    if (!template) {
      skipped++;
      continue;
    }

    const subgraph = buildComponentSubgraph(component, {
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

    const missing = missingRequirements(component, template);
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
export function suggestedZoneFor(
  component: Component,
  zoneIds: string[],
): string | null {
  const preferred = component.architecture_prep.preferred_base_zone;
  if (preferred === 'Unassigned' || preferred === 'Custom') return null;
  const key = preferred.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return zoneIds.find((id) => id.endsWith(key)) ?? null;
}

export const PORT_LABELS: Record<PortKind, { label: string; zh: string }> = {
  HEAT_OUT: { label: 'Heat Out', zh: '主要散熱出口' },
  BOARD_OUT: { label: 'Board Out', zh: '板級出口' },
  TOP_OUT: { label: 'Top Out', zh: '頂部出口' },
  HEAT_PIPE_OUT: { label: 'Heat Pipe Out', zh: '熱管出口' },
  DIRECT_BASE_OUT: { label: 'Direct Base Out', zh: '直接基座出口' },
};
