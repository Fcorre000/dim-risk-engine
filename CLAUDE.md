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

## Frontend progress bar
- Progress bar fills proportionally when `totalCount` is known (CSV/XLSX)
- Falls back to indeterminate shimmer when `totalCount` is null
- `shipmentCount` updates on every row; full results array clones every
  200 rows to avoid expensive renders
- `requestAnimationFrame` yield every 50 rows to force React to paint
  intermediate states (React 18 batches synchronous setState calls)

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
