# Codex Implementation Prompt — Screen 05 Thermal Path Builder

Before coding:
1. Read `00_Product_Vision_and_Architecture.md`
2. Read `04_Component_Manager.md`
3. Read `05_Thermal_Path_Builder.md`
4. View `05_Thermal_Path_Builder.png`
5. Load `05_Thermal_Path_Builder_mock.json`

Implement only Screen 05.

Core:
- Build a true general Node + Edge thermal graph.
- Support series / parallel / branch / merge / shared nodes / coupling cycles.
- Use template connection ports; templates must not hard-code Main Base.
- Use stable Node/Edge IDs.
- `networkStore` is source of truth; Cytoscape is view/interaction only.
- Calculate scenario-independent analytical edge Rth only when inputs are sufficient.
- Unknown Rth stays unresolved, never zero.

Separation:
- Do NOT run the complete temperature solver in Screen 05.
- Do NOT assume Ambient, h_conv, h_rad, wind or solar; those belong to Screen 06.
- Do NOT invent Edge Q.
- Qty × Power is source aggregation only, not Edge Q.

Screen 03 deferred:
- preserve Node/Edge FloTHERM mapping hooks,
- preserve multi-source result containers,
- do not implement a parser,
- do not guess FloTHERM headers,
- never overwrite analytical provenance.

UI:
- fixed shared deep-navy App Shell,
- English primary,
- bilingual where space allows,
- otherwise accessible Traditional Chinese tooltip,
- 5-step screen-specific builder stepper,
- Cytoscape.js graph canvas.

After implementation provide:
1. changed files
2. screenshot
3. completed acceptance checklist
4. graph-validation test results
5. template-generation test results
6. 03 compatibility type review
7. known limitations
8. next step: Screen 06 Boundary Conditions
