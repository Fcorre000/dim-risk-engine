"""Unsupervised second-opinion flag for the audit queue.

Two detectors run in parallel and their scores are combined:

* `IsolationForest` — tree-based, works on raw (unscaled) features
* Autoencoder (105 → 64 → 16 → 64 → 105) — reconstruction error on
  StandardScaler-normalised features

Each row gets a percentile-rank score from each detector; the final
`anomaly_score` is the average. A pre-tuned `anomaly_threshold` (saved at
training time so the test-set fire-rate sits in the 2–8% band the handoff
specifies) decides `anomaly_flagged`.

The autoencoder was originally trained in PyTorch Lightning. To avoid pulling
torch + pytorch-lightning (~800 MB) into the Render image, the eight tensors
(4× weight, 4× bias) are exported to `models/autoencoder_weights.npz` by
`scripts/convert_autoencoder.py` and the forward pass is reimplemented in
pure numpy — three matmuls and a ReLU per direction.

Artifacts loaded:
    models/isolation_forest.pkl        (sklearn pickle)
    models/autoencoder_weights.npz     (W1..W4, b1..b4 + arch dims)
    models/scaler_v2.pkl               (StandardScaler fit on v2 features)
    models/anomaly_threshold.json      (threshold + train-time score quantiles)
    models/feature_columns.json        (Phase 2 artifact, 105-col order)

Public API:
    score_batch(X: pd.DataFrame)  -> dict of percentile scores
    score_shipment(X: pd.DataFrame) -> dict (single-row)
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / 'models'


@lru_cache(maxsize=1)
def _load_artifacts():
    iso = joblib.load(MODELS / 'isolation_forest.pkl')
    scaler = joblib.load(MODELS / 'scaler_v2.pkl')

    ae = np.load(MODELS / 'autoencoder_weights.npz')
    ae_weights = {
        'W1': ae['W1'], 'b1': ae['b1'],
        'W2': ae['W2'], 'b2': ae['b2'],
        'W3': ae['W3'], 'b3': ae['b3'],
        'W4': ae['W4'], 'b4': ae['b4'],
    }

    with open(MODELS / 'anomaly_threshold.json') as f:
        meta = json.load(f)
    with open(MODELS / 'feature_columns.json') as f:
        feature_cols = json.load(f)

    iso_ref = np.asarray(meta['iso_reference_scores'])
    ae_ref = np.asarray(meta['ae_reference_scores'])
    return iso, scaler, ae_weights, iso_ref, ae_ref, float(meta['threshold']), feature_cols


def _autoencoder_reconstruction_error(X: np.ndarray, w: dict) -> np.ndarray:
    """Per-row MSE between input and reconstructed input.

    Mirrors the Lightning module exactly: Linear → ReLU → Linear (encode),
    Linear → ReLU → Linear (decode). `nn.Linear` stores weight as `(out, in)`
    and computes `x @ W.T + b`, which is what we replicate here.
    """
    z = X @ w['W1'].T + w['b1']
    np.maximum(z, 0, out=z)            # ReLU
    z = z @ w['W2'].T + w['b2']
    z = z @ w['W3'].T + w['b3']
    np.maximum(z, 0, out=z)            # ReLU
    recon = z @ w['W4'].T + w['b4']
    return ((recon - X) ** 2).mean(axis=1)


def _percentile_rank(reference: np.ndarray, values: np.ndarray) -> np.ndarray:
    """Fraction of reference points <= each value, in [0, 1]."""
    return np.searchsorted(reference, values, side='right') / len(reference)


def score_batch(X: pd.DataFrame) -> dict:
    """Compute combined anomaly score for a DataFrame of feature rows.

    Returns
    -------
    dict with keys
        iso_score (ndarray)   — percentile rank of IsolationForest score
        ae_score  (ndarray)   — percentile rank of autoencoder MSE
        anomaly_score (ndarray) — mean of the two percentiles
        anomaly_flagged (ndarray of bool)
    """
    iso, scaler, ae_w, iso_ref, ae_ref, threshold, _ = _load_artifacts()

    # IF: higher (less negative) score_samples = more normal; flip sign so high = anomalous
    iso_raw = -iso.score_samples(X.values)
    iso_pct = _percentile_rank(iso_ref, iso_raw)

    X_scaled = scaler.transform(X.values).astype(np.float32)
    ae_raw = _autoencoder_reconstruction_error(X_scaled, ae_w)
    ae_pct = _percentile_rank(ae_ref, ae_raw)

    combined = (iso_pct + ae_pct) / 2
    return {
        'iso_score': iso_pct,
        'ae_score': ae_pct,
        'anomaly_score': combined,
        'anomaly_flagged': combined >= threshold,
    }


def score_shipment(X: pd.DataFrame) -> dict:
    """Single-row anomaly score.

    Caller is responsible for passing a one-row DataFrame already in the
    105-column v2 feature layout — produced by `predict.transform_row(raw_dict)`.
    Keeping this contract narrow avoids two parallel feature pipelines.
    """
    _, _, _, _, _, threshold, feature_cols = _load_artifacts()
    X = X[feature_cols]
    out = score_batch(X)
    return {
        'anomaly_score': float(out['anomaly_score'][0]),
        'anomaly_flagged': bool(out['anomaly_flagged'][0]),
        'iso_score': float(out['iso_score'][0]),
        'ae_score': float(out['ae_score'][0]),
        'threshold': threshold,
    }
