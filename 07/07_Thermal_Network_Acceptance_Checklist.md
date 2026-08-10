# 07 Thermal Network — Acceptance Checklist

## Solver
- [ ] General graph solver
- [ ] Series
- [ ] Parallel
- [ ] Branch
- [ ] Merge
- [ ] Coupling cycles
- [ ] Multiple heat sources
- [ ] Multiple boundary sinks
- [ ] Scenario-specific boundary Rth
- [ ] Active Rth source respected
- [ ] Singular matrix detection
- [ ] NaN/Infinity detection

## Results
- [ ] Node temperatures
- [ ] Edge Q
- [ ] Edge ΔT
- [ ] Reverse heat flow direction
- [ ] Node margin
- [ ] Energy balance
- [ ] Energy-balance thresholds
- [ ] Scenario-specific solution storage

## States
- [ ] READY
- [ ] DIRTY
- [ ] SOLVING
- [ ] SOLVED
- [ ] WARNING
- [ ] FAILED
- [ ] Stale result banner

## Visualization
- [ ] Temperature mode
- [ ] Heat Flow mode
- [ ] ΔT mode
- [ ] Rth mode
- [ ] Node Type mode
- [ ] Rth Source mode
- [ ] Temperature legend
- [ ] Node inspector
- [ ] Edge inspector
- [ ] Actual direction display

## Physics separation
- [ ] No Bottleneck ranking
- [ ] No sensitivity analysis
- [ ] No temperature-distribution charts
- [ ] No invented branch Q
- [ ] Rule 4 protected

## 03 compatibility
- [ ] FloTHERM result slots preserved
- [ ] No FloTHERM parser
- [ ] No fake FloTHERM result

## UI / navigation
- [ ] Fixed App Shell
- [ ] English primary + zh-TW support
- [ ] Empty/loading/error/read-only states
- [ ] Back to Screen 06
- [ ] Save Solution
- [ ] Continue to Screen 08 only after valid solve
