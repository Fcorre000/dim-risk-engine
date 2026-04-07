"""One-time calibration: compute residual quantiles for prediction intervals.

Loads the XGBoost regressor and runs it against the sample invoice to compute
the 5th and 95th percentile residuals in log-space.  These quantiles are saved
to models/residual_quantiles.json and loaded at API startup to produce
[predicted_low, predicted_high] bounds for every shipment.

Usage:
    cd dim-risk-engine
    python scripts/calibrate_residuals.py
"""

import json
import pathlib
import pickle
import sys

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))

from ingest import build_feature_matrix, parse_invoice  # noqa: E402


def main():
    models_dir = ROOT / "models"

    # Load regressor
    with open(models_dir / "xgb_regressor.pkl", "rb") as f:
        reg = pickle.load(f)

    # Load calibration data — use the sample invoice (3k rows)
    sample_path = ROOT / "api" / "sample_invoice.csv"
    if not sample_path.exists():
        print("ERROR: api/sample_invoice.csv not found. Cannot calibrate.")
        sys.exit(1)

    df = parse_invoice(open(sample_path, "rb"), "sample_invoice.csv")
    X = build_feature_matrix(df)

    # Actual charges in log-space
    actual = pd.to_numeric(df["Net Charge Billed Currency"], errors="coerce").fillna(0)
    actual_log = np.log1p(actual.values)

    # Model predictions (already in log-space)
    pred_log = reg.predict(X)

    # Residuals in log-space: actual - predicted
    residuals = actual_log - pred_log

    q05 = float(np.quantile(residuals, 0.05))
    q95 = float(np.quantile(residuals, 0.95))

    out_path = models_dir / "residual_quantiles.json"
    out_path.write_text(json.dumps({"q05": round(q05, 6), "q95": round(q95, 6)}, indent=2))

    print(f"Calibration complete ({len(df)} rows)")
    print(f"  q05 (5th pct residual): {q05:.6f}")
    print(f"  q95 (95th pct residual): {q95:.6f}")
    print(f"  Saved to {out_path}")


if __name__ == "__main__":
    main()
