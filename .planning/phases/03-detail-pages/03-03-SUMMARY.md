---
plan: 03-03
phase: 03-detail-pages
status: complete
completed: 2026-04-02
---

## Summary

Built the By SKU detail page — aggregates anomaly statistics by FedEx service type with a 7-column table sorted by total cost gap.

## What Was Built

- `frontend/src/lib/metrics.ts` — Added `SkuDataPoint` interface and `computeSkuData()` function. Groups results by service type (derived from last digit of tracking number), aggregates count, DIM-flagged, unexpected, review counts, actualTotal, and gapTotal. Sorted by gapTotal descending.
- `frontend/src/pages/BySkuPage.tsx` — Page with header (service count + unexpected count + total gap in subtitle) and Service Type Summary table with 7 columns (Service, Shipments, DIM-Flagged w/%, Unexpected, Review, Total Actual, Total Gap). DIM rate color-coded: rose >50%, amber >25%, blue otherwise. Unexpected rose, Review amber, gap rose/emerald.
- `frontend/src/App.tsx` — Added `BySkuPage` import and replaced `PlaceholderPage title="By SKU"` with `<BySkuPage uploadState={uploadState} />`.

## Key Decisions

- `deriveServiceFromTracking` defined as module-private in metrics.ts (not exported) — only used inside `computeSkuData`.
- DIM-Flagged column shows both count and percentage for quick scanning without needing to divide mentally.

## Self-Check: PASSED

- `export function computeSkuData` in metrics.ts ✓
- `SkuDataPoint` interface exported ✓
- `computeSkuData` imported in BySkuPage ✓
- `role="table"` aria label present ✓
- App.tsx has 2 BySkuPage references (import + usage) ✓
- No `PlaceholderPage title="By SKU"` remaining ✓
- `npm run build` exits 0 ✓

## key-files

### created
- frontend/src/pages/BySkuPage.tsx

### modified
- frontend/src/lib/metrics.ts
- frontend/src/App.tsx
