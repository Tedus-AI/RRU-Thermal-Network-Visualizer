# 02 Import Hardware Components — Acceptance Checklist

## Sources
- [x] Existing Project import works.
- [x] CSV import works.
- [x] Excel import works.
- [x] Excel sheet selection works.
- [x] Paste Table works.

## Staging
- [x] Preview uses staging store.
- [x] Preview does not write directly to componentStore.
- [x] Cancel clears staging.

## Mapping
- [x] Canonical columns auto-map.
- [x] Alias headers auto-map.
- [x] Manual mapping works.
- [x] Ignore Column works.

## Validation
- [x] Empty Component is error.
- [x] Qty <= 0 is error.
- [x] Power < 0 is error.
- [x] Rjc < 0 is error.
- [x] Missing Rjc is warning.
- [x] Missing Limit is warning.
- [x] Zero Power is allowed.
- [x] Parse failures never silently become zero.

## Duplicate
- [x] Skip works.
- [x] Replace works.
- [x] Merge Non-empty works.
- [x] New Variant works.
- [x] Per-row override works.

## Integrity
- [x] Provenance saved.
- [x] Unknown metadata preserved.
- [x] Legacy adapter exists.

## Network safety
- [x] Import does not create Nodes/Edges.
- [x] Relevant changes mark solver DIRTY.
- [x] New components mark network review required.
- [x] Total Power is never treated as Edge Q.

## UI
- [x] English primary.
- [x] Traditional Chinese bilingual/tooltip support.
- [x] Status uses icon/text, not color only.
- [x] Empty/loading/error/read-only/success states exist.
- [x] Validation issues can focus/filter rows.
- [x] Apply & Continue routes to Screen 04.

## Where each item lives

| Area | Implementation |
| --- | --- |
| Pipeline types | `src/importers/component/types.ts` |
| CSV / Paste parsing | `parseTable.ts` — RFC 4180 quoting, delimiter auto-detection (tab / comma / semicolon / pipe) |
| Excel parsing | `parseExcel.ts` — `read-excel-file`, sheet enumeration and selection |
| Existing Project | `parseExistingProject.ts` — emits a `ParsedTable` so it travels the same pipeline as a file, carrying `_ref_origin_*` lineage |
| Auto-mapping | `autoMapColumns.ts` — canonical names, alias table incl. Traditional Chinese, longest-alias-wins, one column per field |
| Normalization | `normalizeComponent.ts` — numeric parsing with units / thousands separators / decimal commas; category, board type and TIM alias maps |
| Validation | `buildStagingRows.ts::validateStagingRow` |
| Duplicate resolution + Apply | `applyImport.ts` |
| Summary / Impact | `summarize.ts` |
| Staging store | `src/data/componentImportStore.ts` |
| Screen | `src/screens/02-import-components/` |

## Parser / mapping test results

`npm test` — 50 tests, all passing (15 solver + 35 import pipeline).

Import-pipeline coverage:

- Quoted delimiters and escaped quotes; delimiter detection for tab / comma / semicolon; short-row padding.
- Canonical auto-map; the spec's alias example (`Device Name`, `Count`, `Power Dissipation`, `Junction Case R`); Traditional Chinese headers; unknown columns left ignored; no double-claiming of a canonical field.
- Numeric parsing: `abc` → invalid (never 0), blank / `—` / `N/A` → absent, `35 W` / `0.35 C/W` / `1,234.5` / `52,13` parsed.
- Enum normalization incl. legacy `Solder` → `Custom` (not a thermal edge).
- Every error rule, every warning rule, and unmapped-required-column detection.
- All four duplicate policies plus per-row override, verified against real before/after component state.
- Apply: error rows blocked, `thermal_profile` stays null, provenance recorded, unmapped columns preserved as metadata, solver invalidation raised only when solver-relevant fields actually changed.
- Summary and project impact arithmetic.

## Browser verification

Driven end-to-end against the running app:

- Paste Table with alias headers → auto-mapped with no interaction; 6 rows detected, 1 error (`Qty 0` + `Power abc`), 2 duplicates, 2 warnings.
- `tnv.components` unchanged at 8 entries while staging — the preview never touches `componentStore`.
- After Apply: 11 components, `Final PA` merged (power 52.13, existing Rjc 0.35 retained), FPGA metadata `Supplier PN: XIL-9` preserved, provenance `Paste`, `thermal_profile` null on every component.
- Existing Project source loaded 9 rows from `RRU Volume Reference A` with 4 duplicates detected and a per-category power breakdown.
- No console or page errors.

## Known limitations

- Legacy `.xls` (pre-2007 binary) is rejected with an explicit message asking for `.xlsx`.
  The npm build of SheetJS is stuck at 0.18.5 (2022) with known CVEs, so `read-excel-file`
  was chosen instead; it reads OOXML only.
- Duplicate identity is `Component name + Category`, per 02 §17. The 02 mockup shows
  `Category + Component + Package`, but there is no Package field in the specification's
  component model — the spec text was followed.
- No row virtualization. Imports above 500 rows work but show a "Large import detected"
  warning, as 02 §31 specifies.
- The `Height / Pad L / Pad W / Thickness` columns are parsed, validated and stored, but
  only Pad L/W are surfaced in the preview table to keep it readable; the rest are visible
  in Screen 04.
- Excel sheet selection re-reads the workbook on each change. Fine at the target file size.

## Next recommended step

`04_Component_Manager` — completing Rjc / limit / TIM on imported rows, and attaching the
`thermal_profile` that Screen 05 turns into topology.
