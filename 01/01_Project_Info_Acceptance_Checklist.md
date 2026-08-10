# 01 Project Info — Acceptance Checklist

- [x] AC-01 New project can be created and saved.
- [x] AC-02 Duplicate Project ID blocks save.
- [x] AC-03 First save creates Baseline Scenario.
- [x] AC-04 Editing fields marks project dirty.
- [x] AC-05 Route/project change warns on unsaved data.
- [x] AC-06 Overview KPIs are derived from shared stores.
- [x] AC-07 Project Health reflects components/network/scenario/solve state.
- [x] AC-08 Recommended Next Step updates automatically.
- [x] AC-09 Save preserves unknown shared project fields.
- [x] AC-10 Archived/locked project supports read-only state.
- [x] AC-11 Save & Continue routes to Screen 02.
- [x] AC-12 Missing FloTHERM is optional, not blocking.
- [x] Loading state exists.
- [x] Empty state exists.
- [x] Error state exists.
- [x] Read-only state exists.
- [x] Dirty state exists.
- [x] Project ID becomes read-only after first save.
- [x] Cooling architecture does not create graph topology.
- [x] No thermal solver logic is implemented in this screen.

## Implementation notes

| Item | Where |
| --- | --- |
| AC-01 / AC-03 | `src/project/useProjectSave.ts` — validate → merge-save → `createDefaultScenario()` → persist |
| AC-02 | `src/project/projectValidation.ts` + `projectStore.isProjectIdTaken()` (excludes the project's own saved id) |
| AC-04 | `projectStore.patchProject/patchContext/markDirty`; scenario edits call `markDirty()` |
| AC-05 | `src/app/navigationGuard.ts` + `useGuardedNavigate()` + `UnsavedChangesModal` — covers sidebar navigation, header project switching and "New Project" |
| AC-06 | `src/project/projectHealth.ts::useProjectOverview()` — derived on read, never persisted |
| AC-07 / AC-08 | `useProjectHealth()` / `nextStepFor()`; FloTHERM deliberately excluded from the decision chain |
| AC-09 | `src/data/persistence.ts::saveProject()` — reads the on-disk document, rewrites only the six owned keys, re-attaches all foreign keys |
| AC-10 | `projectStore.isReadOnly()` (status `archived`) disables every mutator, the form controls, Save and the header Save action |
| AC-11 | `ProjectInfoView.handleSaveAndContinue()` — new projects → Screen 02; existing projects follow `nextStepFor()` |
| AC-12 | FloTHERM row renders as grey `optional`, contributes no error and never gates the next step |

### Verified

- KPI values against `01_Project_Info_mock.json`: Components 18, Heat Sources 9,
  Total Power 412.3 W, Nodes 0, Edges 0, Scenarios 1, FloTHERM `Not Imported`,
  Last Solve `Not Solved`; Recommended Next Step = `Assign Thermal Architecture`.
- Persisted project document matches the storage shape in 01 §36
  (`project_name`, `project_context`, `active_scenario_id`, `status`, `meta`).
- `npm test` — 15 tests covering the solver, validation, Rule 4 and Rule 9.

### Known limitations

- Persistence is a localStorage adapter. The shared-project DB adapter is not wired
  yet; merge semantics and foreign-field preservation are implemented against this
  adapter so the swap does not touch any screen.
- Duplicate Project copies the project record and scenarios. The Components /
  Thermal Network / FloTHERM / Solver-result checkboxes are recorded but those
  stores have no persisted content until Screens 02, 03 and 05 exist.
- Loading state renders skeletons, but the current adapter resolves synchronously
  so it is not observable in normal use.
- Project Owner is a plain text field; there is no app-wide user identity to
  prefill from yet (01 §6.4).
