from contextlib import asynccontextmanager
import pathlib
import pickle
import warnings

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

warnings.filterwarnings("ignore", message=".*Booster.*", category=UserWarning)


@asynccontextmanager
async def lifespan(app: FastAPI):
    models_dir = pathlib.Path(__file__).parent.parent / "models"
    with open(models_dir / "xgb_classifier.pkl", "rb") as f:
        app.state.clf = pickle.load(f)
    with open(models_dir / "xgb_regressor.pkl", "rb") as f:
        app.state.reg = pickle.load(f)
    yield


app = FastAPI(title="DimRisk Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "models_loaded": hasattr(app.state, "clf") and hasattr(app.state, "reg"),
    }


@app.post("/analyze")
async def analyze(request: Request, file: UploadFile = File(...)):
    return {"detail": "Not implemented — wired in Plan 01-04"}
