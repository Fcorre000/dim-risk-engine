# Requirements: DimRisk Engine

**Defined:** 2026-04-01
**Core Value:** Surface every DIM billing anomaly and cost overcharge so the manager has real dispute candidates, not guesswork.

## v1 Requirements

### File Ingestion

- [x] **ING-01**: User can upload .xlsx or .csv via drag-and-drop or file picker
- [x] **ING-02**: Backend parses file with pandas and extracts all shipment rows
- [x] **ING-03**: Pricing Zone normalized ('2' → '02', non-standard → 'Other') before inference
- [x] **ING-04**: Leakage columns stripped before inference: "Shipment Rated Weight(Pounds)", "Net Charge Billed Currency"

### Inference

- [x] **INF-01**: xgb_classifier.pkl loaded once at startup, predicts DIM flag probability (34 unscaled features)
- [x] **INF-02**: xgb_regressor.pkl loaded once at startup, predicts net charge (log-space → np.expm1)
- [x] **INF-03**: DIM anomaly flagged: model DIM=N probability > 0.6 AND FedEx charged DIM=Y → "Unexpected"
- [x] **INF-04**: Cost anomaly flagged: actual charge > predicted × 1.25 → "Review"
- [ ] **INF-05**: /analyze POST endpoint returns per-shipment JSON in < 1s for 5,000 rows

### Overview Dashboard

- [ ] **OVR-01**: KPI cards — Total shipments, DIM-flagged (count + %), Dispute candidates, Est. recoverable $
- [ ] **OVR-02**: DIM flag rate by pricing zone (horizontal bar chart, Recharts)
- [ ] **OVR-03**: Monthly actual vs predicted charge grouped bar chart with gap label
- [ ] **OVR-04**: Anomaly table with filter (All / Unexpected / Review) and Export CSV button
- [ ] **OVR-05**: Table shows: Tracking #, Service, Dims, Weight, Zone, Actual $, Predicted $, Flag badge
- [ ] **OVR-06**: Upload card shows filename, shipment count, analysis time, Analyzed badge

### Anomalies Page

- [ ] **ANO-01**: Filtered table of all flagged rows with full detail
- [ ] **ANO-02**: Sortable by flag type, actual $, gap $

### By Zone Page

- [ ] **ZON-01**: DIM flag rate per pricing zone
- [ ] **ZON-02**: Cost gap (actual − predicted) per zone

### By SKU Page

- [ ] **SKU-01**: Anomaly stats aggregated by service type / SKU

### Trends Page

- [ ] **TRD-01**: Month-over-month actual vs predicted charge trend line
- [ ] **TRD-02**: Running dispute candidate count over time

### Export

- [ ] **EXP-01**: Export dispute candidates as CSV with columns: Tracking #, Flag type, Actual $, Predicted $, Gap $

### UI / UX

- [ ] **UI-01**: Dark mode dashboard matching DimRisk mockup
- [ ] **UI-02**: Left sidebar navigation (Overview, Anomalies, By zone, By SKU, Trends, Export)
- [ ] **UI-03**: Tailwind CSS utility styling throughout
- [ ] **UI-04**: Recharts for all data visualizations
- [ ] **UI-05**: Responsive layout

## v2 Requirements

### Authentication

- **AUTH-01**: User can sign up with email and password
- **AUTH-02**: User sessions persist across browser refresh
- **AUTH-03**: Multiple users / accounts with isolated data

### Persistence

- **PERS-01**: Upload history stored per account
- **PERS-02**: Trend data accumulated across uploads over time

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auth / accounts | Deferred to v2 — validate tool value first |
| Model retraining | Models are fixed artifacts, inference only |
| FedEx API integration | File upload only, no direct carrier API |
| Background jobs / scheduling | Free tier, stateless architecture |
| Real-time collaboration | Single-user tool for v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ING-01 – ING-04 | Phase 1 | Pending |
| INF-01 – INF-05 | Phase 1 | Pending |
| OVR-01 – OVR-06 | Phase 2 | Pending |
| UI-01 – UI-05 | Phase 2 | Pending |
| ANO-01 – ANO-02 | Phase 3 | Pending |
| ZON-01 – ZON-02 | Phase 3 | Pending |
| SKU-01 | Phase 3 | Pending |
| TRD-01 – TRD-02 | Phase 4 | Pending |
| EXP-01 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after initial definition*
