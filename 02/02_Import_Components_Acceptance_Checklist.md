# 02 Import Hardware Components — Acceptance Checklist

## Sources
- [ ] Existing Project import works.
- [ ] CSV import works.
- [ ] Excel import works.
- [ ] Excel sheet selection works.
- [ ] Paste Table works.

## Staging
- [ ] Preview uses staging store.
- [ ] Preview does not write directly to componentStore.
- [ ] Cancel clears staging.

## Mapping
- [ ] Canonical columns auto-map.
- [ ] Alias headers auto-map.
- [ ] Manual mapping works.
- [ ] Ignore Column works.

## Validation
- [ ] Empty Component is error.
- [ ] Qty <= 0 is error.
- [ ] Power < 0 is error.
- [ ] Rjc < 0 is error.
- [ ] Missing Rjc is warning.
- [ ] Missing Limit is warning.
- [ ] Zero Power is allowed.
- [ ] Parse failures never silently become zero.

## Duplicate
- [ ] Skip works.
- [ ] Replace works.
- [ ] Merge Non-empty works.
- [ ] New Variant works.
- [ ] Per-row override works.

## Integrity
- [ ] Provenance saved.
- [ ] Unknown metadata preserved.
- [ ] Legacy adapter exists.

## Network safety
- [ ] Import does not create Nodes/Edges.
- [ ] Relevant changes mark solver DIRTY.
- [ ] New components mark network review required.
- [ ] Total Power is never treated as Edge Q.

## UI
- [ ] English primary.
- [ ] Traditional Chinese bilingual/tooltip support.
- [ ] Status uses icon/text, not color only.
- [ ] Empty/loading/error/read-only/success states exist.
- [ ] Validation issues can focus/filter rows.
- [ ] Apply & Continue routes to Screen 04.
