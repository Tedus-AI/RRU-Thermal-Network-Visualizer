# Codex Implementation Prompt — Screen 02 Import Hardware Components

Before coding:
1. Read `00_Product_Vision_and_Architecture.md`.
2. Read `02_Import_Components.md`.
3. View `02_Import_Components.png`.
4. Load `02_Import_Components_mock.json`.
5. Inspect the existing component/project database adapter.

Implement only Screen 02.

Technology:
- React + Vite + TypeScript.
- English-primary UI.
- Bilingual labels when space allows.
- Otherwise English visible + accessible Traditional Chinese tooltip.
- Create reusable `FieldLabel` / `BilingualTooltip`.

Required pipeline:
Raw Source → Parser → Mapping → Normalization → Staging → Validation → Duplicate Resolution → Apply → componentStore

Must support:
- Existing Project
- CSV
- Excel
- Paste Table
- Auto/manual mapping
- Inline staging correction
- Validation
- Duplicate policies: Skip / Replace / Merge Non-empty / New Variant
- Per-row duplicate override
- Provenance
- Project impact preview
- Solver/network invalidation when relevant data changes

Critical rule:
`Total Power = Qty × Power` is a component summary only. Never treat it as Thermal Edge heat flow Q.

Do not:
- create Nodes/Edges here,
- write preview data directly to componentStore,
- overwrite unknown shared metadata,
- silently convert parse failures to zero.

After implementation provide:
1. changed files,
2. screenshot,
3. completed acceptance checklist,
4. parser/mapping test results,
5. known limitations,
6. next recommended step: Screen 04 Component Manager.
