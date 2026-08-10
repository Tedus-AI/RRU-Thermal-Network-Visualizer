# Codex Implementation Prompt — Screen 01 Project Info

Before coding, read:

1. `00_Product_Vision_and_Architecture.md`
2. `01_Project_Info.md`
3. View `01_Project_Info.png`
4. Load `01_Project_Info_mock.json`

Implement only Screen 01 scope.

## Goal

Create a production-quality Project Info screen for the 5G FR1 Thermal Network Visualizer.

This is not a generic project-management form. It establishes the shared project and thermal-design context used by all later screens.

## Must Do

- Reuse the existing App Shell.
- Use shared `projectStore` and `scenarioStore`.
- Create a default Baseline scenario on first save.
- Implement Project Identity.
- Implement Product & Thermal Context.
- Implement Default Scenario.
- Implement Project Overview derived KPIs.
- Implement Project Health.
- Implement Recommended Next Step.
- Implement dirty state and route guard.
- Implement save / duplicate / archive.
- Support loading / empty / warning / error / read-only states.
- Preserve unknown sibling fields in shared project data.
- Do not replace the whole shared project document.

## Must Not Do

- Do not create thermal nodes or edges here.
- Do not run the thermal solver.
- Do not hard-code Cooling Architecture into graph topology.
- Do not store derived KPI values as authoritative project data.
- Do not treat missing FloTHERM data as a blocking error.

## Acceptance

Use every acceptance criterion listed in `01_Project_Info.md`.

When complete, provide:
1. changed files,
2. screenshot,
3. acceptance checklist result,
4. known limitations,
5. next recommended implementation step.
