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
                        │  2. Feature engineering (34 col) │
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
| **Overview** | Upload zone, KPI cards (total shipments, DIM anomaly rate, cost anomaly rate, total potential savings), zone distribution chart, actual vs. predicted cost scatter plot, anomaly summary table |
| **Anomalies** | Filterable table of all flagged shipments — DIM anomalies ("Unexpected") and cost anomalies ("Review") |
| **By Zone** | Anomaly breakdown by FedEx pricing zone |
| **By SKU** | Anomaly breakdown by service type |
| **Trends** | Monthly time-series of anomaly rates and costs |
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

### Infrastructure

| Component | Role |
|-----------|------|
| **Render** | Hosting — Python web service (API) + static site (frontend) |
| **render.yaml** | Infrastructure-as-code deployment config |

---

## ML Models

The XGBoost models powering this dashboard were trained on **53,000 real FedEx shipments** from a mattress manufacturing company. Full training code, EDA notebooks, and model evaluation are in the companion repository:

**[Fcorre000/shipping-dim-xgboost-pytorch](https://github.com/Fcorre000/shipping-dim-xgboost-pytorch)**

### Model Details

| Model | Task | Input | Output |
|-------|------|-------|--------|
| `xgb_classifier.pkl` | Binary classification | 34 engineered features | P(DIM=Y) — probability the shipment should be DIM-flagged |
| `xgb_regressor.pkl` | Regression | 34 engineered features | Predicted net charge in log-space (converted to dollars via `np.expm1()`) |

### Anomaly Detection Logic

- **DIM anomaly ("Unexpected")**: Model predicts P(DIM=N) > 0.6 but FedEx charged DIM=Y — the shipment likely shouldn't have been DIM-billed. These are dispute candidates.
- **Cost anomaly ("Review")**: Actual charge exceeds predicted charge by more than 25% — potential overcharge worth investigating.

### Feature Engineering Highlights

- 34 features derived from raw invoice columns: package dimensions, weight, volume, DIM weight ratio, service type (one-hot), pay type (one-hot), pricing zone (normalized)
- Leakage prevention: `Shipment Rated Weight` and `Net Charge Billed Currency` are excluded from model input
- Pricing zone normalization: single-digit zones zero-padded (`'2'` -> `'02'`), non-standard values mapped to `'Other'`

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
│   ├── main.py              # FastAPI app — /health, /analyze, /analyze/stream
│   ├── ingest.py            # Invoice parsing, feature engineering, chunked generator
│   ├── inference.py         # XGBoost inference + anomaly flag logic
│   ├── requirements.txt
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Root component — upload handler, stream reader
│   │   ├── pages/           # Overview, Anomalies, ByZone, BySku, Trends, Export
│   │   ├── components/
│   │   │   ├── upload/      # UploadZone (drag-drop + progress bar)
│   │   │   ├── charts/      # ZoneChart, ActualVsPredicted, TrendsChart
│   │   │   ├── kpi/         # KpiCard
│   │   │   ├── table/       # AnomalyTable
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
    "dim_flag_probability": 0.8231,
    "actual_net_charge": 42.50,
    "predicted_net_charge": 35.12,
    "dim_anomaly": null,
    "cost_anomaly": "Review"
  }
]
```

### `POST /analyze/stream`

Same input as `/analyze`, but returns **NDJSON** for streaming consumption. First line is metadata, subsequent lines are individual shipment results.

---

## Deployment

The app deploys to [Render](https://render.com) via the included `render.yaml`:

- **dim-risk-api** — Python web service (FastAPI)
- **dim-risk-frontend** — Static site (Vite build output)

Set `VITE_API_URL` on the frontend service to point to the API URL, and `CORS_ORIGINS` on the API service to the frontend URL.

---

## License

This project is licensed under the GNU General Public License v3.0 — see the [LICENSE](LICENSE) file for details.
