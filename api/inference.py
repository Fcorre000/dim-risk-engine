import pandas as pd
import numpy as np
from ingest import build_feature_matrix, clean_zone


def apply_anomaly_flags(
    dim_proba_y: np.ndarray,
    fedex_dim_flags: pd.Series,
    actual_charges: pd.Series,
    predicted_charges: np.ndarray,
) -> list:
    """Apply DIM and cost anomaly logic. Returns list of flag dicts.

    Args:
        dim_proba_y: Array of P(DIM=Y) values, one per shipment.
        fedex_dim_flags: Series of raw FedEx DIM flag values ("Y" or "N").
        actual_charges: Series of actual net charge amounts in dollars.
        predicted_charges: Array of predicted net charge amounts in dollars.

    Returns:
        List of dicts with keys:
        - dim_anomaly: "Unexpected" if P(DIM=N) > 0.6 AND FedEx flagged DIM=Y; else None
        - cost_anomaly: "Review" if actual charge > predicted * 1.25; else None
    """
    dim_proba_n = 1.0 - dim_proba_y
    fedex_dim = fedex_dim_flags.str.upper().str.strip()

    flags = []
    for i in range(len(dim_proba_y)):
        dim_anom = (
            "Unexpected"
            if (dim_proba_n[i] > 0.6 and fedex_dim.iloc[i] == "Y")
            else None
        )
        cost_anom = (
            "Review"
            if (actual_charges.iloc[i] > predicted_charges[i] * 1.25)
            else None
        )
        flags.append({"dim_anomaly": dim_anom, "cost_anomaly": cost_anom})

    return flags


def run_inference(df: pd.DataFrame, clf, reg) -> list:
    """Run both XGBoost models on invoice DataFrame, apply anomaly logic, return results.

    Args:
        df: Raw invoice DataFrame (with Tracking Number, DIM Flag, Net Charge columns).
        clf: Loaded xgb_classifier (from app.state.clf). Predicts DIM flag probability.
        reg: Loaded xgb_regressor (from app.state.reg). Predicts net charge in log-space.

    Returns:
        List of dicts with keys:
        - tracking_number: str
        - dim_flag_probability: float (P(DIM=Y), 0.0-1.0)
        - predicted_net_charge: float (dollars, after np.expm1)
        - dim_anomaly: Optional[str] ("Unexpected" or None)
        - cost_anomaly: Optional[str] ("Review" or None)
    """
    X = build_feature_matrix(df)

    # Classifier: P(DIM=Y) is the second class (index 1)
    dim_proba_y = clf.predict_proba(X)[:, 1]

    # Regressor: log-space -> dollars via expm1
    log_preds = reg.predict(X)
    predicted_charge = np.expm1(log_preds)

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

    # Apply anomaly flags
    anomaly_flags = apply_anomaly_flags(
        dim_proba_y, fedex_dim_flags, actual_charges, predicted_charge
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
            "dim_anomaly": anomaly_flags[i]["dim_anomaly"],
            "cost_anomaly": anomaly_flags[i]["cost_anomaly"],
        })

    return results
