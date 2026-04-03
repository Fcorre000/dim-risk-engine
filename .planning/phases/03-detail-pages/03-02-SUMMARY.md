---
plan: 03-02
phase: 03-detail-pages
status: complete
completed: 2026-04-02
---

## Summary

Built the By Zone detail page — reuses ZoneChart from Overview and adds a 7-column zone stats table sorted by total cost gap descending.

## What Was Built

- `frontend/src/lib/metrics.ts` — Added `ZoneDetailPoint` interface and `computeZoneDetails()` function. Aggregates per-zone actual/predicted totals, gap, and unexpected count. Sorted by gapTotal descending.
- `frontend/src/pages/ByZonePage.tsx` — Page with header (showing total gap in subtitle), ZoneChart (DIM flag rate bar chart), and Zone Summary table with 7 columns (Zone, Shipments, DIM Flag Rate, Unexpected, Total Actual, Total Predicted, Total Gap). DIM rate color-coded: rose >50%, amber >25%, blue otherwise. Gap color-coded: rose for overcharge, emerald for savings.
- `frontend/src/App.tsx` — Added `ByZonePage` import and replaced `PlaceholderPage title="By Zone"` with `<ByZonePage uploadState={uploadState} />`.

## Key Decisions

- Reused `computeZoneData` for ZoneChart (existing type) and added new `computeZoneDetails` for table (extended type) — avoids modifying existing chart interfaces.
- Zone derivation logic duplicated inline in `computeZoneDetails` to match existing `deriveZone` pattern in metrics.ts.

## Self-Check: PASSED

- `computeZoneDetails` exported from metrics.ts ✓
- `ZoneDetailPoint` interface exported ✓
- `gapTotal` field present ✓
- `ZoneChart` and `computeZoneDetails` imported in ByZonePage ✓
- `role="table"` aria label present ✓
- App.tsx has 2 ByZonePage references ✓
- `npm run build` exits 0 ✓

## key-files

### created
- frontend/src/pages/ByZonePage.tsx

### modified
- frontend/src/lib/metrics.ts
- frontend/src/App.tsx
