import { BUILTIN_TIM_IDS, defaultMaterials } from '@/domain/materials';
import { describe, expect, it } from 'vitest';

import { detectDelimiter, parseDelimitedText, splitDelimitedLine } from './parseTable';
import { autoMapColumns, matchCanonicalField } from './autoMapColumns';
import {
  normalizeHeatPath,
  normalizeCategory,
  normalizeTimName,
  parseNumericCell,
} from './normalizeComponent';
import { buildStagingRows, duplicateKey } from './buildStagingRows';
import { applyImport } from './applyImport';
import { projectImpact, summarizeImport } from './summarize';
import { IGNORE_COLUMN, type ImportSourceDescriptor, type StagingRow } from './types';
import {
  emptyArchitecturePrep,
  emptyExternalMappings,
  emptyThermalSpec,
  type Component,
} from '@/domain/component';
import { sourced } from '@/domain/sourcedValue';
import {
  canonicalComponentToLegacy,
  legacyComponentToCanonical,
} from '@/adapters/legacyComponentAdapter';

const SOURCE: ImportSourceDescriptor = {
  source_type: 'CSV',
  source_project_id: null,
  source_project_name: null,
  source_file: 'test.csv',
};

function component(overrides: Partial<Component> & Pick<Component, 'id' | 'name'>): Component {
  return {
    category: 'RF',
    enabled: true,
    qty: 1,
    power_W: sourced(10, 'Manual'),
    thermal_spec: emptyThermalSpec(),
    architecture_prep: emptyArchitecturePrep(),
    external_mappings: emptyExternalMappings(),
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

function stage(csv: string, existing: Component[] = []): StagingRow[] {
  const table = parseDelimitedText(csv, { sourceName: 'test.csv' });
  return buildStagingRows({
    table,
    mapping: autoMapColumns(table.headers),
    existingComponents: existing,
  });
}

// --- Parsing ---------------------------------------------------------------

describe('delimited parsing', () => {
  it('honours quoted fields containing the delimiter', () => {
    expect(splitDelimitedLine('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd']);
    expect(splitDelimitedLine('a,"say ""hi""",c', ',')).toEqual(['a', 'say "hi"', 'c']);
  });

  it('detects tabs in pasted spreadsheet data and semicolons in EU exports', () => {
    expect(detectDelimiter(['a\tb\tc', '1\t2\t3'])).toBe('\t');
    expect(detectDelimiter(['a;b;c', '1;2;3'])).toBe(';');
    expect(detectDelimiter(['a,b,c', '1,2,3'])).toBe(',');
  });

  it('pads short rows so every row matches the header width', () => {
    const table = parseDelimitedText('Component,Qty,Power(W)\nPA,4', { sourceName: 'x' });
    expect(table.rows[0]).toEqual(['PA', '4', '']);
  });
});

// --- Mapping ---------------------------------------------------------------

describe('column auto-mapping', () => {
  it('maps the canonical legacy schema with no user interaction', () => {
    const headers = ['Component', 'Qty', 'Power(W)', 'Source_L', 'R_jc', 'TIM_Type'];
    expect(autoMapColumns(headers)).toEqual([
      'Component',
      'Qty',
      'Power(W)',
      'Source_L',
      'R_jc',
      'TIM_Type',
    ]);
  });

  // Height is a Volume-Tool vertical position, not geometry this tool models.
  // It must fall through to metadata rather than claim a canonical field.
  it('no longer claims the legacy Height column', () => {
    expect(matchCanonicalField('Height(mm)')).toBeNull();
    expect(autoMapColumns(['Component', 'Height(mm)'])).toEqual(['Component', 'Ignore Column']);
  });

  // An export written before the rename must still map itself with no help.
  it('maps the pre-rename column names onto their new fields', () => {
    expect(autoMapColumns(['Pad_L', 'Pad_W', 'Board_Type'])).toEqual([
      'Source_L',
      'Source_W',
      'Heat_Path',
    ]);
  });

  it('maps the Volume Tool Traditional Chinese headers', () => {
    expect(matchCanonicalField('Pad 長 (mm)')).toBe('Source_L');
    expect(matchCanonicalField('Pad 寬 (mm)')).toBe('Source_W');
    expect(matchCanonicalField('導熱方式')).toBe('Heat_Path');
  });

  it('maps the alias headers from the specification', () => {
    // 02 §11 worked example.
    expect(matchCanonicalField('Device Name')).toBe('Component');
    expect(matchCanonicalField('Count')).toBe('Qty');
    expect(matchCanonicalField('Power Dissipation')).toBe('Power(W)');
    expect(matchCanonicalField('Junction Case R')).toBe('R_jc');
  });

  it('maps Traditional Chinese headers', () => {
    expect(matchCanonicalField('元件名稱')).toBe('Component');
    expect(matchCanonicalField('數量')).toBe('Qty');
    expect(matchCanonicalField('功耗')).toBe('Power(W)');
  });

  it('leaves unknown columns ignored rather than guessing', () => {
    expect(autoMapColumns(['Component', 'Supplier PN'])).toEqual(['Component', IGNORE_COLUMN]);
  });

  it('never lets two columns claim the same canonical field', () => {
    expect(autoMapColumns(['Power(W)', 'Power Dissipation'])).toEqual(['Power(W)', IGNORE_COLUMN]);
  });
});

// --- Normalization ---------------------------------------------------------

describe('numeric normalization', () => {
  it('never turns a parse failure into zero', () => {
    // 02 §14 / §34 — the central data-integrity rule of this screen.
    expect(parseNumericCell('abc')).toEqual({ value: null, invalid: true });
    expect(parseNumericCell('12x3')).toEqual({ value: null, invalid: true });
  });

  it('treats blank and placeholder cells as absent, not invalid', () => {
    expect(parseNumericCell('')).toEqual({ value: null, invalid: false });
    expect(parseNumericCell('—')).toEqual({ value: null, invalid: false });
    expect(parseNumericCell('N/A')).toEqual({ value: null, invalid: false });
  });

  it('reads units, thousands separators and decimal commas', () => {
    expect(parseNumericCell('35 W').value).toBe(35);
    expect(parseNumericCell('0.35 C/W').value).toBeCloseTo(0.35);
    expect(parseNumericCell('1,234.5').value).toBe(1234.5);
    expect(parseNumericCell('52,13').value).toBeCloseTo(52.13);
  });
});

describe('enum normalization', () => {
  it('maps legacy category tokens', () => {
    expect(normalizeCategory('rf')).toBe('RF');
    expect(normalizeCategory('pwr')).toBe('Power');
    expect(normalizeCategory('digital')).toBe('Digital');
  });

  it('maps heat path aliases, including the Volume Tool vocabulary', () => {
    expect(normalizeHeatPath('Cu Coin')).toBe('Coin');
    expect(normalizeHeatPath('Thermal Vias')).toBe('Board');
    expect(normalizeHeatPath('Direct Metal')).toBe('DirectMetal');
    // `None` is top-surface cooling in the Volume Tool, not an absent path.
    expect(normalizeHeatPath('None')).toBe('TopSurface');
  });

  // There is no Custom heat path to park an unknown in, so it stays null and
  // the caller infers — which is visible — instead of hiding it in an enum.
  it('returns null for text it cannot recognise', () => {
    expect(normalizeHeatPath('Something Else')).toBeNull();
    expect(normalizeHeatPath('')).toBeNull();
  });

  it('keeps Solder and Gap Filler as first-class TIM types (04 §11)', () => {
    // Naming a TIM still never promotes it into graph topology (02 §16).
    expect(normalizeTimName('Solder')).toBe('Solder');
    expect(normalizeTimName('Gap Filler')).toBe('Gap Filler');
    expect(normalizeTimName('PCM')).toBe('PCM');
  });
});

// --- Validation ------------------------------------------------------------

describe('row validation', () => {
  it('blocks empty name, non-positive qty, negative power and negative Rjc', () => {
    const rows = stage(
      [
        'Component,Qty,Power(W),R_jc',
        ',4,10,0.3', // empty name
        'A,0,10,0.3', // qty 0
        'B,1.5,10,0.3', // fractional qty
        'C,4,-5,0.3', // negative power
        'D,4,10,-1', // negative Rjc
      ].join('\n'),
    );
    expect(rows.map((row) => row.status)).toEqual(['ERROR', 'ERROR', 'ERROR', 'ERROR', 'ERROR']);
  });

  it('reports an unparseable number as an error instead of importing a 0', () => {
    const [row] = stage('Component,Qty,Power(W)\nPA,4,abc');
    expect(row.status).toBe('ERROR');
    expect(row.power_W).toBeNull();
    expect(row.issues.some((issue) => issue.message.includes('not a valid number'))).toBe(true);
  });

  it('only warns for missing Rjc, limit and TIM', () => {
    const [row] = stage('Component,Qty,Power(W)\nPA,4,52.13');
    expect(row.status).toBe('WARNING');
    expect(row.issues.every((issue) => issue.severity === 'warning')).toBe(true);
  });

  it('allows zero power with a warning', () => {
    const [row] = stage(
      'Component,Category,Qty,Power(W),R_jc,Limit(C),TIM_Type\nCan,Other,2,0,0.1,85,None',
    );
    expect(row.status).toBe('WARNING');
    expect(row.power_W).toBe(0);
    expect(row.issues.some((issue) => issue.message.includes('0 W'))).toBe(true);
  });

  it('errors when a required column was never mapped', () => {
    const table = parseDelimitedText('Component,Qty\nPA,4', { sourceName: 'x' });
    const rows = buildStagingRows({
      table,
      mapping: ['Component', 'Qty'],
      existingComponents: [],
    });
    expect(rows[0].status).toBe('ERROR');
    expect(rows[0].issues.some((issue) => issue.message.includes('Power(W)'))).toBe(true);
  });
});

// --- Duplicates ------------------------------------------------------------

describe('duplicate handling', () => {
  const existing = [
    component({
      id: 'CMP_PA',
      name: 'Final PA',
      category: 'RF',
      qty: 4,
      power_W: sourced(50, 'Manual'),
      thermal_spec: {
        ...emptyThermalSpec(),
        r_jc_C_per_W: sourced(0.18, 'Datasheet'),
        limit_C: sourced(180, 'Datasheet'),
      },
      metadata: { supplier: 'ACME' },
    }),
  ];

  const csv =
    'Component,Category,Qty,Power(W),R_jc,Limit(C),TIM_Type\nFinal PA,RF,4,52.13,,175,Grease';

  it('matches on component name plus category', () => {
    expect(duplicateKey('Final PA', 'RF')).toBe(duplicateKey('final pa', 'RF'));
    expect(duplicateKey('Final PA', 'RF')).not.toBe(duplicateKey('Final PA', 'Digital'));

    const [row] = stage(csv, existing);
    expect(row.status).toBe('DUPLICATE');
    expect(row.duplicate_of).toBe('CMP_PA');
  });

  it('SKIP keeps the existing component untouched', () => {
    const { components, result } = applyImport({
      materials: defaultMaterials(),
      existing,
      rows: stage(csv, existing),
      sessionPolicy: 'SKIP',
      source: SOURCE,
    });
    expect(components).toHaveLength(1);
    expect(components[0].power_W.value).toBe(50);
    expect(result.skipped).toBe(1);
  });

  it('REPLACE overwrites owned fields but preserves unknown metadata', () => {
    const { components, result } = applyImport({
      materials: defaultMaterials(),
      existing,
      rows: stage(csv, existing),
      sessionPolicy: 'REPLACE',
      source: SOURCE,
    });
    expect(result.updated).toBe(1);
    expect(components[0].power_W.value).toBeCloseTo(52.13);
    expect(components[0].thermal_spec.limit_C?.value).toBe(175);
    // Imported Rjc was blank, and Replace does not carry the old one over.
    expect(components[0].thermal_spec.r_jc_C_per_W).toBeNull();
    // AC-02-14 — foreign metadata survives.
    expect(components[0].metadata?.supplier).toBe('ACME');
  });

  it('MERGE_NON_EMPTY keeps the existing value where the import is empty', () => {
    const { components } = applyImport({
      materials: defaultMaterials(),
      existing,
      rows: stage(csv, existing),
      sessionPolicy: 'MERGE_NON_EMPTY',
      source: SOURCE,
    });
    expect(components[0].power_W.value).toBeCloseTo(52.13);
    expect(components[0].thermal_spec.limit_C?.value).toBe(175);
    // Blank in the import -> the existing Rjc is retained.
    expect(components[0].thermal_spec.r_jc_C_per_W?.value).toBe(0.18);
  });

  it('NEW_VARIANT adds a separate component', () => {
    const { components, result } = applyImport({
      materials: defaultMaterials(),
      existing,
      rows: stage(csv, existing),
      sessionPolicy: 'NEW_VARIANT',
      source: SOURCE,
    });
    expect(result.imported).toBe(1);
    expect(components).toHaveLength(2);
    expect(components[1].name).toBe('Final PA (Imported)');
  });

  it('honours a per-row override of the session policy', () => {
    const rows = stage(csv, existing).map((row) => ({ ...row, duplicate_action: 'SKIP' as const }));
    const { components, result } = applyImport({
      materials: defaultMaterials(),
      existing,
      rows,
      sessionPolicy: 'REPLACE',
      source: SOURCE,
    });
    expect(result.skipped).toBe(1);
    expect(components[0].power_W.value).toBe(50);
  });
});

// --- Apply -----------------------------------------------------------------

describe('apply', () => {
  const csv = [
    'Component,Category,Qty,Power(W),R_jc,Limit(C),TIM_Type',
    'Final PA,RF,4,52.13,0.35,180,Grease',
    ',0,,,,,', // error row
    'FPGA,Digital,1,35,0.16,110,Putty',
  ].join('\n');

  it('blocks error rows and imports the rest', () => {
    const rows = stage(csv);
    const { components, result } = applyImport({
      materials: defaultMaterials(),
      existing: [],
      rows,
      sessionPolicy: 'MERGE_NON_EMPTY',
      source: SOURCE,
    });
    expect(result.imported).toBe(2);
    expect(result.errors).toBe(1);
    expect(components.map((c) => c.name)).toEqual(['Final PA', 'FPGA']);
  });

  it('never creates thermal topology', () => {
    // 02 §34 / AC-02-16.
    const { components } = applyImport({
      materials: defaultMaterials(),
      existing: [],
      rows: stage(csv),
      sessionPolicy: 'MERGE_NON_EMPTY',
      source: SOURCE,
    });
    // No topology, and no architecture preference invented by the importer.
    expect(components.every((c) => c.architecture_prep.template_preference === 'UNASSIGNED')).toBe(
      true,
    );
    expect(
      components.every((c) => c.architecture_prep.thermal_profile_status === 'Not Assigned'),
    ).toBe(true);
  });

  it('records provenance on every imported component', () => {
    const { components } = applyImport({
      materials: defaultMaterials(),
      existing: [],
      rows: stage(csv),
      sessionPolicy: 'MERGE_NON_EMPTY',
      source: { ...SOURCE, source_type: 'ExistingProject', source_project_id: 'RRU_REF_A' },
    });
    expect(components[0].provenance.source_type).toBe('ExistingProject');
    expect(components[0].provenance.source_project_id).toBe('RRU_REF_A');
    expect(components[0].provenance.imported_at).toBeTruthy();
  });

  it('keeps unmapped source columns as component metadata', () => {
    const rows = stage('Component,Qty,Power(W),Supplier PN\nPA,4,52.13,ACME-123');
    const { components } = applyImport({
      materials: defaultMaterials(),
      existing: [],
      rows,
      sessionPolicy: 'MERGE_NON_EMPTY',
      source: SOURCE,
    });
    expect(components[0].metadata?.['Supplier PN']).toBe('ACME-123');
  });

  it('flags solver invalidation and network review for new components', () => {
    const { result } = applyImport({
      materials: defaultMaterials(),
      existing: [],
      rows: stage(csv),
      sessionPolicy: 'MERGE_NON_EMPTY',
      source: SOURCE,
    });
    expect(result.invalidated_solver).toBe(true);
    expect(result.requires_network_review).toBe(true);
  });

  it('does not invalidate the solver when nothing solver-relevant changed', () => {
    const existing = [
      component({
        id: 'CMP_PA',
        name: 'Final PA',
        category: 'RF',
        qty: 4,
        power_W: sourced(52.13, 'Imported'),
        thermal_spec: {
          ...emptyThermalSpec(),
          r_jc_C_per_W: sourced(0.35, 'Datasheet'),
          limit_C: sourced(180, 'Datasheet'),
          tim: { ...emptyThermalSpec().tim, tim_id: BUILTIN_TIM_IDS.grease },
        },
      }),
    ];
    const rows = stage(
      'Component,Category,Qty,Power(W),R_jc,Limit(C),TIM_Type\nFinal PA,RF,4,52.13,0.35,180,Grease',
      existing,
    );
    const { result } = applyImport({
      materials: defaultMaterials(),
      existing,
      rows,
      sessionPolicy: 'REPLACE',
      source: SOURCE,
    });
    expect(result.updated).toBe(1);
    expect(result.invalidated_solver).toBe(false);
  });
});

// --- Summary ---------------------------------------------------------------

describe('summary and impact', () => {
  const csv = [
    'Component,Category,Qty,Power(W),R_jc,Limit(C),TIM_Type',
    'Final PA,RF,4,52.13,0.35,180,Grease',
    'FPGA,Digital,1,35,0.16,110,Putty',
    'Bad Row,Power,0,10,0.1,95,Grease',
  ].join('\n');

  it('computes Total Power as Qty × Power over importable rows', () => {
    const summary = summarizeImport(stage(csv));
    // 4 × 52.13 + 1 × 35 = 243.52; the error row contributes nothing.
    expect(summary.total_power_W).toBeCloseTo(243.52, 2);
    expect(summary.error_rows).toBe(1);
    expect(summary.detected_rows).toBe(3);
  });

  it('breaks power down by category', () => {
    const summary = summarizeImport(stage(csv));
    const rf = summary.category_breakdown.find((entry) => entry.category === 'RF');
    const digital = summary.category_breakdown.find((entry) => entry.category === 'Digital');
    expect(rf?.power_W).toBeCloseTo(208.52, 2);
    expect(digital?.power_W).toBeCloseTo(35, 2);
  });

  it('projects the effect on the destination project', () => {
    const existing = [
      component({
        id: 'CMP_X',
        name: 'Existing',
        category: 'Other',
        qty: 1,
        power_W: sourced(5, 'Manual'),
      }),
    ];
    const impact = projectImpact(stage(csv, existing), existing, 'MERGE_NON_EMPTY');
    expect(impact.current_components).toBe(1);
    expect(impact.new_components).toBe(2);
    expect(impact.projected_total).toBe(3);
    expect(impact.projected_power_W).toBeCloseTo(5 + 243.52, 2);
  });
});

// --- Legacy adapter --------------------------------------------------------

describe('legacy adapter', () => {
  it('round-trips a legacy row through the canonical model', () => {
    const legacy = {
      Component: 'Final PA',
      Qty: 4,
      'Power(W)': 52.13,
      R_jc: 0.35,
      'Limit(C)': 180,
      TIM_Type: 'Grease',
      Board_Type: 'Cu Coin',
      category: 'rf',
      customField: 'keep me',
    };

    const canonical = legacyComponentToCanonical(legacy, {
      id: 'CMP_FINAL_PA',
      provenance: {
        source_type: 'ExistingProject',
        source_project_id: 'REF_A',
        source_project_name: 'Ref A',
        source_file: null,
        imported_at: '2026-01-01T00:00:00Z',
      },
      normalizeHeatPath,
      resolveTimId: () => BUILTIN_TIM_IDS.grease,
    });

    expect(canonical.name).toBe('Final PA');
    expect(canonical.category).toBe('RF');
    expect(canonical.thermal_spec.r_jc_C_per_W?.value).toBe(0.35);
    expect(canonical.thermal_spec.heat_path.type).toBe('Coin');
    // 04 §30 — legacy geometry semantics must be confirmed, not assumed.
    expect(canonical.thermal_spec.geometry.needs_review).toBeUndefined();
    expect(canonical.metadata?.customField).toBe('keep me');

    const back = canonicalComponentToLegacy(canonical);
    expect(back.Component).toBe('Final PA');
    expect(back['Power(W)']).toBe(52.13);
    expect(back.category).toBe('rf');
    expect(back.customField).toBe('keep me');
  });
});
