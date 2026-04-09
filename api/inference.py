import json
import pathlib
from typing import Optional

import pandas as pd
import numpy as np
from ingest import build_feature_matrix, clean_zone


def load_residual_quantiles(models_dir: pathlib.Path) -> dict:
    """Load pre-computed residual quantiles for prediction intervals.

    Returns dict with keys 'q05' and 'q95' (log-space residual bounds).
    Falls back to reasonable defaults if the file is missing.
    """
    path = models_dir / "residual_quantiles.json"
    if path.exists():
        return json.loads(path.read_text())
    # Fallback — conservative defaults if calibration hasn't been run
    return {"q05": -0.15, "q95": 0.35}


def _cost_confidence(actual: float, pred_high: float, pred_low: float) -> str:
    """Grade cost anomaly severity by how far actual exceeds the CI upper bound.

    Uses overage as a multiple of the CI width:
      < 0.5x  → "Low"
      0.5–1x  → "Medium"
      1–2x    → "High"
      ≥ 2x    → "Critical"
    """
    ci_width = max(pred_high - pred_low, 1e-6)  # guard against zero-width CI
    multiple = (actual - pred_high) / ci_width
    if multiple < 0.5:
        return "Low"
    if multiple < 1.0:
        return "Medium"
    if multiple < 2.0:
        return "High"
    return "Critical"


def apply_anomaly_flags(
    dim_proba_y: np.ndarray,
    fedex_dim_flags: pd.Series,
    actual_charges: pd.Series,
    predicted_charges: np.ndarray,
    predicted_high: np.ndarray,
    predicted_low: np.ndarray = None,
) -> list:
    """Apply DIM and cost anomaly logic with confidence scores.

    Args:
        dim_proba_y: Array of P(DIM=Y) values, one per shipment.
        fedex_dim_flags: Series of raw FedEx DIM flag values ("Y" or "N").
        actual_charges: Series of actual net charge amounts in dollars.
        predicted_charges: Array of predicted net charge amounts in dollars.
        predicted_high: Array of 95th percentile upper bounds in dollars.
        predicted_low: Array of 5th percentile lower bounds in dollars (for CI width).

    Returns:
        List of dicts with keys:
        - dim_anomaly: "Unexpected" if P(DIM=N) > 0.6 AND FedEx flagged DIM=Y; else None
        - dim_confidence: P(DIM=N) when dim_anomaly is set, else None
        - cost_anomaly: "Review" if actual charge > predicted_high; else None
        - cost_confidence: "Low"/"Medium"/"High"/"Critical" graded by overage/CI-width; else None
    """
    dim_proba_n = 1.0 - dim_proba_y
    fedex_dim = fedex_dim_flags.str.upper().str.strip()

    flags = []
    for i in range(len(dim_proba_y)):
        is_dim_anomaly = dim_proba_n[i] > 0.6 and fedex_dim.iloc[i] == "Y"
        is_cost_anomaly = actual_charges.iloc[i] > predicted_high[i]

        if is_cost_anomaly and predicted_low is not None:
            confidence = _cost_confidence(
                float(actual_charges.iloc[i]),
                float(predicted_high[i]),
                float(predicted_low[i]),
            )
        elif is_cost_anomaly:
            confidence = "High"  # fallback when pred_low not provided
        else:
            confidence = None

        flags.append({
            "dim_anomaly": "Unexpected" if is_dim_anomaly else None,
            "dim_confidence": round(float(dim_proba_n[i]), 4) if is_dim_anomaly else None,
            "cost_anomaly": "Review" if is_cost_anomaly else None,
            "cost_confidence": confidence,
        })

    return flags


def run_inference(df: pd.DataFrame, clf, reg, residual_quantiles: Optional[dict] = None) -> list:
    """Run both XGBoost models on invoice DataFrame, apply anomaly logic, return results.

    Args:
        df: Raw invoice DataFrame (with Tracking Number, DIM Flag, Net Charge columns).
        clf: Loaded xgb_classifier (from app.state.clf). Predicts DIM flag probability.
        reg: Loaded xgb_regressor (from app.state.reg). Predicts net charge in log-space.
        residual_quantiles: Dict with 'q05' and 'q95' keys (log-space residual bounds).

    Returns:
        List of dicts with shipment data, predictions, intervals, and anomaly flags.
    """
    if residual_quantiles is None:
        residual_quantiles = {"q05": -0.15, "q95": 0.35}

    q05 = residual_quantiles["q05"]
    q95 = residual_quantiles["q95"]

    X = build_feature_matrix(df)

    # Classifier: P(DIM=Y) is the second class (index 1)
    dim_proba_y = clf.predict_proba(X)[:, 1]

    # Regressor: log-space -> dollars via expm1
    log_preds = reg.predict(X)
    predicted_charge = np.expm1(log_preds)

    # Prediction intervals: shift log-space predictions by calibrated residual quantiles
    pred_low = np.expm1(log_preds + q05)
    pred_high = np.expm1(log_preds + q95)

    # Raw columns for anomaly logic (NOT model features — not passed to build_feature_matrix)
    fedex_dim_flags = df["Shipment DIM Flag (Y or N)"]
    actual_charges = pd.to_numeric(df["Net Charge Billed Currency"], errors="coerce").fillna(0)

    # Shipment date — optional, present in full XLSX exports but not all CSVs
    date_col = None
    for col_name in ("Shipment Date (mm/dd/yyyy)", "Shipment Date"):
        if col_name in df.columns:
            date_col = col_name
            break
    shipment_dates = pd.to_datetime(df[date_col], errors="coerce") if date_col else None

    # Apply anomaly flags (now uses pred_high for cost anomaly threshold)
    anomaly_flags = apply_anomaly_flags(
        dim_proba_y, fedex_dim_flags, actual_charges, predicted_charge, pred_high, pred_low
    )

    # Build result list
    results = []
    for i in range(len(df)):
        results.append({
            "tracking_number": str(df["Tracking Number"].iloc[i]),
            "service_type": str(df["Service Type"].iloc[i]),
            "weight_lbs": round(float(pd.to_numeric(df["Original Weight (Pounds)"].iloc[i], errors="coerce") or 0), 1),
            "dim_length": round(float(pd.to_numeric(df["Dimmed Length (in)"].iloc[i], errors="coerce") or 0), 1),
            "dim_width": round(float(pd.to_numeric(df["Dimmed Width (in)"].iloc[i], errors="coerce") or 0), 1),
            "dim_height": round(float(pd.to_numeric(df["Dimmed Height (in)"].iloc[i], errors="coerce") or 0), 1),
            "zone": clean_zone(df["Pricing Zone"].iloc[i]),
            "shipment_date": shipment_dates.iloc[i].strftime("%Y-%m-%d") if shipment_dates is not None and pd.notna(shipment_dates.iloc[i]) else None,
            "dim_flag_probability": round(float(dim_proba_y[i]), 4),
            "actual_net_charge": round(float(actual_charges.iloc[i]), 2),
            "predicted_net_charge": round(float(predicted_charge[i]), 2),
            "predicted_net_charge_low": round(float(pred_low[i]), 2),
            "predicted_net_charge_high": round(float(pred_high[i]), 2),
            "dim_anomaly": anomaly_flags[i]["dim_anomaly"],
            "dim_confidence": anomaly_flags[i]["dim_confidence"],
            "cost_anomaly": anomaly_flags[i]["cost_anomaly"],
            "cost_confidence": anomaly_flags[i]["cost_confidence"],
        })

    return results
