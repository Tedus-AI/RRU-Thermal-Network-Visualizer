# 99 Master Acceptance Checklist

## Architecture and ownership

- [ ] Screen 04 Component Master values feed every new Screen 07 solve through an immutable clone; Screen 05 topology is not rewritten.
- [ ] Screen 05 owns topology, templates, ports, graph Rth slots and layout.
- [ ] Screen 06 owns scenario boundary overlays; Screen 01 shared defaults synchronize into that overlay.
- [ ] Screen 07 owns scenario analytical solutions and never writes temperatures/Q back to master data.
- [ ] Screen 08 stores analysis identity and frozen source revision.
- [ ] Screen 09 stores a formal `distributionId`, rows and frozen source revision; UI transients are not persisted.
- [ ] Screens 10-12 consume the formal Screen 09 result rather than creating a second authoritative distribution.
- [ ] Screen 03 is visibly Deferred and contains no parser, guessed FloTHERM format or fake CFD result.

## Freshness and invalidation

- [ ] Component power/Rth edit changes `solver_input_revision`, makes Screen 07 stale, and changes a subsequent solve result/signature.
- [ ] Limit-only edit advances `component_revision` and `limit_revision` but leaves `solver_input_revision`, Screen 07 and `requiresReview` unchanged.
- [ ] Limit-only edit makes 08 DIRTY, 09 DIRTY/STALE, 10 non-current, 11 STALE and relevant 12 artifacts BLOCKED/WARNING.
- [ ] Boundary/scenario edit makes the old solution stale and cannot be stamped as current without a re-solve.
- [ ] Stored results compare both exact signatures and authoritative source revisions.
- [ ] Dirty reasons identify the actual change category rather than using `component_power_changed` for every physical edit.

## Persistence and recovery

- [ ] `requiresReview` plus reasons survive navigation/reload and clear only through an explicit reviewed save/action.
- [ ] Undo/Redo deep-copies nested ports, Rth provenance, overrides and layout.
- [ ] Invalid localStorage JSON enters explicit recovery/read-only mode; the raw blob is preserved and later saves cannot silently overwrite it.
- [ ] Existing unknown project/network fields survive merge-save.

## Golden Demo

- [ ] The non-confidential Golden Demo loads from Screen 01 and navigates 01-12, with Screen 03 Deferred.
- [ ] Demo topology and boundary validation have zero blocking errors.
- [ ] Demo Screen 07 solution is current and energy-balanced.
- [ ] Demo Screen 08 analysis, Screen 09 distribution, Screen 10 overview, Screen 11 snapshot/payload and Screen 12 readiness are current.
- [ ] A mutation test proves the complete downstream invalidation chain, not only the happy path.

## Verification gate

- [ ] `npm run typecheck`
- [ ] `npm test -- --run`
- [ ] `npm run build`
- [ ] Browser smoke: load Golden Demo, visit 01, 02, 04-12, confirm no runtime errors and verify Deferred Screen 03.
- [ ] No unexpected schema deletion or route change; migrations are additive and legacy results become stale rather than being misrepresented as current.
