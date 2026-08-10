# 06 Boundary Conditions Development Package

This package contains the formal development materials for Screen 06 of the `5G FR1 Thermal Network Visualizer`.

Screen 06 continues the established 00/04/05 architecture:

- 00 defines the product and general graph architecture.
- 04 manages component data and preferences but does not create graph topology.
- 05 creates thermal graph topology only.
- 06 assigns scenario-specific boundary conditions.
- 07 performs the thermal network solve.
- 03 FloTHERM Import remains deferred, but compatibility hooks must be preserved.

---

## Files

```text
06_Boundary_Conditions.md
```

Main implementation specification. This is the source of truth.

```text
06_Boundary_Conditions_mock.json
```

Mock project, scenario, topology, boundary ports, scenario boundary set, validation state, and FloTHERM deferred metadata.

```text
06_Boundary_Conditions_Tooltips_zh-TW.json
```

Traditional Chinese tooltip set for English-first UI labels.

```text
06_Boundary_Conditions_Codex_Implementation_Prompt.md
```

Direct prompt to give Codex when implementing Screen 06.

```text
06_Boundary_Conditions_Acceptance_Checklist.md
```

Verification checklist for functional, architectural, data, validation, and UX acceptance.

```text
06_Boundary_Conditions_UI.png
```

Formal Screen 06 UI reference. The PNG has been audited against the Markdown and must be interpreted with `06_Boundary_Conditions.md` as the source of truth.

---

## Most Important Rules

Screen 06 may:

- Assign ambient temperature per scenario.
- Assign convection, radiation, solar, fixed-temperature, and adiabatic boundary profiles.
- Calculate boundary-derived Rth previews.
- Calculate solar heat load preview.
- Store data source, confidence, provenance, and future FloTHERM aliases.
- Validate whether boundary inputs are ready for Screen 07.

Screen 06 must not:

- Create or delete nodes.
- Create or delete edges.
- Mutate the base topology from Screen 05.
- Run the solver.
- Display solved node temperatures.
- Display edge heat flow Q.
- Display bottleneck ranking.
- Guess FloTHERM export format.

---

## Development Order

Recommended implementation sequence:

1. Add boundary condition types and scenario boundary set schema.
2. Add pure calculation helpers for convection, radiation, combined boundary Rth, and solar heat load.
3. Add validation helpers.
4. Build the Screen 06 UI using the existing App Shell.
5. Load Screen 05 topology in read-only boundary mapping mode.
6. Add boundary inspector editing.
7. Add save and reload behavior.
8. Wire zh-TW tooltips.
9. Run acceptance checklist.
10. Continue to Screen 07 only after validation passes.

---

## Handoff Note

`06_Boundary_Conditions_UI.png` is the formal Screen 06 UI reference and has been audited against `06_Boundary_Conditions.md`. It does not introduce solved values, extra routes, topology editing tools, or features outside the Markdown. If the PNG and Markdown ever disagree, the Markdown wins.
