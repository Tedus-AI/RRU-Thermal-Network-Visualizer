# App Shell Contract

**Status:** Binding for all screens 01–12.
**Supersedes:** any Header / Sidebar / Status Bar design drawn in an individual
screen mockup.

## Why this document exists

`00.png` and `01.png` established a dark-navy application chrome. `02.png` was
drawn with a different one (white header, white sidebar, extra `00 Dashboard`
entry). Adopting each mockup's chrome would mean re-skinning the whole tool every
time a new screen package arrives.

The resolution: **the App Shell is fixed and owned centrally; individual screen
mockups contribute workflow ideas, not chrome.**

## The shell

```text
AppShell
├─ TopHeader          src/app/TopHeader.tsx
├─ MainSidebar        src/app/MainSidebar.tsx
├─ BreadcrumbBar      src/app/BreadcrumbBar.tsx
├─ ScreenWorkspace    src/app/ScreenWorkspace.tsx   (each screen renders through it)
└─ BottomStatusBar    src/app/BottomStatusBar.tsx
```

### Kept from 00 / 01

- Dark navy Top Header, Left Sidebar and Bottom Status Bar.
- Project selector and active Scenario selector in the header.
- Save / Import / Export / Settings / Help header actions.
- Engineering status bar: project id, scenario, dirty state, save state,
  component count, node count, solver state.

### Adopted from the 02 mockup

- Breadcrumb bar.
- Bilingual sidebar labels (English primary, Traditional Chinese beneath).
- Page titles rendered as `English / 中文`.
- Bilingual form-section and table headers where space allows.
- A workflow stepper — but see below, it is **not** part of the shell.

### Explicitly rejected

- The white header and white sidebar from `02.png`.
- The extra `00 Dashboard` sidebar entry (not in the architecture document; add it
  only when it has its own specification).

## Rules for screens 03–12

1. A screen renders its content through `ScreenWorkspace`. It does not render its
   own header, sidebar, breadcrumb or status bar.
2. A screen may not restyle the shell, change its colours, or add chrome-level
   controls. Anything that belongs to every screen is a shell change, made once,
   here.
3. When a new mockup shows different chrome, implement the mockup's **workflow and
   content**, and keep this shell. Raise the discrepancy rather than forking the
   design.
4. `WorkflowStepper` is **screen-specific**, not shell. Only wizard-style screens
   render one, passed into `ScreenWorkspace`'s `stepper` slot. Screen 02's is:

   ```text
   Source → Mapping → Validate → Duplicates → Apply
   ```

## Language rule (from 02 §3)

English first, from Screen 02 onward.

- Space permitting, show both: `Import Source / 匯入來源`.
- Where space is tight, show English and expose the Traditional Chinese through an
  accessible tooltip — use `FieldLabel` / `BilingualTooltip`
  (`src/ui/FieldLabel.tsx`), never the browser's native `title` attribute alone.
- Screen 01 predates this rule; its sidebar entry and page title follow it, and
  its form body was intentionally left as-is.
