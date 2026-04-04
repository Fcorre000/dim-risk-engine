from contextlib import asynccontextmanager
import io
import os
import pathlib
import pickle
import time
import warnings
from typing import Optional

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

import json as _json

from ingest import parse_invoice, parse_invoice_chunks
from inference import run_inference

warnings.filterwarnings("ignore", message=".*Booster.*", category=UserWarning)


@asynccontextmanager
async def lifespan(app: FastAPI):
    model_path_env = os.environ.get("MODEL_PATH")
    if model_path_env:
        models_dir = pathlib.Path(model_path_env)
    else:
        models_dir = pathlib.Path(__file__).parent.parent / "models"
    with open(models_dir / "xgb_classifier.pkl", "rb") as f:
        app.state.clf = pickle.load(f)
    with open(models_dir / "xgb_regressor.pkl", "rb") as f:
        app.state.reg = pickle.load(f)
    yield


app = FastAPI(title="DimRisk Engine", lifespan=lifespan)

_raw_origins = os.environ.get("CORS_ORIGINS", "*")
_allow_origins = [o.strip() for o in _raw_origins.split(",")] if _raw_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ShipmentResult(BaseModel):
    tracking_number: str
    service_type: str              # e.g. "FO", "SG", "PO"
    weight_lbs: float              # Original Weight (Pounds)
    dim_length: float              # Dimmed Length (in)
    dim_width: float               # Dimmed Width (in)
    dim_height: float              # Dimmed Height (in)
    zone: str                      # Pricing Zone, normalized ("02", "Other")
    shipment_date: Optional[str]   # "YYYY-MM-DD" or null if not in source
    dim_flag_probability: float    # P(DIM=Y), 0.0-1.0
    actual_net_charge: float       # dollars, from Net Charge Billed Currency column
    predicted_net_charge: float    # dollars, after np.expm1()
    dim_anomaly: Optional[str]     # "Unexpected" or None
    cost_anomaly: Optional[str]    # "Review" or None


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "models_loaded": hasattr(app.state, "clf") and hasattr(app.state, "reg"),
    }


@app.post("/analyze", response_model=list[ShipmentResult])
async def analyze(request: Request, file: UploadFile = File(...)):
    start = time.perf_counter()

    # Read file into memory
    contents = await file.read()
    filename = file.filename or "upload.csv"

    # Parse and preprocess
    try:
        df = parse_invoice(io.BytesIO(contents), filename)
    except ValueError as e:
        return JSONResponse(status_code=422, content={"detail": str(e)})

    # Run inference
    results = run_inference(df, request.app.state.clf, request.app.state.reg)

    elapsed = time.perf_counter() - start

    return results


@app.post("/analyze/stream")
async def analyze_stream(request: Request, file: UploadFile = File(...)):
    filename = file.filename or "upload.csv"
    contents = await file.read()  # read eagerly — avoids file handle lifecycle issues in threadpool

    # Cheap row estimate from bytes already in memory
    total = None
    fn = filename.lower()
    try:
        if fn.endswith(".csv"):
            total = max(0, contents.count(b"\n") - 1)  # subtract header row
        elif fn.endswith(".xlsx"):
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
            ws = wb.active
            total = max(0, ws.max_row - 1) if ws.max_row else None  # subtract header
            wb.close()
    except Exception:
        pass

    clf = request.app.state.clf
    reg = request.app.state.reg

    def generate():
        yield _json.dumps({"__meta__": True, "total": total}) + "\n"
        try:
            for chunk in parse_invoice_chunks(io.BytesIO(contents), filename, chunksize=1000):
                for row in run_inference(chunk, clf, reg):
                    yield _json.dumps(row) + "\n"
        except ValueError as e:
            yield _json.dumps({"__error__": str(e)}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")
