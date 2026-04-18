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
- xgb_classifier.pkl: predicts DIM flag (Y/N), input = 42 unscaled features
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
- **Inference must convert cm → inches** before computing volume/DIM weight
  features — the training pipeline divides by 2.54, and the FedEx DIM divisor
  (139) is defined in cubic inches per pound

## Model feature engineering (42 features)
- Engineered from raw invoice columns, then one-hot encoded:
  ```
  height_in / width_in / length_in = cm_value / 2.54   # convert to inches first!
  volume              = height_in * width_in * length_in
  dim_weight_calculator = volume / 139                  # 139 = in³/lb (FedEx domestic)
  dim_weight_ratio    = dim_weight_calculator / actual_weight
  billable_weight     = max(actual_weight, dim_weight_calculator)
  billable_weight_ceil = ceil(billable_weight)
  has_dimensions      = 1 if all dims > 0, else 0
  ship_year           = shipment_date.year
  ship_month          = shipment_date.month
  months_since_start  = (year - 2024) * 12 + month      # April 2024 = 4
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
- "Try sample invoice" button lives in `UploadZone` — calls `onDemoLoad` prop
- `onDemoLoad` in `App.tsx` hits `GET /demo/stream` on the backend (no file upload)
- `/demo/stream` in `api/main.py` reads `api/sample_invoice.csv` server-side and streams
  NDJSON in the same format as `/analyze/stream`
- `api/sample_invoice.csv` contains 1,618 shipments from **April 2024 only** — a single
  month of real invoice data, matching the expected user workflow of uploading one month
  at a time. UTF-8 (no BOM), LF line endings, committed to git via `.gitignore` exception
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
- `OverviewPage` wraps computeKpis/computeZoneData in `useMemo`
  so they only rerun when `results` changes, not on every 50-row KPI update

## Actual vs Predicted scatter plot (Overview page)
- Replaced the old monthly bar chart with a per-shipment **ScatterChart** (Recharts)
- X = predicted charge, Y = actual charge; diagonal y=x reference line = perfect prediction
- Dots color-coded by anomaly: red `#f43f5e` = Unexpected, amber `#f59e0b` = Review,
  blue `#3b82f6` = Normal
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
- `TrendsChart` adjusts for denser data: minWidth `data.length * 28` (was `* 80`),
  XAxis labels rotated -45 degrees when >10 data points
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
- **Color scale**: sequential blue — `#1f2937` (no data) → `#1e3a5f` (low) → `#3b82f6` (high),
  with gradient legend bar
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

## Ops-console redesign (2026-04-18)
- Full visual overhaul from the `design_handoff_dimrisk_ops/` spec. **All business logic preserved** — same API, streaming, KPI math, types. Only the skin changed.
- **Design language:** fixed-width terminal aesthetic. JetBrains Mono for body/mono, Space Grotesk for KPI values. Sharp corners everywhere (no `border-radius`). Typographic marks instead of icons: ▲ (crit), ■ (warn), · (ok), ◐ (warming), ⇣ (download). Slug-style headers like `> TBL.01 · DISPUTE_QUEUE.PEEK` and `> FIG.02 · ACTUAL × PREDICTED`.
- **Never use Tailwind color utilities** (`text-red-500`, `bg-gray-800`, etc.) in new components — every color comes from CSS custom properties so themes apply automatically.

### Theming system (4 skins × 2 modes = 8 palettes)
- `frontend/src/theme/variants.ts` defines `VARIANTS` — four skins (`console`, `bloomberg` aka "Terminal", `slate`, `stripe` aka "Graphite") each with `dark` and `light` palettes. Palette keys: `--bg`, `--panel`, `--border`, `--border-2`, `--text`, `--muted`, `--accent`, `--warn`, `--crit`, `--header`, `--row-hov`, `--glow`.
- `frontend/src/theme/ThemeContext.tsx` exposes `ThemeProvider`, `useTheme()`, `usePaletteStyle()`. Selected variant + mode persist in `localStorage` (`dre-variant`, `dre-theme`). Defaults: `console` + `dark`. On change, the provider writes each palette key onto `document.body.style` so global backgrounds/scrollbars pick up the palette.
- `App.tsx` wraps the tree in `<ThemeProvider>`. Skin picker + dark/light toggle live in `components/layout/OpsHeader.tsx`.
- **Styling rule:** components read colors via CSS vars — either `style={{ color: 'var(--accent)' }}` inline, or Tailwind arbitrary-value classes like `bg-[var(--panel)]`. The choropleth (`ByStatePage`) interpolates fill between `--panel` and `--accent` via a `mixColors(hexToRgb(panel), hexToRgb(accent), 0.2 + t*0.8)` helper so it stays palette-aware.

### Layout components
- `components/layout/OpsHeader.tsx`: top strip with session ID, UTC clock, invoice ID, skin picker, theme toggle. Clock ticks every second via `setInterval`.
- `components/layout/MainLayout.tsx`: wraps Sidebar + main content, passes `uploadState` through for header KPIs.
- `components/layout/Sidebar.tsx`: nav labels use ops-console slugs (`00 OVERVIEW`, `01 ANOMALIES`, `02 BY_ZONE`, `03 BY_STATE`, `04 TRENDS`, `05 EXPORT`). Nav item type is `PageId`.

### Key component conventions
- **KPI cards** (`components/kpi/KpiCard.tsx`): tagged `REG.000`…`REG.003`, Space Grotesk for the big number, muted meta line below. Four cards on Overview in a 4-col grid.
- **Tables**: `> TBL.NN · <NAME>.<MODE>` header with right-aligned meta (`ORDER.BY ... DESC`, row count, `N / TOTAL FLAGGED`). Rows `border-b` only (no vertical lines). Flag cells render inline mark + label + confidence (e.g. `▲ UNEXPECTED 87%`). Selected row uses `background: var(--row-hov)` and shows a sticky copy bar beneath.
- **Charts**: pure SVG for scatter (`ActualVsPredictedChart` — W=440 H=380 P=34) and zone radar (`ZoneChart`). Recharts retained only for `TrendsChart`. Legend dots use the same flag marks.
- **Buttons**: border + transparent bg + `var(--accent)` text with `textShadow: var(--glow)` on console-dark primary actions (e.g. `⇣ DOWNLOAD .CSV`). Hover flips to `background: var(--row-hov)`.
- **Empty state copy**: always `NO SIGNAL — INGEST AN INVOICE ON 00 OVERVIEW` (or `INGEST AN INVOICE` on Overview itself).
- **Warming banner** (`App.tsx`): `◐ SERVER.WARMING · AWAIT ~60s · DEMO WILL AUTOSTART` — fixed `top-0 z-50`, amber warn color.

### Data-model notes tied to the redesign
- `ShipmentResult` added `row_index: number` (backend-assigned, monotonic) and changed `tracking_number` to `string | null`. Real invoices have missing or duplicate tracking numbers.
- **Selection keys:** all tables and the scatter plot use `row_index` as the React `key` and as selection state (`selectedRowIndex: number | null`). Never use `tracking_number` — it can be null or duplicate.
- **Null-safe display:** `row.tracking_number ?? <span className="italic opacity-60">no tracking #</span>`. CSV export uses `r.tracking_number ?? ''`.
- `AnomaliesPage` added pagination: `PAGE_SIZE_OPTIONS = [50, 100, 250, 500]`, `page` state, `pagedRows` slice, clamped page effect on filter/sort change.

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

### Past bug: inference feature mismatch (cm→inches + time offset)
`build_feature_matrix()` in `ingest.py` had two mismatches vs the training
preprocessing (`model_resources/02_preprocessing.py`):
1. **Missing cm→inches conversion**: Training divides dimensions by 2.54
   before computing volume/dim_weight_calculator (because the FedEx DIM
   divisor 139 is in³/lb). Inference was using raw cm values, inflating
   volume by 2.54³ = 16.4×. Since dim_weight_ratio and billable_weight are
   top SHAP features, this caused systematic ~30% overprediction on every
   shipment with non-zero dimensions.
2. **months_since_start offset**: Training uses `(year-2024)*12 + month`
   (April 2024 = 4). Inference used `(year-2024)*12 + (month-4)` (April
   2024 = 0), sending a value 4 lower than expected for every shipment.
Both fixed 2026-04-14 in `build_feature_matrix()`.

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
