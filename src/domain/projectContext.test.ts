import { describe, expect, it } from 'vitest';

import {
  DEPLOYMENTS_BY_PRODUCT,
  defaultDeploymentFor,
  defaultProjectContext,
  normalizeProjectContext,
  type ProjectContext,
} from './project';

/** A context as an older build would have written it into a project file. */
const LEGACY = {
  customer: 'Acme',
  owner: 'TC',
  description: 'legacy',
  product_type: 'Outdoor Radio',
  frequency_range: 'FR1',
  project_stage: 'Architecture',
  cooling_architecture: 'Heat Pipe Assisted',
  enclosure_type: 'Outdoor Sealed',
  main_heat_rejection: ['Rear Heat Sink', 'Housing Surface', 'Internal Fan'],
  base_architecture: 'Single Main Base',
  notes: 'kept',
} as unknown as Partial<ProjectContext>;

describe('normalizeProjectContext', () => {
  it('leaves a current context untouched', () => {
    const current = defaultProjectContext();
    expect(normalizeProjectContext(current)).toEqual(current);
  });

  it('fills an empty context with defaults', () => {
    expect(normalizeProjectContext({})).toEqual(defaultProjectContext());
  });

  // The folder is the source of truth, so a file from an older build must open.
  it('maps a legacy context onto the current option sets', () => {
    const result = normalizeProjectContext(LEGACY);

    expect(result.product_type).toBe('RRU');
    expect(result.project_stage).toBe('Prototype');
    expect(result.enclosure_type).toBe('Double-sided Cooling');
    expect(result.cooling_architecture).toEqual(['Heat Pipe']);
  });

  it('infers Outdoor from a legacy outdoor product type', () => {
    expect(normalizeProjectContext(LEGACY).deployment).toBe('Outdoor');
  });

  it('promotes a single cooling value to a list', () => {
    const result = normalizeProjectContext({
      cooling_architecture: 'Natural Convection',
    } as unknown as Partial<ProjectContext>);
    expect(result.cooling_architecture).toEqual(['Natural Convection']);
  });

  // Fan and heat pipe moved to the mechanism field; they are not surfaces.
  it('drops rejection entries that are now mechanisms, and merges the heat sinks', () => {
    const result = normalizeProjectContext(LEGACY);
    expect(result.main_heat_rejection).toEqual(['Finned Heat Sink', 'Flat Housing Surface']);
    expect(result.main_heat_rejection).not.toContain('Internal Fan');
  });

  it('keeps free text the user wrote', () => {
    const result = normalizeProjectContext(LEGACY);
    expect(result.customer).toBe('Acme');
    expect(result.notes).toBe('kept');
    expect(result.description).toBe('legacy');
  });

  it('falls back rather than showing a value no dropdown offers', () => {
    const result = normalizeProjectContext({
      product_type: 'Toaster',
      project_stage: 'Someday',
      frequency_range: 'FR9',
      enclosure_type: 'Cardboard',
      cooling_architecture: ['Wishful Thinking'],
    } as unknown as Partial<ProjectContext>);

    const base = defaultProjectContext();
    expect(result.product_type).toBe(base.product_type);
    expect(result.project_stage).toBe(base.project_stage);
    expect(result.frequency_range).toBe(base.frequency_range);
    expect(result.enclosure_type).toBe(base.enclosure_type);
    expect(result.cooling_architecture).toEqual(base.cooling_architecture);
  });

  it('never leaves a deployment the product type does not allow', () => {
    const result = normalizeProjectContext({
      product_type: 'AAU',
      deployment: 'Indoor',
    } as unknown as Partial<ProjectContext>);
    expect(result.deployment).toBe('Outdoor');
  });

  it('accepts FR2, which is now a real option', () => {
    const result = normalizeProjectContext({
      frequency_range: 'FR2',
    } as unknown as Partial<ProjectContext>);
    expect(result.frequency_range).toBe('FR2');
  });

  it('de-duplicates values that collapsed onto the same option', () => {
    const result = normalizeProjectContext({
      main_heat_rejection: ['Rear Heat Sink', 'Front Heat Sink', 'Side Heat Sink'],
    } as unknown as Partial<ProjectContext>);
    expect(result.main_heat_rejection).toEqual(['Finned Heat Sink']);
  });
});

describe('deployment constraints', () => {
  it('offers both installations only for an RRU', () => {
    expect(DEPLOYMENTS_BY_PRODUCT.RRU).toEqual(['Indoor', 'Outdoor']);
    expect(DEPLOYMENTS_BY_PRODUCT.AAU).toEqual(['Outdoor']);
    expect(DEPLOYMENTS_BY_PRODUCT['Small Cell']).toEqual(['Indoor']);
  });

  it('defaults to the only installation each product has', () => {
    expect(defaultDeploymentFor('AAU')).toBe('Outdoor');
    expect(defaultDeploymentFor('Small Cell')).toBe('Indoor');
  });
});
