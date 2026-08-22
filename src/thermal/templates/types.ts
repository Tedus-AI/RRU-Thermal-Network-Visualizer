/**
 * Architecture template definitions — 05 §9, §10, §11.
 *
 * A template is DATA, not a React component (05 §9). It declares node and edge
 * prototypes, the ports its subgraph exposes, and which parameters it needs.
 *
 * The hard rule (05 §10, §61): a template must never name a Main Base or any
 * other shared node. It ends at a PORT. Step 4 connects that port to a zone, so
 * the same template works for a single base, three zones or functional zones.
 */

import type { EdgeMethod, EdgeType, NodeType, PortKind } from '../types';

export interface NodePrototype {
  /** Stable role key within the subgraph, e.g. "JUNCTION", "CASE". */
  role: string;
  /** Label suffix; the instance name is prefixed, e.g. "PA1 Case". */
  label: string;
  labelZh: string;
  type: NodeType;
  /** True for the node that receives the component's dissipation. */
  heatSource?: boolean;
  /** Scenario-independent opening which Screen 06 can attach conditions to. */
  boundaryRole?: 'placeholder' | 'configured';
}

export interface EdgePrototype {
  fromRole: string;
  /** Either another node role, or a port this subgraph exposes. */
  toRole: string;
  type: EdgeType;
  method: EdgeMethod;
  label: string;
  labelZh: string;
  /**
   * Component fields this edge's parameters track by default (05 §28).
   * Key is the edge parameter, value is a path into the component record.
   */
  parameterLinks?: Record<string, string>;
  /** Parameters that must be known before the Rth can be computed. */
  requiredParameters?: string[];
}

export interface PortPrototype {
  kind: PortKind;
  label: string;
  labelZh: string;
  /** A required port left unconnected blocks Continue (05 §33). */
  required: boolean;
}

export interface ThermalTemplate {
  id: string;
  version: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  typicalUse: string[];
  nodes: NodePrototype[];
  edges: EdgePrototype[];
  ports: PortPrototype[];
  /** Component fields the template needs to compute its analytical resistances. */
  requiredComponentFields: Array<{ path: string; label: string; labelZh: string }>;
}

/** True when the target of an edge prototype is a port rather than a node. */
export function isPortTarget(template: ThermalTemplate, role: string): boolean {
  return template.ports.some((port) => port.kind === role);
}
