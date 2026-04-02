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
