/**
 * Where does a validation issue get fixed?
 *
 * `validateComponent` names the field an issue is about; this maps that name to
 * the inspector tab and the DOM id of the control that owns it, so a warning can
 * be a button that takes the user straight there instead of a sentence they have
 * to act on themselves.
 *
 * Every field `validateComponent` can emit must appear here. A missing entry
 * means a warning the user cannot reach, which is worse than no warning at all —
 * `issueTargets.test.ts` asserts the map stays complete.
 */

import type { Component } from '@/domain/component';
import type { ComponentIssue } from '@/domain/componentReadiness';

export type InspectorTab =
  | 'overview'
  | 'thermal'
  | 'geometry'
  | 'architecture'
  | 'source'
  | 'external';

/**
 * Some issues are not "a value is missing" but "nobody has said this guess is
 * right". Those are cleared by confirming, so the issue row can offer that
 * directly rather than sending the user to re-pick the value it already shows.
 */
export type ConfirmKind = 'limit_type' | 'heat_path' | 'geometry_review';

export interface IssueTarget {
  tab: InspectorTab;
  /** DOM id of the control to focus. */
  fieldId: string;
  confirm?: ConfirmKind;
}

const TARGETS: Record<string, IssueTarget> = {
  name: { tab: 'overview', fieldId: 'ins-name' },
  qty: { tab: 'overview', fieldId: 'ins-qty' },
  power_W: { tab: 'overview', fieldId: 'ins-power' },
  notes: { tab: 'overview', fieldId: 'ins-notes' },

  limit_type: { tab: 'thermal', fieldId: 'ins-limit-type', confirm: 'limit_type' },
  limit_C: { tab: 'thermal', fieldId: 'ins-limit' },
  r_jc_C_per_W: { tab: 'thermal', fieldId: 'ins-rjc' },
  package_type: { tab: 'thermal', fieldId: 'ins-package' },
  'tim.tim_id': { tab: 'thermal', fieldId: 'ins-tim' },
  'tim.blt_mm': { tab: 'thermal', fieldId: 'ins-blt' },
  'heat_path.type': { tab: 'thermal', fieldId: 'ins-heat-path', confirm: 'heat_path' },

  'geometry.package_L_mm': { tab: 'geometry', fieldId: 'geo-package_L_mm' },
  'geometry.package_W_mm': { tab: 'geometry', fieldId: 'geo-package_W_mm' },
  'geometry.package_H_mm': { tab: 'geometry', fieldId: 'geo-package_H_mm' },
  'geometry.source_L_mm': { tab: 'geometry', fieldId: 'geo-source_L_mm' },
  'geometry.source_W_mm': { tab: 'geometry', fieldId: 'geo-source_W_mm' },
  'geometry.spread_L_mm': { tab: 'geometry', fieldId: 'geo-spread_L_mm' },
  'geometry.spread_W_mm': { tab: 'geometry', fieldId: 'geo-spread_W_mm' },
  'geometry.board_thickness_mm': { tab: 'geometry', fieldId: 'geo-board_thickness_mm' },
  'geometry.needs_review': {
    tab: 'geometry',
    fieldId: 'geo-source_L_mm',
    confirm: 'geometry_review',
  },

  architecture_prep: { tab: 'architecture', fieldId: 'ins-zone' },
};

export function issueTarget(field: string): IssueTarget | null {
  return TARGETS[field] ?? null;
}

/** Exposed so a test can prove no issue field is left unreachable. */
export const ISSUE_TARGET_FIELDS = Object.keys(TARGETS);

export interface ConfirmAction {
  label: string;
  labelZh: string;
  patch: Partial<Component>;
  fields: string[];
}

/**
 * Builds the patch that clears a "this is only a guess" warning.
 *
 * Confirmation records a human decision, so it only ever sets the flag — the
 * value itself is left exactly as it stands. There is deliberately no bulk
 * version of this: confirming means someone looked.
 */
export function confirmAction(component: Component, kind: ConfirmKind): ConfirmAction {
  const spec = component.thermal_spec;
  switch (kind) {
    case 'limit_type':
      return {
        label: `Confirm ${spec.limit_type}`,
        labelZh: `確認為 ${spec.limit_type}`,
        patch: { thermal_spec: { ...spec, limit_type_confirmed: true } },
        fields: ['limit_type'],
      };
    case 'heat_path':
      return {
        label: `Confirm ${spec.heat_path.type}`,
        labelZh: `確認為 ${spec.heat_path.type}`,
        patch: { thermal_spec: { ...spec, heat_path_confirmed: true } },
        fields: ['heat_path.type'],
      };
    case 'geometry_review':
      return {
        label: 'Mark reviewed',
        labelZh: '標記為已確認',
        patch: {
          thermal_spec: { ...spec, geometry: { ...spec.geometry, needs_review: false } },
        },
        fields: ['geometry'],
      };
  }
}

/** Groups a project's issues by component, for the screen-level list. */
export interface IssueGroup {
  component: Component;
  issues: ComponentIssue[];
  errors: number;
  warnings: number;
}

export function groupIssues(
  components: Component[],
  validate: (component: Component) => ComponentIssue[],
): IssueGroup[] {
  const groups: IssueGroup[] = [];
  for (const component of components) {
    // A disabled component is not carried into Screen 05, so its gaps are not
    // asking to be fixed.
    if (!component.enabled) continue;
    const issues = validate(component);
    if (issues.length === 0) continue;
    groups.push({
      component,
      issues,
      errors: issues.filter((issue) => issue.severity === 'error').length,
      warnings: issues.filter((issue) => issue.severity === 'warning').length,
    });
  }
  // Errors block Save & Continue, so they come first.
  return groups.sort((a, b) => b.errors - a.errors || b.warnings - a.warnings);
}
