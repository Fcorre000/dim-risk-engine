<div align="center">

# DimRisk Engine

### Shipping Intelligence Dashboard — Real-time DIM billing anomaly detection powered by XGBoost

[![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![XGBoost](https://img.shields.io/badge/XGBoost-3.2-FF6600?style=flat-square&logo=xgboost&logoColor=white)](https://xgboost.readthedocs.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue?style=flat-square)](LICENSE)

**[Live Demo](https://dim-risk-frontend.onrender.com)** &nbsp;|&nbsp; **[ML Model Repo](https://github.com/Fcorre000/shipping-dim-xgboost-pytorch)**

</div>

---

## The Problem

FedEx charges by **dimensional (DIM) weight** when a package's volume-to-weight ratio exceeds a threshold — often resulting in shipping costs far above what actual weight alone would suggest. For high-volume shippers, this creates significant and largely *avoidable* costs.

DimRisk Engine takes a FedEx invoice export and runs it through two trained XGBoost models to answer two questions for every shipment:

1. **Should this package have been DIM-flagged?** — Surfaces cases where FedEx charged DIM but the model predicts it shouldn't have been (dispute candidates)
2. **Is the charge reasonable?** — Flags shipments where the actual cost exceeds the model's prediction by more than 25% (overcharge candidates)

---

## How It Works

```
                        ┌─────────────────────────────────┐
 .xlsx / .csv           │         FastAPI Backend          │
 invoice upload ──────> │                                  │
                        │  1. Parse & chunk (1000 rows)    │
                        │  2. Feature engineering (41 col) │
                        │  3. XGBoost classifier → DIM P() │
                        │  4. XGBoost regressor → cost $   │
                        │  5. Anomaly flag logic           │
                        │                                  │
                        │  Stream results as NDJSON ──────>│──> React Dashboard
                        └─────────────────────────────────┘
```

The backend streams results as **NDJSON** (newline-delimited JSON) so the frontend can render a live progress bar and begin displaying data before the full file is processed. A 50,000-row invoice streams in seconds.

---

## Dashboard Pages

| Page | What it shows |
|------|---------------|
| **Overview** | Upload zone, KPI cards (total shipments, DIM anomaly rate, cost anomaly rate, total potential savings), zone distribution chart, per-shipment actual vs. predicted scatter plot (color-coded by anomaly type), anomaly summary table with click-to-copy |
| **Anomalies** | Sortable table of all flagged shipments with click-to-copy rows and "Copy All" for bulk export to spreadsheets |
| **By Zone** | Anomaly breakdown by FedEx pricing zone |
| **By State** | US choropleth map showing shipment volume by state, with hover tooltips and ranked summary table |
| **Trends** | Daily or weekly charge trends and dispute candidate history, with granularity toggle |
| **Export** | Download results as CSV for further analysis |

---

## Tech Stack

### Backend (`api/`)

| Component | Role |
|-----------|------|
| **FastAPI** | Async web framework with streaming response support |
| **XGBoost** | Two pre-trained models — binary classifier (DIM flag) and regressor (net charge) |
| **pandas** | Invoice parsing, feature engineering, chunked processing |
| **openpyxl** | XLSX file reading in streaming/read-only mode |

### Frontend (`frontend/`)

| Component | Role |
|-----------|------|
| **React 18** | UI framework with streaming state management |
| **TypeScript** | Type-safe component development |
| **Vite** | Build tooling and dev server |
| **Tailwind CSS** | Utility-first styling with dark theme |
| **Recharts** | Data visualization (charts, scatter plots) |
| **react-simple-maps** | US state choropleth map (SVG, TopoJSON) |

### Infrastructure

| Component | Role |
|-----------|------|
| **Render** | Hosting — Python web service (API) + static site (frontend) |
| **render.yaml** | Infrastructure-as-code deployment config |

---

## ML Models

The XGBoost models powering this dashboard were trained on **57,600 real FedEx shipments** (25 months, April 2024 – April 2026) from a mattress manufacturing company. Full training code, EDA notebooks, SHAP analysis, and model evaluation are in the companion repository:

**[Fcorre000/shipping-dim-xgboost-pytorch](https://github.com/Fcorre000/shipping-dim-xgboost-pytorch)**

### Model Details

| Model | Task | Input | Output | Key Metrics |
|-------|------|-------|--------|-------------|
| `xgb_classifier.pkl` | Binary classification | 41 engineered features | P(DIM=Y) — probability the shipment should be DIM-flagged | Accuracy 0.9974, F1 0.9959, AUC 0.9997 |
| `xgb_regressor.pkl` | Regression | 41 engineered features | Predicted net charge in log-space (converted to dollars via `np.expm1()`) | MAE $3.88, RMSE $7.60, R² 0.8658 |

### Anomaly Detection Logic

- **DIM anomaly ("Unexpected")**: Model predicts P(DIM=N) > 0.6 but FedEx charged DIM=Y — the shipment likely shouldn't have been DIM-billed. These are dispute candidates.
- **Cost anomaly ("Review")**: Actual charge exceeds `predicted_net_charge_high` (the 95th-percentile upper bound of the 90% prediction interval) — potential overcharge worth investigating.

### Feature Engineering (41 features)

Engineered from raw invoice columns, then one-hot encoded:

```
volume              = height_cm × width_cm × length_cm
dim_weight_calculator = volume / 139                      (FedEx domestic DIM divisor)
dim_weight_ratio    = dim_weight_calculator / actual_weight  (>1.0 triggers DIM billing)
billable_weight     = max(actual_weight, dim_weight_calculator)
billable_weight_ceil = ceil(billable_weight)                (matches FedEx rate-card rounding)
has_dimensions      = 1 if all dims > 0, else 0
ship_year           = shipment year                        (annual rate card changes)
ship_month          = shipment month                       (monthly fuel surcharge cycles)
months_since_start  = (year - 2024) × 12 + (month - 4)    (linear time index for trend)
```

Plus one-hot encoded service type (15 categories), pay type (4 categories), and pricing zone (10 categories).

**Design decisions:**
- **Leakage prevention:** `Shipment Rated Weight` and `Net Charge Billed Currency` excluded from model input (Rated Weight is derived from DIM flag, correlation ~0.95)
- **Time features:** Capture FedEx annual rate card hikes (~5–7%), monthly fuel surcharges (DOE diesel), and peak season surcharges — reduced regression MAE by 37% on validation
- **$200 cap:** Top 0.50% of charges (285 shipments) excluded to reduce extreme skewness (23.1)
- **Dimensions in cm:** Raw invoice data uses centimeters; previous models used inches
- **SHAP interpretability:** Classification driven by `dim_weight_ratio`; regression by `Original Weight`, pricing zone, `billable_weight`, and time features

---

## Streaming Architecture

Traditional upload-then-wait APIs block the UI until the entire file is processed. DimRisk Engine uses a **chunked streaming architecture** instead:

1. **Backend** reads the file into memory, estimates total row count, then streams an NDJSON response:
   - First line: `{"__meta__": true, "total": 50000}` (row count for progress tracking)
   - Subsequent lines: one `ShipmentResult` JSON object per row
   - File is parsed in 1000-row chunks via a Python generator

2. **Frontend** consumes the stream via the `ReadableStream` API:
   - Progress bar fills proportionally as rows arrive
   - Shimmer animation indicates active processing
   - Results render incrementally (batched every 200 rows for performance)
   - `requestAnimationFrame` yields ensure the browser paints between React state updates

---

## Getting Started

Don't have a FedEx invoice handy? The dashboard includes a **"Try sample invoice"** button on the upload screen that loads 1,618 real shipments from a single month (April 2024) — no file needed.

### Prerequisites

- Python 3.10+
- Node.js 18+

### Run Locally

```bash
# Clone the repo
git clone https://github.com/Fcorre000/dim-risk-engine.git
cd dim-risk-engine

# Start the backend
cd api
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# In another terminal — start the frontend
cd frontend
npm install
npm run dev
```

The frontend dev server runs on `http://localhost:5173` and proxies API requests to `http://localhost:8000`.

### Run Tests

```bash
cd api
pytest
```

---

## Project Structure

```
dim-risk-engine/
├── api/
│   ├── main.py              # FastAPI app — /health, /analyze, /analyze/stream, /demo/stream
│   ├── ingest.py            # Invoice parsing, feature engineering, chunked generator
│   ├── inference.py         # XGBoost inference + anomaly flag logic
│   ├── sample_invoice.csv   # 1,618-row sample (April 2024) — powers the demo button
│   ├── requirements.txt
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Root component — upload handler, stream reader
│   │   ├── pages/           # Overview, Anomalies, ByZone, ByState, Trends, Export
│   │   ├── components/
│   │   │   ├── upload/      # UploadZone (drag-drop + progress bar)
│   │   │   ├── charts/      # ZoneChart, ActualVsPredictedChart (scatter), TrendsChart
│   │   │   ├── kpi/         # KpiCard
│   │   │   ├── table/       # AnomalyTable (with click-to-copy)
│   │   │   ├── ui/          # CopyButton, CopyTableButton (shared)
│   │   │   └── layout/      # MainLayout, Sidebar
│   │   ├── lib/             # Metrics computation utilities
│   │   └── types/           # TypeScript interfaces
│   ├── tailwind.config.js
│   └── package.json
├── models/
│   ├── xgb_classifier.pkl   # Pre-trained DIM flag classifier
│   └── xgb_regressor.pkl    # Pre-trained net charge regressor
├── render.yaml               # Render deployment config
└── README.md
```

---

## API Reference

### `GET /health`

Returns service status and whether models are loaded.

### `POST /analyze`

Upload a `.csv` or `.xlsx` FedEx invoice. Returns a JSON array of results.

**Request:** `multipart/form-data` with a `file` field

**Response:**
```json
[
  {
    "tracking_number": "7489...",
    "service_type": "FEDEX_GROUND",
    "weight_lbs": 12.0,
    "dim_length": 24, "dim_width": 18, "dim_height": 12,
    "zone": "05",
    "shipment_date": "2024-01-15",
    "dim_flag_probability": 0.8231,
    "actual_net_charge": 42.50,
    "predicted_net_charge": 35.12,
    "predicted_net_charge_low": 30.55,
    "predicted_net_charge_high": 47.82,
    "dim_anomaly": null,
    "dim_confidence": null,
    "cost_anomaly": "Review",
    "cost_confidence": "High"
  }
]
```

### `POST /analyze/stream`

Same input as `/analyze`, but returns **NDJSON** for streaming consumption. First line is metadata, subsequent lines are individual shipment results.

### `GET /demo/stream`

Streams results for the built-in 1,618-row sample invoice (April 2024, single month) — no file upload needed. Response format is identical to `/analyze/stream`. Powers the demo button in the dashboard.

---

## Deployment

The app deploys to [Render](https://render.com) via the included `render.yaml`:

- **dim-risk-api** — Python web service (FastAPI)
- **dim-risk-frontend** — Static site (Vite build output)

Set `VITE_API_URL` on the frontend service to point to the API URL, and `CORS_ORIGINS` on the API service to the frontend URL.

---

## Changelog

### 2026-04-14 — US state shipping map (replaces By SKU)
- **By SKU → By State:** Replaced service type breakdown page with a **US choropleth map** showing shipment volume by state, powered by `react-simple-maps`
- **State data pipeline:** Backend now extracts `recipient_state` from invoice data with a column-shift fallback — FedEx exports sometimes misalign columns, putting city names in the state field. The fallback checks the country column for valid state codes, recovering 99.4% of rows
- **Map features:** `geoAlbersUsa` projection (includes Alaska/Hawaii inset), sequential blue color scale, hover tooltips with shipment count/charges/anomalies, gradient legend
- **Summary table:** Ranked table below the map with per-state shipment count, total actual, total predicted, gap, and anomaly count

### 2026-04-14 — Per-shipment scatter plot, daily/weekly trends, copy-to-clipboard
- **Overview chart replaced:** Monthly bar chart → per-shipment scatter plot (actual vs predicted). Each dot is one shipment, color-coded by anomaly type (red = Unexpected, amber = Review, blue = Normal). Diagonal reference line shows perfect prediction.
- **Trends granularity:** Trends page now defaults to **daily** aggregation with a Day/Week toggle — designed for single-month uploads (~1,000 shipments). XAxis labels rotate at -45 degrees for daily view.
- **Click-to-copy:** Click any dot on the scatter plot or any row in the anomaly tables to select it — a detail bar appears with copy buttons for Tracking #, Actual, Predicted, Gap, and Full Row (tab-separated).
- **Copy All:** Both anomaly tables (Overview and Anomalies page) have a "Copy All (N)" button that copies all visible/filtered rows as tab-separated text — pastes directly into Excel/Google Sheets.
- **Demo data trimmed:** Sample invoice reduced from 3,000 multi-month rows to 1,618 rows from April 2024 only — matches the intended single-month upload workflow.

### 2026-04-12 — Model v2: retrained on 25-month dataset (Apr 2024 – Apr 2026)
- Replaced both XGBoost models with versions trained on 57,600 shipments (was ~53,000 from 2022–2024)
- Feature count increased from 34 to **41 features** — added `billable_weight`, `billable_weight_ceil`, `ship_year`, `ship_month`, `months_since_start`; removed `Pieces in Shipment`, `Shipment Declared Value Amount`, `Customs Value`
- Dimensions now in **centimeters** (was inches) — matches raw FedEx invoice export format
- New service types (`ON`, `RW`, `S7`, `S8`), pay type (`Other4`), and zone (`09`) in one-hot encoding
- Time features capture FedEx rate card hikes, fuel surcharges, and seasonal pricing dynamics
- Updated `api/sample_invoice.csv` with first 3,000 rows of new dataset
- Refactored `ingest.py` (FEATURE_COLS, REQUIRED_COLS, build_feature_matrix) and `inference.py` for new column names

### 2026-04-11 — Stream error handling
- Column validation errors from bad uploads now surface as a human-readable message in the UI instead of silently failing
- Previously, `__error__` lines in the NDJSON stream were pushed into results undetected; they now throw and set the error state with the server's exact message (e.g. "Missing required columns: Tracking Number, Pricing Zone")

### 2026-04-09 — Cost anomaly confidence grading
- `cost_confidence` is now a computed severity grade instead of a hardcoded `"High"`
- Grade is based on how far the actual charge exceeds the CI upper bound, measured in CI widths: **Low** (< 0.5×), **Medium** (0.5–1×), **High** (1–2×), **Critical** (≥ 2×)

### 2026-04-09 — Cold start UX + keep-alive
- First-time visitors after server inactivity now see a **"Server warming up"** banner instead of a silent spinner — disappears automatically once the server responds
- Added UptimeRobot keep-alive ping on `/health` every 5 minutes to prevent Render free-tier spin-down in the first place

### 2026-04-09 — Rate limiting and file size cap
- `POST /analyze` and `POST /analyze/stream` now enforce a **50 MB file size limit** — returns HTTP 413 if exceeded
- Both endpoints enforce a **sliding-window rate limit of 10 requests/minute per IP** — returns HTTP 429 if exceeded
- `/demo/stream` is excluded (reads a local file server-side, no upload)

### 2026-04-07 — Confidence intervals on anomaly flags
- Each shipment now includes a **90% prediction interval** (`predicted_net_charge_low` / `predicted_net_charge_high`) derived from calibrated log-space residual quantiles
- DIM anomaly badges show model confidence percentage (e.g. "Unexpected 87%") — higher % = stronger dispute case
- Cost anomaly threshold changed from `actual > predicted × 1.25` to `actual > predicted_high` (upper bound of the prediction interval) — more statistically grounded
- Recoverable estimate is now conservative: `actual − predicted_high` instead of `actual − predicted`
- Anomalies table gains a sortable **Confidence** column (default sort)
- New `dim_confidence` and `cost_confidence` fields in every API response row

### 2026-04-05 — Sample invoice test button
- Added **"Try 3,000-row sample invoice"** button to the upload screen — loads real shipment data without requiring a file upload
- Backend serves the sample via `GET /demo/stream` reading `api/sample_invoice.csv` server-side (avoids broken blob-fetch on the static site deploy)

### 2026-04-03 — Streaming progress bar
- Upload progress bar now fills proportionally for both CSV and XLSX files (XLSX row count via openpyxl `read_only` mode)
- Falls back to indeterminate shimmer when row count is unavailable
- Live KPI counters (DIM rate, dispute candidates, recoverable $) update incrementally during streaming without full recompute

### 2026-04-04 — Real shipment fields
- Removed fake placeholder functions (`deriveDims`, `deriveWeight`, `deriveZone`, `deriveService`, `deriveMonth`) that generated synthetic data from tracking number hashes
- All display fields (dimensions, weight, zone, service type, shipment date) now come from actual invoice columns parsed by the backend

### 2026-04-03 — NDJSON streaming endpoint
- Added `POST /analyze/stream` endpoint that streams results as NDJSON — one shipment per line, preceded by a `__meta__` row with total count
- Frontend reads via `ReadableStream` API for real-time rendering

---

## License

This project is licensed under the GNU General Public License v3.0 — see the [LICENSE](LICENSE) file for details.
