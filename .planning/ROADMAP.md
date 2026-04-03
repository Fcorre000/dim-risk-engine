# Roadmap: DimRisk Engine

## Overview

The project ships in five phases. Phase 1 delivers the backend inference API — the analytical core that every UI page depends on. Phase 2 builds the core dashboard: file upload, KPI cards, charts, and anomaly table. Phase 3 adds the four detail pages that let the manager drill into anomalies by zone and SKU. Phase 4 adds trends and dispute-candidate CSV export. Phase 5 deploys the full stack to Render/Railway with performance validation and an end-to-end smoke test. Every v1 requirement maps to exactly one of these phases.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Backend Inference API** - FastAPI + XGBoost inference endpoint that accepts file upload and returns per-shipment anomaly JSON (completed 2026-04-02)
- [ ] **Phase 2: Core Dashboard** - React/Tailwind dark-mode dashboard with file upload, KPI cards, charts, and anomaly table
- [ ] **Phase 3: Detail Pages** - Anomalies, By Zone, and By SKU drill-down pages wired to sidebar navigation
- [ ] **Phase 4: Trends + Export** - Month-over-month trend charts and dispute-candidate CSV export
- [ ] **Phase 5: Deployment + Polish** - Production deployment, CORS/env config, performance validation, smoke test

## Phase Details

### Phase 1: Backend Inference API
**Goal**: A running FastAPI service that accepts an invoice file upload and returns a per-shipment anomaly JSON array in under one second for 5,000 rows.
**Depends on**: Nothing (first phase)
**Requirements**: ING-01, ING-02, ING-03, ING-04, INF-01, INF-02, INF-03, INF-04, INF-05
**Success Criteria** (what must be TRUE):
  1. POST /analyze accepts a .xlsx or .csv file and returns a JSON array with one object per shipment row
  2. Each response object contains tracking number, DIM flag probability, predicted net charge (dollars, not log-space), cost anomaly flag, and DIM anomaly flag
  3. Pricing Zone values are normalized ('2' -> '02', non-standard -> 'Other') before any model input
  4. Leakage columns "Shipment Rated Weight(Pounds)" and "Net Charge Billed Currency" never appear in model feature input
  5. A 5,000-row invoice returns a complete response in under one second (measured with curl or a test script)
**Plans:** 4/4 plans complete

Plans:
- [x] 01-01: FastAPI app skeleton — project structure, uvicorn startup, health check route, model loading at startup from models/
- [x] 01-02: File ingestion + pandas parsing — multipart file upload, xlsx/csv detection, column extraction, zone normalization, leakage column stripping
- [x] 01-03: Inference pipeline — feature assembly, classifier predict_proba, regressor predict + np.expm1, DIM anomaly logic, cost anomaly logic
- [x] 01-04: /analyze endpoint + response schema — wire ingestion to inference, define Pydantic response model, return JSON array, validate < 1s on 5k rows

### Phase 2: Core Dashboard
**Goal**: A working dark-mode React dashboard where the manager uploads an invoice and immediately sees KPI cards, zone chart, actual-vs-predicted chart, and a filterable anomaly table.
**Depends on**: Phase 1
**Requirements**: OVR-01, OVR-02, OVR-03, OVR-04, OVR-05, OVR-06, UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. User can drag-and-drop or click-to-select a .xlsx or .csv file; the upload card shows filename, shipment count, analysis time, and an "Analyzed" badge after the API call completes
  2. Four KPI cards display: Total shipments, DIM-flagged count and percent, Dispute candidates count, and Est. recoverable dollar amount
  3. A horizontal Recharts bar chart shows DIM flag rate by pricing zone
  4. A grouped Recharts bar chart shows monthly actual vs predicted net charge with gap labeled
  5. An anomaly table shows Tracking #, Service, Dims, Weight, Zone, Actual $, Predicted $, and Flag badge; a dropdown filters to All / Unexpected / Review
**Plans:** 5 plans

Plans:
- [x] 02-01-PLAN.md — React + Vite + TypeScript + Tailwind + Recharts scaffold; dark mode enabled; `npm run build` passes
- [x] 02-02-PLAN.md — Dark-mode layout shell: Sidebar (6 nav links), MainLayout (responsive lg:flex), API types (ShipmentResult, PageId, UploadState), page router in App.tsx
- [x] 02-03-PLAN.md — File upload: UploadZone (drag-and-drop + click, loading spinner, error state), UploadStatusCard (filename/count/time/Analyzed badge), real POST to /analyze
- [x] 02-04-PLAN.md — KPI cards + zone chart: metrics.ts (computeKpis, computeZoneData), KpiCard component, ZoneChart (horizontal Recharts BarChart layout=vertical)
- [x] 02-05-PLAN.md — Actual vs predicted chart + anomaly table: computeMonthlyData, ActualVsPredictedChart (grouped bars + gap LabelList), AnomalyTable (8 columns, filter dropdown, flag badges)

**UI hint**: yes

### Phase 3: Detail Pages
**Goal**: Four drill-down pages accessible from the sidebar give the manager full anomaly detail, zone-level breakdowns, and service-type aggregations.
**Depends on**: Phase 2
**Requirements**: ANO-01, ANO-02, ZON-01, ZON-02, SKU-01
**Success Criteria** (what must be TRUE):
  1. Clicking "Anomalies" in the sidebar shows a table of only flagged rows with full detail columns; the table is sortable by flag type, actual $, and gap $
  2. Clicking "By Zone" shows DIM flag rate per pricing zone and cost gap (actual minus predicted) per zone
  3. Clicking "By SKU" shows anomaly statistics aggregated by service type
  4. All three pages use the same dark-mode layout and Tailwind styling as the Overview page
**Plans**: 0/3 plans complete

Plans:
- [ ] 03-01-PLAN.md — Anomalies page: sortable full-page table of all flagged rows (9 columns: Tracking #, Service, Dims, Weight, Zone, Actual $, Predicted $, Gap $, Flag)
- [ ] 03-02-PLAN.md — By Zone page: computeZoneDetails in metrics.ts, ZoneChart reuse + zone stats table with actual/predicted/gap per zone
- [ ] 03-03-PLAN.md — By SKU page: computeSkuData in metrics.ts, service-type aggregation table with anomaly counts and total gap $

**UI hint**: yes

### Phase 4: Trends + Export
**Goal**: The manager can view month-over-month charge trend charts and export all dispute candidates as a ready-to-use CSV.
**Depends on**: Phase 3
**Requirements**: TRD-01, TRD-02, EXP-01
**Success Criteria** (what must be TRUE):
  1. The Trends page shows a month-over-month line chart of actual vs predicted net charge
  2. The Trends page shows a running dispute candidate count over time
  3. Clicking the Export button (on Overview or the Export page) downloads a CSV with columns: Tracking #, Flag type, Actual $, Predicted $, Gap $
**Plans**: TBD

Plans:
- [ ] 04-01: Trends page — derive monthly buckets from response data, render actual vs predicted line chart and dispute candidate count line chart using Recharts
- [ ] 04-02: Export page + CSV download — aggregate dispute candidates, generate CSV client-side, trigger browser download via Blob/URL.createObjectURL

**UI hint**: yes

### Phase 5: Deployment + Polish
**Goal**: The full stack is deployed on Render/Railway from GitHub, passes a performance check, and survives an end-to-end upload-to-results smoke test.
**Depends on**: Phase 4
**Requirements**: (cross-cutting — no new v1 requirements; validates INF-05 at production scale)
**Success Criteria** (what must be TRUE):
  1. The FastAPI service is live at a public URL on Render or Railway, auto-deploying from the main branch
  2. The React frontend is served as a production Vite build, also at a public URL
  3. CORS is configured so the frontend origin is allowed; all secrets are in environment variables, none hardcoded
  4. Uploading a 5,000-row invoice through the live production UI returns results in under one second
  5. An end-to-end smoke test (upload sample invoice, verify anomaly table populates, verify KPI cards show non-zero values) passes without errors
**Plans**: TBD

Plans:
- [ ] 05-01: Backend deployment — render.yaml or Railway config, env var setup (MODEL_PATH, CORS_ORIGINS), gunicorn/uvicorn worker config, health check route
- [ ] 05-02: Frontend deployment — Vite production build, static site deploy config, VITE_API_URL env var pointing to live backend
- [ ] 05-03: Performance + smoke test — run 5k-row upload against production URL, measure response time, run manual end-to-end check, document results

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend Inference API | 4/4 | Complete   | 2026-04-02 |
| 2. Core Dashboard | 0/5 | Not started | - |
| 3. Detail Pages | 0/3 | Not started | - |
| 4. Trends + Export | 0/2 | Not started | - |
| 5. Deployment + Polish | 0/3 | Not started | - |
