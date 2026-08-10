# 05 Thermal Path Builder — Acceptance Checklist

## Input / Qty
- [ ] Reads Screen 04 readiness/preferences.
- [ ] Aggregate works.
- [ ] Individual works.
- [ ] Grouped works.
- [ ] Qty representation rebuild warning works.

## Templates
- [ ] Bottom Cool + Copper Coin.
- [ ] Bottom Cool + Thermal Via.
- [ ] Top Cool + Lid.
- [ ] Bare Die.
- [ ] Small Base + Heat Pipe.
- [ ] Direct Metal.
- [ ] Templates use ports.
- [ ] Templates do not hard-code Main Base.
- [ ] Template preview shows requirements.
- [ ] Manual changes are protected during rebuild.

## Shared structure / Graph
- [ ] Single Base.
- [ ] 3-Zone Base.
- [ ] Functional Zones.
- [ ] Custom zones.
- [ ] HSK / Fin / Boundary placeholders.
- [ ] Series.
- [ ] Parallel.
- [ ] Branch.
- [ ] Merge.
- [ ] Coupling cycles.
- [ ] Not tree-only.
- [ ] Stable IDs.
- [ ] Persistent positions.
- [ ] Node/Edge add/edit/delete/disable.
- [ ] Undo/Redo.

## Rth / physics
- [ ] Rjc model.
- [ ] L/kA conduction.
- [ ] TIM t/kA.
- [ ] Via equivalent.
- [ ] Heat Pipe equivalent.
- [ ] Spreading can be unresolved.
- [ ] Boundary Rth remains unresolved until 06.
- [ ] Unknown Rth never becomes zero.
- [ ] No final temperature solve.
- [ ] No invented Edge Q.
- [ ] Qty × Power is never Edge Q.

## Validation
- [ ] Orphan source detected.
- [ ] Unconnected required port detected.
- [ ] Missing node reference error.
- [ ] Negative Rth error.
- [ ] Self-loop error.
- [ ] Cycle not automatically error.
- [ ] Duplicate edge warning.
- [ ] Boundary-not-configured warning.
- [ ] Blocking errors gate Continue.

## 03 compatibility
- [ ] Node FloTHERM mapping hook.
- [ ] Edge interface mapping hook.
- [ ] Multi-source Rth slots.
- [ ] Multi-source temperature slots.
- [ ] No FloTHERM parser.
- [ ] No hard-coded FloTHERM headers.
- [ ] Analytical provenance preserved.

## UI / navigation
- [ ] Fixed App Shell.
- [ ] 5-step builder stepper.
- [ ] English + zh-TW support.
- [ ] Empty/loading/error/read-only/dirty states.
- [ ] Save & Continue → Screen 06.
