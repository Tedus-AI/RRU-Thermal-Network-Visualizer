/**
 * Card ④ 檢查 (`checksModel.ts`): the network's and the boundary's checks as
 * one list, blocking first, both halves counted.
 */

import { describe, expect, it } from 'vitest';

import type { GraphValidationResult } from '@/thermal/graph/graphValidation';
import type { BoundaryValidationState } from '@/thermal/boundary/types';
import type { BoundarySummary } from '@/screens/06-boundary-conditions/boundaryViewModel';

import { buildChecks } from './checksModel';

const summary = (patch: Partial<BoundarySummary> = {}): BoundarySummary => ({
  portsTotal: 1,
  portsAssigned: 1,
  convectionProfiles: 1,
  convectionMissingInputs: 0,
  radiationProfiles: 0,
  solarLoads: 0,
  fixedTemperatureProfiles: 0,
  adiabaticProfiles: 0,
  readinessPct: 100,
  ...patch,
});

const clean: BoundaryValidationState = { status: 'ready_for_07', errors: [], warnings: [], infos: [] };
const network = (issues: GraphValidationResult['issues'] = []): GraphValidationResult => ({
  issues,
  errors: issues.filter((i) => i.severity === 'error').length,
  warnings: issues.filter((i) => i.severity === 'warning').length,
  info: issues.filter((i) => i.severity === 'info').length,
  canContinue: !issues.some((i) => i.severity === 'error'),
});

describe('buildChecks', () => {
  it('a finished network and boundary pass every row and list nothing', () => {
    const model = buildChecks({ network: network(), nodeCount: 47, boundary: clean, summary: summary(), ambient_C: 45 });
    expect(model.rows.every((row) => row.passed)).toBe(true);
    expect(model.rows.find((row) => row.id === 'ambient')?.detail).toBe('45 °C');
    expect(model.issues).toEqual([]);
    expect([model.errors, model.warnings, model.infos]).toEqual([0, 0, 0]);
  });

  it('no network yet: the first row says so', () => {
    const model = buildChecks({ network: null, nodeCount: 0, boundary: clean, summary: summary(), ambient_C: 45 });
    expect(model.rows[0]).toMatchObject({ id: 'network', passed: false, detail: '還沒有熱網路' });
  });

  it('merges both halves, errors first, in Chinese where there is Chinese', () => {
    const boundary: BoundaryValidationState = {
      status: 'blocked',
      errors: [
        {
          id: 'B1',
          severity: 'error',
          boundary_port_id: 'BP_FIN_SURFACE',
          message: 'Fin geometry incomplete',
          message_zh: '鰭片幾何不完整',
          suggested_action: '填鰭片高度',
        },
      ],
      warnings: [],
      infos: [{ id: 'B2', severity: 'info', message: 'Info only', message_zh: '' }],
    };
    const model = buildChecks({
      network: network([
        { severity: 'warning', code: 'W1', message: 'Port open', messageZh: '有未接的埠', nodeId: 'N1' },
        { severity: 'error', code: 'E1', message: 'Cycle', messageZh: '' },
      ]),
      nodeCount: 10,
      boundary,
      summary: summary({ portsAssigned: 0 }),
      ambient_C: 45,
    });
    expect(model.issues.map((i) => [i.severity, i.source, i.text])).toEqual([
      ['error', 'network', 'Cycle'],
      ['error', 'boundary', '鰭片幾何不完整'],
      ['warning', 'network', '有未接的埠'],
      ['info', 'boundary', 'Info only'],
    ]);
    expect(model.issues[1].hint).toBe('填鰭片高度');
    expect([model.errors, model.warnings, model.infos]).toEqual([2, 1, 1]);
    const failed = model.rows.filter((row) => !row.passed).map((row) => row.id);
    expect(failed).toEqual(['network', 'surfaces', 'values']);
  });
});
