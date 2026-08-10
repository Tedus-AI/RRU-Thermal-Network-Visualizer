# Codex Implementation Prompt — Screen 04 Component Manager

Before coding:
1. Read `00_Product_Vision_and_Architecture.md`.
2. Read `04_Component_Manager.md`.
3. View `04_Component_Manager.png` when provided.
4. Load `04_Component_Manager_mock.json`.
5. Inspect Screen 02 canonical output and the shared DB adapter.

## Critical: Screen 03 Is Deferred, Not Removed
FloTHERM Import is delayed only because its real export schema has not yet been validated. Do not guess that schema.

Screen 04 must reserve:
- `externalMappings.flotherm`,
- reusable `ResultValue<T>` provenance,
- Node analytical/flotherm/measurement temperature result slots,
- Edge analytical/flotherm/measurement/manual Rth slots,
- active result-source selection.

Do NOT implement a FloTHERM parser or hard-code CSV headers.

## Screen 04 Goal
Build the formal Component Manager for identity, Qty, Power, Limit Type, Limit, Rjc, package, geometry, board path, TIM, provenance, completeness, architecture preference, base-zone preference and Qty modeling preference.

## Critical Separation
Screen 04 MUST NOT create Thermal Nodes or Edges. Architecture preference is preparation for Screen 05 only.

## UI
Use the fixed shared 00/01 App Shell. English primary; bilingual when space allows; otherwise English + accessible zh-TW tooltip.

## Data Safety
Preserve unknown legacy/shared fields. Unknown Rjc is null/N/A, never zero. Preserve Tj/Tc/Ts. Total Power is not Edge Q.

## Downstream Invalidation
Thermal-relevant changes must set solver DIRTY and network review flags when appropriate.

After implementation provide changed files, screenshot, checklist, tests, 03-deferred compatibility review, limitations and next step Screen 05.
