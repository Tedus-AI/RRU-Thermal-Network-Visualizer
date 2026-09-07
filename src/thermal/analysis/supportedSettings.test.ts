/**
 * Settings restored from a project saved before the dead controls went.
 *
 * This is not a hypothetical migration. The STARKCORE project on disk was saved
 * with `target_metric: 'selected_node_temperature'` — a metric that silently
 * zeroed every candidate's improvement, which is why it is gone. Reopening that
 * project must land on a metric the screen can actually run, not leave a select
 * showing nothing while the store keeps the old value.
 */

import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_SCOPES,
  REDUCTION_LIMITS,
  TARGET_METRICS,
  defaultSettings,
  supportedSettings,
} from './analysisTypes';

describe('supportedSettings', () => {
  it('replaces a metric this build no longer offers', () => {
    const restored = supportedSettings({
      target_metric: 'selected_node_temperature',
    } as never);
    expect(restored.target_metric).toBe('worst_thermal_margin');
    expect(TARGET_METRICS).toContain(restored.target_metric);
  });

  it('replaces a scope this build no longer offers', () => {
    for (const dead of ['selected_component', 'selected_node_path', 'custom_selection']) {
      const restored = supportedSettings({ scope: dead } as never);
      expect(restored.scope).toBe('all_edges');
      expect(CANDIDATE_SCOPES).toContain(restored.scope);
    }
  });

  it('keeps a scope and metric that are still offered', () => {
    const restored = supportedSettings({
      scope: 'shared_structure',
      target_metric: 'worst_component_temperature',
      reduction_pct: 35,
    } as never);
    expect(restored.scope).toBe('shared_structure');
    expect(restored.target_metric).toBe('worst_component_temperature');
    expect(restored.reduction_pct).toBe(35);
  });

  it('clamps a reduction outside the control range', () => {
    expect(supportedSettings({ reduction_pct: 90 } as never).reduction_pct).toBe(
      REDUCTION_LIMITS.max,
    );
    expect(supportedSettings({ reduction_pct: 1 } as never).reduction_pct).toBe(
      REDUCTION_LIMITS.min,
    );
    expect(supportedSettings({ reduction_pct: Number.NaN } as never).reduction_pct).toBe(
      REDUCTION_LIMITS.default,
    );
  });

  it('drops filter keys that no longer exist and keeps the ones that do', () => {
    const restored = supportedSettings({
      filters: { edge_type: 'tim', sharing: 'shared', boundary: 'boundary' },
    } as never);
    expect(restored.filters.edge_type).toBe('tim');
    expect(restored.filters).not.toHaveProperty('sharing');
    expect(restored.filters).not.toHaveProperty('boundary');
  });

  it('returns the defaults for nothing at all', () => {
    expect(supportedSettings(null)).toEqual(defaultSettings());
    expect(supportedSettings(undefined)).toEqual(defaultSettings());
  });

  it('opens on the margin, which is what this screen is for', () => {
    expect(defaultSettings().target_metric).toBe('worst_thermal_margin');
  });
});
