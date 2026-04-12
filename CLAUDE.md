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
- Models trained on 57,600 real FedEx shipments (25 months, Apr 2024 – Apr 2026)
  from a mattress manufacturer. Training repo: shipping-dim-xgboost-pytorch
- xgb_classifier.pkl: predicts DIM flag (Y/N), input = 41 unscaled features
  - Test metrics: Accuracy 0.9974, F1 0.9959, ROC AUC 0.9997
- xgb_regressor.pkl: predicts net charge, output is log-space — always
  wrap with np.expm1() before returning dollars
  - Test metrics: MAE $3.88, RMSE $7.60, R² 0.8658
  - Target is log-transformed (np.log1p) due to extreme skewness (23.1)
  - Charges above $200 are excluded from training (top 0.50%, 285 rows)
- Leakage columns NEVER in input:
    Shipment Rated Weight (Pounds)
    Net Charge Billed Currency
- Pricing Zone must be normalized: '2' → '02', non-standard → 'Other'
- Dimensions are in **centimeters** (cm), not inches — column names are
  `Dimmed Height (cm)`, `Dimmed Width (cm)`, `Dimmed Length (cm)`

## Model feature engineering (41 features)
- Engineered from raw invoice columns, then one-hot encoded:
  ```
  volume              = height_cm * width_cm * length_cm
  dim_weight_calculator = volume / 139
  dim_weight_ratio    = dim_weight_calculator / actual_weight
  billable_weight     = max(actual_weight, dim_weight_calculator)
  billable_weight_ceil = ceil(billable_weight)
  has_dimensions      = 1 if all dims > 0, else 0
  ship_year           = shipment_date.year
  ship_month          = shipment_date.month
  months_since_start  = (year - 2024) * 12 + (month - 4)   # April 2024 = 0
  ```
- One-hot encoded categoricals:
  - Service Type: CTAG, ES, FO, MWT, ON, PO, QH, RMGR, RW, S7, S8, SG, SO, TA, XS
  - Pay Type: Bill_Recipient, Bill_Sender_Prepaid, Bill_Third_Party, Other4
  - Zone: 02, 03, 04, 05, 06, 07, 08, 09, 17, Other
- Time features (ship_year, ship_month, months_since_start) capture FedEx annual
  rate card hikes (~5–7%), monthly fuel surcharges (DOE diesel), and peak season
  surcharges — together explain ~40% mean-charge swing across the 25-month window
- SHAP top drivers: classification = dim_weight_ratio; regression = Original Weight,
  zone_08/07, billable_weight, months_since_start

## Anomaly logic
- DIM flag anomaly: model predicts DIM=N probability > 0.6 but FedEx
  charged DIM=Y → "Unexpected" → dispute candidate
  - `dim_confidence` = P(DIM=N) from the classifier (e.g. 0.87 → displayed as "87%")
- Cost anomaly: actual charge > predicted_net_charge_high (90th-percentile upper bound) → "Review"
  - Previously was `actual > predicted * 1.25`; now uses the calibrated upper bound
  - `cost_confidence` = severity grade computed from `(actual - predicted_high) / (predicted_high - predicted_low)`: `"Low"` (< 0.5×), `"Medium"` (0.5–1×), `"High"` (1–2×), `"Critical"` (≥ 2×)

## Prediction intervals (residual-based)
- `models/residual_quantiles.json` stores calibrated log-space residual quantiles:
  `{"q05": -0.134852, "q95": 0.325461}` — generated once by `scripts/calibrate_residuals.py`
- At inference time: `pred_low = expm1(log_pred + q05)`, `pred_high = expm1(log_pred + q95)`
- These form a ~90% prediction interval for the net charge
- `load_residual_quantiles(models_dir)` in `api/inference.py` loads this file with
  fallback defaults so the API works even if the JSON is missing
- Do NOT re-run calibration unless you have a new calibration dataset — the quantiles
  are stable across the sample invoice (2,999 rows)
- Recoverable estimate uses `actual - predicted_net_charge_high` (conservative — only
  counts overcharge above the upper bound, not the point prediction)

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
The real FedEx invoice data is `2years.csv` (root dir, 57,600 rows, Apr 2024 – Apr 2026).
66 columns; key ones:
  - `Shipment Date (mm/dd/yyyy)` — used for temporal features
  - `Shipment Delivery Date (mm/dd/yyyy)`
  - `Invoice Month (yyyymm)` — ranges 202404 to 202604
  - `Dimmed Height (cm)`, `Dimmed Width (cm)`, `Dimmed Length (cm)` — in centimeters
  - `Shipment Tracking Number` — aliased to `Tracking Number` at parse time
  - `Pieces In Shipment` — capital I (not used by models but present in data)
**Always cross-reference this file** when building features or displaying shipment fields.

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

## Cold start handling (Render free tier)
- Render spins down the API after 15 min inactivity; first request takes ~60 seconds
- **Keep-alive:** UptimeRobot pings `GET /health` every 5 minutes — prevents spin-down under normal traffic
- **UX fallback:** `App.tsx` fires `GET /health` on mount with a 3-second timer
  - If health check resolves within 3s → server was warm, nothing shown
  - If 3 seconds pass without response → `serverStatus` set to `'warming'`, amber fixed banner shown
  - When health check resolves → `serverStatus` set to `'ready'`, banner disappears
  - Both `.then()` and `.catch()` set `'ready'` so the banner never gets stuck
- Banner is `fixed top-0 z-50` — works on all pages without touching `MainLayout`
- `cancelled` flag in the `useEffect` cleanup prevents state updates after unmount

## Rate limiting and file size cap
- Both `/analyze` and `/analyze/stream` enforce a **50 MB file size cap** (`MAX_FILE_BYTES` in `api/main.py`) — returns HTTP 413
- Both endpoints enforce a **sliding-window rate limit** of 10 requests/60 seconds per IP (`RATE_LIMIT`, `RATE_WINDOW`) — returns HTTP 429
- State stored in `_rate_limit_store` (module-level `defaultdict` of timestamps) — in-memory only, resets on restart; fine for single-worker Render deploy
- `/demo/stream` is intentionally excluded — no file upload, no abuse surface
- Tests in `api/tests/test_api.py`: `clear_rate_limit_store` autouse fixture wipes state between tests; `patch.object(main_module, "MAX_FILE_BYTES", 1)` used to avoid uploading 50 MB in tests

## Run commands
Backend:  cd api && uvicorn main:app --reload --port 8000
Frontend: cd frontend && npm run dev

## Skills
When building any React component or UI, read and follow:
.claude/skills/ui-ux-pro-max/.claude/skills/ui-ux-pro-max/SKILL.md

Apply these design rules to every component in frontend/src/
