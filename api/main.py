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
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ingest import parse_invoice
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
