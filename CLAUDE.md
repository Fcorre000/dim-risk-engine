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
- Dots color-coded by `review_priority`: `var(--crit)` = high, `var(--warn)` = medium,
  `var(--accent)` = low (palette-aware, not hard-coded hex)
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
- **Tables**: `> TBL.NN · <NAME>.<MODE>` header with right-aligned meta (`ORDER.BY ... DESC`, row count, `N / TOTAL FLAGGED`). Rows `border-b` only (no vertical lines). Flag cells render `review_priority` as `▲ HIGH 96%` / `■ MEDIUM 73%` / `· LOW` — the % chip is the calibrated `anomaly_score`. Selected row uses `background: var(--row-hov)` and shows a sticky copy bar beneath.
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
