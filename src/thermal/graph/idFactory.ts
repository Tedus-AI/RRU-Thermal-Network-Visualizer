/**
 * Stable graph IDs — 05 §38.
 *
 * IDs must survive a re-render, a reload and a rebuild. Random ids would break
 * layout persistence, template rebuild matching and every saved reference.
 */

const slug = (value: string): string =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** `NODE_<componentId>_<role>` for a single instance component. */
export function nodeId(componentId: string, role: string, instance?: string): string {
  return instance
    ? `NODE_${slug(componentId)}_${slug(instance)}_${slug(role)}`
    : `NODE_${slug(componentId)}_${slug(role)}`;
}

/** `EDGE_<componentId>_<fromRole>_<toRole>`. */
export function edgeId(
  componentId: string,
  fromRole: string,
  toRole: string,
  instance?: string,
): string {
  return instance
    ? `EDGE_${slug(componentId)}_${slug(instance)}_${slug(fromRole)}_${slug(toRole)}`
    : `EDGE_${slug(componentId)}_${slug(fromRole)}_${slug(toRole)}`;
}

export function zoneNodeId(zoneKey: string): string {
  return `NODE_ZONE_${slug(zoneKey)}`;
}

export function structureNodeId(key: string): string {
  return `NODE_${slug(key)}`;
}

export function structureEdgeId(fromId: string, toId: string, kind = 'LINK'): string {
  return `EDGE_${slug(kind)}_${fromId.replace(/^NODE_/, '')}_${toId.replace(/^NODE_/, '')}`;
}

/** Manual objects get a monotonic suffix so they never collide with generated ids. */
export function manualId(prefix: 'NODE' | 'EDGE', taken: Set<string>): string {
  let index = 1;
  let candidate = `${prefix}_MANUAL_${index}`;
  while (taken.has(candidate)) candidate = `${prefix}_MANUAL_${++index}`;
  return candidate;
}

/** Instance keys for a quantity representation — e.g. PA1..PA4, or PA_L / PA_R. */
export function instanceKeys(
  qty: number,
  model: 'AGGREGATE' | 'INDIVIDUAL' | 'GROUPED',
  groupCount = 2,
): string[] {
  if (model === 'AGGREGATE' || qty <= 1) return [''];
  if (model === 'INDIVIDUAL') {
    return Array.from({ length: qty }, (_, index) => `${index + 1}`);
  }
  // GROUPED — split as evenly as possible across the requested group count.
  const groups = Math.max(1, Math.min(groupCount, qty));
  return Array.from({ length: groups }, (_, index) => `G${index + 1}`);
}

/** How many physical devices a grouped instance stands for. */
export function instanceMultiplier(
  qty: number,
  model: 'AGGREGATE' | 'INDIVIDUAL' | 'GROUPED',
  instanceIndex: number,
  groupCount = 2,
): number {
  if (model === 'AGGREGATE' || qty <= 1) return qty;
  if (model === 'INDIVIDUAL') return 1;
  const groups = Math.max(1, Math.min(groupCount, qty));
  const base = Math.floor(qty / groups);
  const remainder = qty % groups;
  return base + (instanceIndex < remainder ? 1 : 0);
}
