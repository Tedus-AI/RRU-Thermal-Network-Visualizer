# Codex Implementation Prompt — Screen 07 Thermal Network

Read in order:
1. `00_Product_Vision_and_Architecture.md`
2. `05_Thermal_Path_Builder.md`
3. `06_Boundary_Conditions.md`
4. `07_Thermal_Network.md`
5. `07_Thermal_Network.png`
6. `07_Thermal_Network_mock.json`

Implement only Screen 07.

Core separation:
- 05 creates topology.
- 06 defines scenario boundaries.
- 07 performs the full nodal solve.
- 08 performs bottleneck ranking/sensitivity.
- 09 performs temperature distribution analytics.
- 10 performs results overview.

Solver:
- generic general graph
- `[G][T]=[P]`
- supports branch/merge/parallel/cycles
- supports multiple sources and multiple fixed/boundary sinks
- respects `activeRthSource`
- uses scenario-specific boundary Rth
- back-calculates Q and ΔT
- detects reverse heat flow
- performs energy balance

Do NOT:
- assume tree topology
- invent Edge Q
- use component Total Power as branch Q
- derive segment Rth from ΔT unless segment Q is known
- implement bottleneck ranking
- implement sensitivity analysis
- add histogram/distribution charts
- implement FloTHERM import

UI:
- fixed shared deep-navy App Shell
- formal screenshot uses Temperature result mode
- left solve controls + validation
- center solved Cytoscape graph
- right node/edge inspector
- KPI cards for Solver Status / Generated / Rejected / Residual / Nodes / Edges
- stale-result handling
- bottom actions Back to 06 / Pre-Solve / Solve / Save / Continue to 08

After implementation provide:
1. changed files
2. screenshot
3. acceptance checklist
4. series/parallel/cycle solver tests
5. singular-matrix test
6. energy-balance tests
7. multi-scenario test
8. known limitations
