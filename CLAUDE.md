# DimRisk Engine — Shipping Intelligence Dashboard

## What this project is
A web app that accepts FedEx invoice exports (.xlsx or .csv) and runs
two trained ML models to surface DIM billing anomalies and overcharge
candidates.

## Stack
- Backend: FastAPI (Python 3.10) in api/
- Frontend: React + Vite + Recharts in frontend/
- Models: v2 sklearn-wrapped pickles in models/, vendored from
  `shipping-dim-xgboost-pytorch` (do NOT retrain locally — re-vendor instead)

## Model facts (critical) — v2 contract
Three model components plus an audit-triage rollup, all gated by
`api/predict.py::predict_shipment` (single row) or `predict_batch` (chunk).
Schema of truth is `docs/api_contract.md` (vendored from the ML repo).

1. **DIM classifier** — isotonic-calibrated XGBoost v2
   - `models/xgb_classifier_v2_calibrated.pkl`
   - Returns `dim_predicted` (bool), `dim_probability` (calibrated, 0–1)
   - 105 input features; replaces the old 42-feature uncalibrated classifier
2. **Net charge regressor** — conformal-wrapped XGBoost v2 (MAPIE SCR)
   - `models/xgb_regressor_v2_conformal.pkl`
   - `reg.predict_interval(X)` → `(log_point, log_interval)`; always wrap in
     `np.expm1()` to return dollars
   - Returns `charge_predicted`, `charge_lower_95`, `charge_upper_95`
   - 95% prediction interval — replaces the old residual-quantile (~90%) bands
3. **Anomaly second opinion** — IsolationForest + 105→64→16→64→105 autoencoder
   - `models/isolation_forest.pkl`, `models/autoencoder_weights.npz`,
     `models/scaler_v2.pkl`, `models/anomaly_threshold.json`
   - Each detector's raw score is mapped to a percentile rank against the
     train-time reference distribution; the two ranks are averaged
   - Returns `anomaly_score` (0–1), `anomaly_flagged` (≥ calibrated threshold)
   - **Autoencoder ships as a numpy .npz, NOT a .pt** — see "Autoencoder
     numpy port" below. torch and pytorch-lightning are NOT runtime deps.
4. **Audit triage rollup** — `review_recommended` + `review_priority`
   - Three signals: `dim_disagrees_with_fedex`, `charge_outside_interval`,
     `anomaly_flagged`. **`high`** ≥ 2 signals fired, **`medium`** = 1,
     **`low`** = 0.

## Feature engineering (105 features)
- Implemented in `api/predict.py::transform_row`; mirrors the ML repo's
  `src/02_preprocessing.py` exactly. **Do not maintain a parallel pipeline**
  in `api/ingest.py` — that file's old `build_feature_matrix` is now dead.
- Numeric features (unchanged from v1 conceptually): volume in inches³,
  dim_weight_calculator (volume / 139), dim_weight_ratio, has_dimensions,
  billable_weight, billable_weight_ceil, ship_year, ship_month,
  months_since_start (April 2024 = 4).
- **New in v2**: geographic features — `shipper_lat`, `shipper_lon`,
  `recipient_lat`, `recipient_lon` (looked up from `data/zip_lookup.parquet`),
  `origin_dest_miles` (haversine between the two), `das_type` one-hot
  (from `data/das_zips.csv` — DAS / extended-DAS / NONE).
- One-hot vocabularies: Service Type, Pay Type, zone_clean, Recipient
  State/Province, das_type. Unknown categories silently zero-fill — matches
  scikit-learn's `handle_unknown='ignore'` behaviour. **The vocabulary is
  pinned by `models/feature_columns.json`** — never hand-edit, always re-vendor
  after a retrain.

## Anomaly logic (v2 audit triage)
- DIM signal: `dim_disagrees_with_fedex` = `(dim_predicted ≠ FedEx flag)`.
  Only meaningful when ground truth is supplied; otherwise `null`.
- Cost signal: `charge_outside_interval` = `(actual < charge_lower_95 OR actual > charge_upper_95)`.
  Only meaningful when ground truth is supplied; otherwise `null`.
- Anomaly signal: `anomaly_flagged` = `(anomaly_score ≥ 0.95)` (Phase 4
  calibrated threshold loaded from `models/anomaly_threshold.json`).
- Rollup: `review_priority` is `high` if ≥ 2 fired, `medium` if exactly 1,
  `low` otherwise. The Overview "Est. recoverable" KPI sums
  `max(0, actual_net_charge - charge_upper_95)` over rows where
  `review_priority !== 'low'`.
- The old fields `dim_anomaly` / `dim_confidence` / `cost_anomaly` /
  `cost_confidence` are **gone** (April 2026 rip-out). Frontend reads
  `review_priority` directly and uses `anomaly_score` for the % chip in
  the flag cell.

## Autoencoder numpy port
- The Phase 4 autoencoder was trained in PyTorch Lightning. Shipping torch
  on Render would add ~800 MB to the image.
- `scripts/convert_autoencoder.py` extracts the eight tensors (4× weight,
  4× bias) from `models/autoencoder.pt` into `models/autoencoder_weights.npz`.
  Run once locally after re-vendoring a new `.pt`:
  ```
  python3 -m pip install --user torch --index-url https://download.pytorch.org/whl/cpu
  python3 scripts/convert_autoencoder.py
  ```
- `api/anomaly.py::_autoencoder_reconstruction_error` implements the forward
  pass in pure numpy (matmul + ReLU). Verified to reproduce torch output
  within 1.4e-6 max abs diff (float32 rounding only).
- Both `.pt` (source) and `.npz` (runtime artifact) live in `models/`. Render
  loads the npz; torch is NOT in `api/requirements.txt`.

## Artifact loading & security
- `predict._load_artifacts()` and `anomaly._load_artifacts()` are
  `@lru_cache(maxsize=1)`. `main.py::lifespan` calls them on startup so the
  first /analyze request doesn't pay the ~1 s pickle-load cost.
- **Pickle security regression vs the April 2026 UBJ migration**: v2
  artifacts (`CalibratedClassifierCV`, `MapieSplitConformalRegressor`,
  `IsolationForest`, `StandardScaler`) wrap sklearn objects that can't be
  serialised as native XGBoost UBJ, so we're back on `joblib.load` =
  pickle. RCE-on-boot if an attacker can write `models/*.pkl` before the
  process starts. Mitigation is the boundary: artifacts ship in git, deploys
  come from CI, and the running container has read-only model paths.
  Future hardening would be safetensors / ONNX for the unwrappable parts.

## Demo / sample data button
- "Try sample invoice" button lives in `UploadZone` — calls `onDemoLoad` prop
- `onDemoLoad` in `App.tsx` hits `GET /demo/stream` on the backend (no file upload)
- `/demo/stream` in `api/main.py` reads `api/sample_invoice.csv` server-side and streams
  NDJSON in the same format as `/analyze/stream`
- `api/sample_invoice.csv` contains 1,977 shipments stratified across **Mar 2024 – Mar 2026**
  (25 months), not a single month — so the Overview chart opens on monthly grouping
  for the demo, while a real one-month upload opens on daily (`pickGranularity`).
  UTF-8 (no BOM), LF line endings, committed to git via `.gitignore` exception
  `!api/sample_invoice.csv`
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
- Leakage columns stay in the chunker — `predict_batch` reads `Net Charge
  Billed Currency` directly for audit comparison; the 105-feature model
  input is built fresh from `transform_row` (no leakage column is ever
  passed to the booster)
- `run_inference(df, start_index=N)` is the only consumer of `predict_batch`
  from streaming. `app.state.clf`/`reg`/`residual_quantiles` are GONE —
  artifacts live behind `predict._load_artifacts()`'s lru_cache.
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
- `OverviewPage` wraps computeKpis/computeZoneData in `useMemo`
  so they only rerun when `results` changes, not on every 50-row KPI update

## Actual vs Predicted scatter plot (Overview page)
- Replaced the old monthly bar chart with a per-shipment **ScatterChart** (Recharts)
- X = predicted charge, Y = actual charge; diagonal y=x reference line = perfect prediction
- Dots color-coded by `review_priority`: `var(--over)` = high, `var(--warn)` = medium,
  `var(--faint)` = low (palette-aware, not hard-coded hex). Both axes log scale.
- Props: receives `ShipmentResult[]` directly (not aggregated `MonthlyDataPoint[]`)
- `computeMonthlyData()` in `lib/metrics.ts` still exists but is no longer called
  by OverviewPage — kept for potential future use
- Click a dot → persistent detail card appears below chart with copy buttons
  (Tracking #, Actual, Predicted, Gap) and dismiss (X) button
- Selected dot enlarges (r=6) with white stroke ring; unselected dots are r=4

## Trends page — daily/weekly granularity
- Users upload one month at a time (~1,000 shipments); monthly aggregation collapsed
  to a single point — daily/weekly granularity fixes this
- `TrendsGranularity` type: `'day' | 'week'` (exported from `lib/metrics.ts`)
- `computeGranularTrendsData(results, granularity)` in `lib/metrics.ts`:
  - `'day'`: labels like "Apr 14" (~30 points per month)
  - `'week'`: labels like "Apr 8–14" (Monday-start, ~4-5 points per month)
  - Returns `TrendsDataPoint[]` — reuses `.month` field for period label
  - Sorts by raw ISO date internally before mapping to display labels
- `TrendsPage` defaults to `'day'` with a select dropdown toggle ("Group by: Day / Week")
- `TrendsGranularity` also has `'month'`; `pickGranularity()` chooses the default from
  the upload's date span. X labels are never rotated — the tick interval thins them.
- Old `computeTrendsData()` (monthly) still exists but is no longer called

## Copy-to-clipboard functionality
- **Shared `CopyButton` component** in `components/ui/CopyButton.tsx`:
  - Reused by scatter chart detail card, AnomalyTable, and AnomaliesPage
  - Click → copies text to clipboard, shows green checkmark for 1.5s
- **`CopyTableButton`** (also in `CopyButton.tsx`):
  - "Copy All (N)" button copies all visible rows as tab-separated text with header
  - Format: `Tracking # | Service | Dims | Weight | Zone | Actual | Predicted Low |
    Predicted High | Gap | Flag | Confidence` — pastes cleanly into Excel/Sheets
  - `rowsToTsv(rows)` helper converts `ShipmentResult[]` to TSV string
- **Scatter chart**: click dot → detail card with per-field copy buttons
- **AnomalyTable (Overview)**: click row to select → copy bar with Tracking #, Actual,
  Predicted Range, Gap, Full Row buttons; "Copy All" in header respects active filter
- **AnomaliesPage**: same click-to-select + copy bar pattern; "Copy All" in header
  copies in current sort order

## By State page — US shipping heatmap
- Replaced the old "By SKU" page with a US state choropleth map showing shipment volume
- **Backend** (`api/inference.py`): `recipient_state` field extracted with column-shift
  fallback — FedEx exports sometimes shift address→city→state→country, putting the city
  in the state column and the actual 2-letter code in the country column. Logic: try
  `Recipient State/Province` first; if not a valid 2-letter alpha code, fall back to
  `Recipient Country/Territory` (excluding "US"). Recovers 99.4% of rows.
- **Map library**: `react-simple-maps` (v3, ~30KB) with CDN-loaded TopoJSON
  (`us-atlas@3/states-10m.json`). `geoAlbersUsa` projection handles Alaska/Hawaii inset.
- **Color scale**: sequential ramp from `--raised` to `--billed` (resolved with
  `useCssVars`), with a legend bar; a "Busiest states" list sits beside the map
- **Tooltip**: fixed-position card (top-right of map) on hover — shows state name,
  shipment count, total billed, gap, anomaly count
- **Summary table**: below the map, all states ranked by shipment count with columns:
  State, Shipments, Total Actual, Total Predicted, Gap, Anomalies
- **State name mapping**: static `NAME_TO_ABBR` lookup (50 states + DC) converts TopoJSON
  `geo.properties.name` (e.g. "California") → 2-letter code (e.g. "CA")
- `computeStateData()` in `lib/metrics.ts` aggregates by `recipient_state`, skips nulls
- `PageId` type: `'by-sku'` replaced with `'by-state'`; Sidebar nav item updated with
  map-pin icon
- Old `BySkuPage.tsx` deleted; `computeSkuData()` in metrics.ts kept (harmless)

## Monex-style redesign (2026-10)
Replaced the 2026-04 ops-console skin (monospace, `> TBL.01` slugs, 00–05 nav
numbers, unicode glyph icons, 4 skins). Direction: taste-skill's
"true-black-flat" app style, after a monex finance-dashboard reference.
**All business logic preserved**: same API, streaming, KPI math, CSV export,
copy-to-clipboard, row_index selection keys.

- **Type:** Manrope everywhere (tabular figures on); JetBrains Mono only for
  tracking numbers (`.mono`). Page title 30px/400, lead figure 40px, KPIs 24–28px.
- **Tokens:** all colours are CSS custom properties in `src/index.css` under
  `:root[data-theme='dark'|'light']`. Never use Tailwind colour utilities.
  Hue budget, one subject = one hue: `--billed` (blue, what FedEx charged),
  `--over` (pink, billed above the 95% ceiling / high priority), `--warn`
  (amber, medium), `--ok` (green, pills only). Everything else is neutral.
- **Theme:** `theme/ThemeContext.tsx` — dark/light only, persisted in
  `localStorage['dre-theme']`, applied as `data-theme` on `<html>`.
  `useCssVars([...])` resolves tokens for JS (the state map ramp).
- **Shell:** `components/layout/TopBar.tsx` (mark, nav: Overview · Disputes ·
  Zones · States · Trends · Export, high-priority count on Disputes, current
  file, theme toggle) inside `MainLayout.tsx`; footer carries model stats.
  Pages receive `onNavigate` for empty-state / "View all" links.
- **Component classes** (index.css `@layer components`): `.card` (20px radius,
  no shadow), `.btn-primary` (inverted pill), `.btn-ghost`, `.btn-quiet`,
  `.pill-over|warn|ok|neutral`, `.seg` (segmented control), `.table`
  (sentence-case grey headers, row rules, `.num` right-aligned), `.float`
  (the only shadowed surface: tooltips/popovers).
- **Icons:** authored SVG set in `components/ui/Icon.tsx`. No unicode glyphs.
- **Overview:** title row (finding sentence + file meta, upload buttons) →
  hero card (`PeriodChart`: billed per period above zero, over-ceiling $ below,
  hatched bars, selected period filled, auto day/week/month via
  `pickGranularity`) with a totals rail (Recoverable leads) → Review queue /
  Which checks fired / Where the money is (`ZoneRing`) → scatter + dispute
  queue peek (sorted by $ over ceiling, 7 rows, View all).
- **Signature element:** `components/ui/IntervalStrip.tsx` — the bill against
  the model's 95% band, per row; far-out bills pin to the end with a break mark.
- **Scatter** (`ActualVsPredictedChart`) is log–log ($3 floor) and fills its
  card height; dots by `review_priority` (pink/amber/grey).
- **Trends:** Recharts, straight lines, no rotated labels (4–8 ticks),
  day/week/month segmented control.
- **Streaming:** `StreamingKpis` gained `billedTotal` / `predictedTotal` so the
  hero totals tick with the other KPIs.

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

## Design rules
The 2026-10 redesign followed taste-skill (`Leonxlnx/taste-skill`, app-screens
rules) and impeccable (`pbakaus/impeccable`, Operate mode). Short form for new UI:
colour on data not chrome; KPIs are type, not tiles; no gradients, glows,
eyebrow labels, index numbers, or monospace outside IDs; numbers right-aligned
in tabular figures; every block has an empty state that keeps its frame.
