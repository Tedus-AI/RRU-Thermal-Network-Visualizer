# Thermal graph UI regression

Run `npm run dev` and open `/qa/graph-explorer.html` on the local Vite server.
This developer-only HTML entry is not part of the production build. It uses the
non-confidential Golden Demo and the real canvas components; it does not open a
project folder or modify saved project files.

## Scope

- SCR05/06/07 default to the existing **完整熱網路**.
- **群組總覽** groups by component identity and actual instance metadata. The
  collapsed preview explicitly identifies the first instance, not an averaged
  or equivalent physical path. Expand to inspect each instance independently.
- **聚焦單一路徑** renders the selected instance plus reachable shared structure
  and environment. Traversal stops at ambient references and does not enter
  other owned instances through a shared heatsink.
- Names are followed by actual node-power totals. Only repeated instances get
  an ordinal badge, ordered by their template instance binding.
- Focus layout is ephemeral. SCR05 does not persist focus coordinates; SCR07
  maintains a separate full-view coordinate cache. Full/manual model positions,
  hidden-component state and group expansion state are not replaced by focus.
- Original toolbars remain callable. Commands invoked from group overview
  reveal the full canvas before acting. Fit Whole Network returns to full view;
  validation issue navigation likewise reveals the complete graph. Focused
  zoom/layout continues to operate on the focused canvas.
- SCR07 preview uses its current result mode, limits projection and display
  toggles; no result is synthesized in SCR05/06. Existing PDF export scope is
  unchanged; JPG still exports the current rendered canvas (full or focused).

## Checks

1. Full view opens by default; existing full graph is still connected.
2. Expand Driver, focus instance 02, return to groups: Driver remains expanded.
3. Unique FPGA / Power Module has no instance badge; power stays visible.
4. Focus automatically fits; test zoom +/- and fullscreen resize.
5. During SCR05 focus, **檢查座標隔離** reports original positions and the layout
   callback counter does not increase. It may increase for full auto-layout.
6. Fit Whole Network returns to the full graph. Merely tabbing through the
   original toolbar does not dismiss group view.
7. Switch the fixture to SCR07 canvas and repeat focus/return/zoom checks.
8. `npm test` checks view filtering, stable ordering, parallel-edge retention,
   both element builders and model immutability, alongside all existing tests.

Only UI modules, canvas rendering and this regression fixture are changed.
Solver, resistance formulas, graph generation, boundary evaluation, stores and
project persistence are outside the change scope.
