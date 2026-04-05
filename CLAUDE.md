# DimRisk Engine — Shipping Intelligence Dashboard

## What this project is
A web app that accepts FedEx invoice exports (.xlsx or .csv) and runs
two trained ML models to surface DIM billing anomalies and overcharge
candidates.

## Stack
- Backend: FastAPI (Python 3.10) in api/
- Frontend: React + Vite + Recharts in frontend/
- Models: XGBoost .pkl files in models/ — DO NOT retrain these

## Model facts (critical)
- xgb_classifier.pkl: predicts DIM flag (Y/N), input = 34 unscaled features
- xgb_regressor.pkl: predicts net charge, output is log-space — always
  wrap with np.expm1() before returning dollars
- Leakage columns NEVER in input:
    Shipment Rated Weight(Pounds)
    Net Charge Billed Currency
- Pricing Zone must be normalized: '2' → '02', non-standard → 'Other'

## Anomaly logic
- DIM flag anomaly: model predicts DIM=N probability > 0.6 but FedEx
  charged DIM=Y → "Unexpected" → dispute candidate
- Cost anomaly: actual charge > predicted * 1.25 → "Review"

## Demo / sample data button
- "Try 3,000-row sample invoice" button lives in `UploadZone` — calls `onDemoLoad` prop
- `onDemoLoad` in `App.tsx` hits `GET /demo/stream` on the backend (no file upload)
- `/demo/stream` in `api/main.py` reads `api/sample_invoice.csv` server-side and streams
  NDJSON in the same format as `/analyze/stream`
- `api/sample_invoice.csv` is the first 3,000 rows of the real invoice — UTF-8 (no BOM),
  LF line endings, committed to git via `.gitignore` exception `!api/sample_invoice.csv`
- Do NOT use a client-side fetch-blob-File approach for the demo — it breaks on the
  deployed static site because the CSV must be served by the backend, not the frontend

## Streaming architecture
- `/analyze/stream` returns NDJSON (one JSON object per line)
- First line is always `{"__meta__": true, "total": N}` where N is row count
  (null if unknown)
- Subsequent lines are `ShipmentResult` objects
- Error lines: `{"__error__": "message"}`
- Backend reads file bytes eagerly in the async handler, then wraps in
  `io.BytesIO` for the sync generator — never pass `UploadFile.file` into
  the threadpool (SpooledTemporaryFile lifecycle is unreliable)
- `parse_invoice_chunks()` in `api/ingest.py` yields DataFrames in
  configurable chunk sizes (default 1000 rows)
- Leakage columns are NOT stripped in the chunker — `run_inference` reads
  `Net Charge Billed Currency` directly; `build_feature_matrix` isolates
  model input via `reindex(columns=FEATURE_COLS)`
- XLSX row counting uses openpyxl `read_only` mode (`ws.max_row`) so the
  frontend progress bar works for both CSV and XLSX uploads

## Frontend progress bar & streaming KPIs
- Progress bar fills proportionally when `totalCount` is known (CSV/XLSX)
- Falls back to indeterminate shimmer when `totalCount` is null
- KPI counters (dimFlaggedCount, disputeCandidates, estRecoverable) are accumulated
  incrementally (O(1) per row) in `streamingKpis` state — never recomputed from the
  full array during streaming
- `flushSync` from `react-dom` wraps each `setUploadState` call every 50 rows — this
  forces React 18 to commit to the DOM synchronously before the stream loop continues.
  Without it, React 18's automatic batching defers renders past the yield point.
- `setTimeout(resolve, 0)` after each flushSync yields to the browser to actually paint
- Full results array flushed every 500 rows (for charts); tail rows flushed once after
  the stream ends so KPIs don't freeze near completion
- `OverviewPage` wraps computeKpis/computeZoneData/computeMonthlyData in `useMemo`
  so they only rerun when `results` changes, not on every 50-row KPI update

## Source data reference
The real FedEx invoice is `FedEx_ShipmentDetail.xlsx` (root dir, ~50k rows).
A 50-row CSV extract is at `test_invoice_50rows.csv` (fewer columns — no dates).
**Always cross-reference these files** when building features or displaying
shipment fields. The XLSX has 65 columns; key ones not in the CSV:
  - Col G: `Shipment Date (mm/dd/yyyy)`
  - Col H: `Shipment Delivery Date (mm/dd/yyyy)`
  - Col 2: `Invoice Month (yyyymm)`

### Past bug: fake derive* functions
The frontend originally used `deriveDims()`, `deriveWeight()`, `deriveZone()`,
`deriveService()`, and `deriveMonth()` — placeholder functions that hashed the
tracking number to generate fake dimensions, weight, zone, service type, and
month buckets. These were replaced with real data from the backend API. All
display fields (dims, weight, zone, service type, shipment date) now come from
the actual invoice columns parsed in `api/inference.py`.

## Full model context
See docs/ folder — read 01_eda_notes.docx and model_results_reference.docx
before writing any inference code.

## Run commands
Backend:  cd api && uvicorn main:app --reload --port 8000
Frontend: cd frontend && npm run dev

## Skills
When building any React component or UI, read and follow:
.claude/skills/ui-ux-pro-max/.claude/skills/ui-ux-pro-max/SKILL.md

Apply these design rules to every component in frontend/src/
