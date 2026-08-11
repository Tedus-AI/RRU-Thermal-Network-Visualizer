# Codex Implementation Prompt — 08 Bottleneck Analysis

Read 00 → 07 → 08 MD → 08 PNG → mock JSON.

Implement only Screen 08.

Critical rules:
- Bottleneck != maximum Rth.
- Score = 35% Edge ΔT + 45% full-network sensitivity + 20% margin impact.
- Every sensitivity candidate must re-solve the complete graph.
- Never reuse baseline Q in modified solve.
- Preserve branch/parallel/shared redistribution.
- Never mutate official baseline network during sensitivity.
- Rule 4 remains enforced.

Prerequisite: valid current Screen 07 solution.

UI must use fixed 00/01 App Shell and exact Sidebar 01–12, 03 Deferred, 08 active.

Do not implement Temperature Distribution, executive summary, or FloTHERM import.
