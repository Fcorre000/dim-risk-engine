---
plan: 03-01
phase: 03-detail-pages
status: complete
completed: 2026-04-02
---

## Summary

Built the Anomalies detail page — a full-page sortable table showing every flagged shipment with 9 columns and sort controls for Flag, Actual $, and Gap $.

## What Was Built

- `frontend/src/pages/AnomaliesPage.tsx` — Full-page sortable anomaly table with 9 columns (Tracking #, Service, Dims, Weight, Zone, Actual $, Predicted $, Gap $, Flag), sort state for `flag | actual | gap` columns, toggle asc/desc, Gap $ computed as `actual - predicted` with color coding (rose for overcharge, emerald for undercharge), FlagBadge component, empty state, and row count subtitle.
- `frontend/src/App.tsx` — Added `AnomaliesPage` import and replaced `PlaceholderPage title="Anomalies"` with `<AnomaliesPage uploadState={uploadState} />`.

## Key Decisions

- Reused derive helpers (`deriveService`, `deriveDims`, `deriveWeight`, `deriveZone`) inline to match AnomalyTable.tsx conventions.
- Default sort is gap descending (largest potential savings first) — most actionable view.
- Gap $ shows sign prefix (`+` for overcharge) and color-coded text for quick scanning.
- No pagination limit — dedicated page shows all rows vs. overview table's 100-row cap.

## Self-Check: PASSED

- `sortCol` state and `handleSort` function present ✓
- `role="table"` aria label present ✓
- App.tsx has 2 AnomaliesPage references (import + usage) ✓
- No `PlaceholderPage title="Anomalies"` remaining ✓
- `npm run build` exits 0 ✓

## key-files

### created
- frontend/src/pages/AnomaliesPage.tsx

### modified
- frontend/src/App.tsx
