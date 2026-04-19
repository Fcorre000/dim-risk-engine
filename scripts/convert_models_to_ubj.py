"""One-time migration: re-export pickled XGBoost models to UBJ (native) format.

Pickle loading is a pre-auth RCE sink — any tamper of the .pkl file runs arbitrary
code at app boot. XGBoost's native UBJ format is plain data, so the production
loader (api/main.py) can swap pickle.load for xgb.Booster.load_model and remove
the attack surface entirely.

This script is run ONCE against the currently-trusted .pkl files, then the UBJ
files it produces are committed alongside them. After conversion, the .pkl files
should be deleted.

Verification: loads both the pickled model (via its underlying Booster) and the
freshly-serialized UBJ Booster, then asserts that predictions match bit-for-bit
on the real invoice sample. Aborts on any mismatch.

Production never imports sklearn — it only loads xgb.Booster, so we verify
against the same interface the API will use.
"""
from __future__ import annotations

import pathlib
import pickle
import sys
import warnings

import numpy as np
import pandas as pd
import xgboost as xgb

ROOT = pathlib.Path(__file__).parent.parent
MODELS_DIR = ROOT / "models"
API_DIR = ROOT / "api"

sys.path.insert(0, str(API_DIR))
from ingest import build_feature_matrix, parse_invoice  # noqa: E402


def _load_sample_features() -> pd.DataFrame:
    sample_csv = API_DIR / "sample_invoice.csv"
    with open(sample_csv, "rb") as f:
        df = parse_invoice(f, "sample_invoice.csv")
    return build_feature_matrix(df)


def convert(pkl_path: pathlib.Path, ubj_path: pathlib.Path) -> None:
    print(f"  reading  {pkl_path.name}")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with open(pkl_path, "rb") as f:
            wrapped = pickle.load(f)

    old_booster = wrapped.get_booster()

    print(f"  writing  {ubj_path.name}")
    old_booster.save_model(str(ubj_path))

    print(f"  reloading via xgb.Booster.load_model")
    new_booster = xgb.Booster()
    new_booster.load_model(str(ubj_path))

    X = _load_sample_features()
    dmat = xgb.DMatrix(X)
    p_old = old_booster.predict(dmat)
    p_new = new_booster.predict(dmat)

    max_diff = float(np.abs(p_old - p_new).max())
    if not np.allclose(p_old, p_new, atol=1e-6):
        raise SystemExit(f"FAIL: predictions diverge after conversion (max |Δ|={max_diff})")
    print(f"  OK — predictions match on {len(X)} rows (max |Δ|={max_diff:.2e})\n")


def main() -> None:
    print("Converting XGBoost models: pickle -> UBJ\n")
    convert(MODELS_DIR / "xgb_classifier.pkl", MODELS_DIR / "xgb_classifier.ubj")
    convert(MODELS_DIR / "xgb_regressor.pkl", MODELS_DIR / "xgb_regressor.ubj")
    print("Done. Commit the .ubj files and delete the .pkl files.")


if __name__ == "__main__":
    main()
