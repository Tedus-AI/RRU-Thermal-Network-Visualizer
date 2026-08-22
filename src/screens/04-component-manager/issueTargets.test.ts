import { describe, expect, it } from 'vitest';

import { createComponent, emptyGeometry, type Component } from '@/domain/component';
import { statusOf, validateComponent } from '@/domain/componentReadiness';
import { confirmAction, groupIssues, issueTarget } from './issueTargets';

function component(patch: Partial<Component> = {}): Component {
  const base = createComponent({
    id: 'CMP_X',
    name: 'X',
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-01-01T00:00:00.000Z',
    },
  });
  return { ...base, ...patch };
}

/**
 * The point of the whole feature: a warning the user cannot be taken to is a
 * warning they cannot act on. This covers the shapes `validateComponent`
 * actually emits, so a new issue with no target fails here rather than silently
 * rendering as an inert sentence.
 */
describe('every issue leads somewhere', () => {
  it('targets every field a bare new component reports', () => {
    for (const issue of validateComponent(component())) {
      expect(issueTarget(issue.field), `no target for "${issue.field}"`).not.toBeNull();
    }
  });

  it('targets every field the error paths report', () => {
    const broken = component({
      name: '   ',
      qty: 0,
      power_W: { value: -5, source: 'Manual' },
    });
    broken.thermal_spec.r_jc_C_per_W = { value: -1, source: 'Manual' };
    broken.thermal_spec.limit_C = { value: -400, source: 'Manual' };
    broken.thermal_spec.geometry = {
      ...emptyGeometry(),
      package_L_mm: -1,
      package_W_mm: -1,
      package_H_mm: -1,
      source_L_mm: -1,
      source_W_mm: -1,
      board_thickness_mm: -1,
    };

    const issues = validateComponent(broken);
    expect(issues.length).toBeGreaterThan(10);
    for (const issue of issues) {
      expect(issueTarget(issue.field), `no target for "${issue.field}"`).not.toBeNull();
    }
  });

  it('targets the legacy-geometry review warning', () => {
    const legacy = component();
    legacy.thermal_spec.geometry = { ...emptyGeometry(), needs_review: true };
    const issue = validateComponent(legacy).find((entry) => entry.field === 'geometry.needs_review');
    expect(issue).toBeDefined();
    expect(issueTarget(issue!.field)?.confirm).toBe('geometry_review');
  });

  it('targets the manufacturer surface reference-location warning', () => {
    const module = component({ power_W: { value: 20, source: 'Datasheet' } });
    module.thermal_spec.heat_path = { type: 'ModuleSurface', parameters: {} };
    module.thermal_spec.limit_type = 'Ts';
    module.thermal_spec.limit_type_confirmed = true;
    const issue = validateComponent(module).find(
      (entry) => entry.field === 'limit_reference_note',
    );
    expect(issue).toBeDefined();
    expect(issueTarget(issue!.field)).toEqual({
      tab: 'thermal',
      fieldId: 'ins-limit-reference',
    });
  });

  // The two used to share the field name `geometry`, which named no control.
  it('keeps the two geometry warnings apart', () => {
    const both = component({ power_W: { value: 10, source: 'Manual' } });
    both.thermal_spec.geometry = { ...emptyGeometry(), needs_review: true };
    const fields = validateComponent(both).map((issue) => issue.field);
    expect(fields).toContain('geometry.source_L_mm');
    expect(fields).toContain('geometry.needs_review');
  });
});

describe('confirmAction', () => {
  it('confirms the limit type without touching the value', () => {
    const subject = component();
    subject.thermal_spec.limit_type = 'Tc';
    const action = confirmAction(subject, 'limit_type');
    expect(action.patch.thermal_spec?.limit_type_confirmed).toBe(true);
    // Confirmation records a decision; it must never change what was decided.
    expect(action.patch.thermal_spec?.limit_type).toBe('Tc');
    expect(action.label).toContain('Tc');
  });

  it('confirms the heat path without touching the path', () => {
    const subject = component();
    subject.thermal_spec.heat_path = { type: 'Coin', parameters: {} };
    const action = confirmAction(subject, 'heat_path');
    expect(action.patch.thermal_spec?.heat_path_confirmed).toBe(true);
    expect(action.patch.thermal_spec?.heat_path.type).toBe('Coin');
  });

  it('seeds the passive source model when a Filter confirms Metal Base + Interface', () => {
    const subject = component({ category: 'Filter' });
    subject.thermal_spec.heat_path = { type: 'DirectMetal', parameters: {} };

    const action = confirmAction(subject, 'heat_path');

    expect(action.patch.thermal_spec?.heat_path.type).toBe('DirectMetal');
    expect(action.patch.thermal_spec?.heat_path.parameters.source_model).toBe(
      'SurfaceBodyBased',
    );
    expect(action.patch.architecture_prep?.template_preference).toBe('DIRECT_METAL');
  });

  it('clears the legacy geometry review flag and nothing else', () => {
    const subject = component();
    subject.thermal_spec.geometry = {
      ...emptyGeometry(),
      source_L_mm: 12,
      needs_review: true,
    };
    const action = confirmAction(subject, 'geometry_review');
    expect(action.patch.thermal_spec?.geometry.needs_review).toBe(false);
    expect(action.patch.thermal_spec?.geometry.source_L_mm).toBe(12);
  });

  /**
   * Confirming is what makes a warning disappear, so the patch it produces must
   * actually clear the issue it was offered for.
   */
  it('produces a patch that removes the warning', () => {
    const subject = component();
    const before = validateComponent(subject).map((issue) => issue.field);
    expect(before).toContain('limit_type');

    const action = confirmAction(subject, 'limit_type');
    const after = validateComponent({ ...subject, ...action.patch } as Component);
    expect(after.map((issue) => issue.field)).not.toContain('limit_type');
  });
});

describe('groupIssues', () => {
  const ready = (): Component => {
    const subject = component({
      id: 'CMP_OK',
      name: 'OK',
      power_W: { value: 10, source: 'Datasheet' },
    });
    subject.thermal_spec = {
      ...subject.thermal_spec,
      limit_type_confirmed: true,
      limit_C: { value: 125, source: 'Datasheet' },
      r_jc_C_per_W: { value: 0.3, source: 'Datasheet' },
      package_type: 'BGA',
      heat_path_confirmed: true,
      tim: { ...subject.thermal_spec.tim, tim_id: 'TIM_GREASE' },
      geometry: { ...emptyGeometry(), source_L_mm: 10, source_W_mm: 10 },
    };
    subject.architecture_prep.template_preference = 'BOTTOM_COOL_VIA';
    subject.architecture_prep.preferred_base_zone = 'Digital';
    return subject;
  };

  it('leaves out components that have nothing to fix', () => {
    const clean = ready();
    expect(statusOf(clean)).toBe('READY');
    expect(groupIssues([clean], validateComponent)).toEqual([]);
  });

  // A disabled component never reaches Screen 05, so its gaps are not a task.
  it('leaves out disabled components', () => {
    expect(groupIssues([component({ enabled: false })], validateComponent)).toEqual([]);
  });

  it('puts components with errors before components with only warnings', () => {
    const warned = component({ id: 'CMP_WARN', name: 'Warn' });
    const errored = component({ id: 'CMP_ERR', name: 'Err', qty: 0 });
    const groups = groupIssues([warned, errored], validateComponent);
    expect(groups.map((group) => group.component.id)).toEqual(['CMP_ERR', 'CMP_WARN']);
    expect(groups[0].errors).toBeGreaterThan(0);
    expect(groups[1].errors).toBe(0);
  });
});
