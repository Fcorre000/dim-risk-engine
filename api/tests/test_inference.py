import pytest
import pickle
import numpy as np
import pandas as pd
from inference import run_inference, apply_anomaly_flags
from ingest import FEATURE_COLS


def test_classifier_loaded(models_dir):
    """INF-01: Classifier loads and predict_proba returns (N,2) shape."""
    with open(models_dir / "xgb_classifier.pkl", "rb") as f:
        clf = pickle.load(f)
    X = pd.DataFrame(np.zeros((1, 34)), columns=FEATURE_COLS)
    proba = clf.predict_proba(X)
    assert proba.shape == (1, 2)
    assert 0.0 <= proba[0, 0] <= 1.0
    assert 0.0 <= proba[0, 1] <= 1.0
    assert abs(proba[0, 0] + proba[0, 1] - 1.0) < 1e-6


def test_regressor_expm1(models_dir):
    """INF-02: Regressor output via expm1 is positive dollars."""
    with open(models_dir / "xgb_regressor.pkl", "rb") as f:
        reg = pickle.load(f)
    X = pd.DataFrame(np.zeros((1, 34)), columns=FEATURE_COLS)
    log_pred = reg.predict(X)
    dollar_pred = np.expm1(log_pred)
    assert dollar_pred[0] > 0, f"Expected positive dollars, got {dollar_pred[0]}"


def test_dim_anomaly_unexpected():
    """INF-03: DIM anomaly 'Unexpected' when P(DIM=N)>0.6 and FedEx=Y."""
    dim_proba_y = np.array([0.3])  # P(DIM=N) = 0.7 > 0.6
    fedex_flags = pd.Series(["Y"])
    actual_charges = pd.Series([50.0])
    predicted_charges = np.array([50.0])
    flags = apply_anomaly_flags(dim_proba_y, fedex_flags, actual_charges, predicted_charges)
    assert flags[0]["dim_anomaly"] == "Unexpected"


def test_dim_anomaly_none_low_prob():
    """INF-03: No DIM anomaly when P(DIM=N) < 0.6."""
    dim_proba_y = np.array([0.8])  # P(DIM=N) = 0.2 < 0.6
    fedex_flags = pd.Series(["Y"])
    actual_charges = pd.Series([50.0])
    predicted_charges = np.array([50.0])
    flags = apply_anomaly_flags(dim_proba_y, fedex_flags, actual_charges, predicted_charges)
    assert flags[0]["dim_anomaly"] is None


def test_dim_anomaly_none_fedex_n():
    """INF-03: No DIM anomaly when FedEx flag is N (even if P(DIM=N)>0.6)."""
    dim_proba_y = np.array([0.3])  # P(DIM=N) = 0.7 > 0.6
    fedex_flags = pd.Series(["N"])
    actual_charges = pd.Series([50.0])
    predicted_charges = np.array([50.0])
    flags = apply_anomaly_flags(dim_proba_y, fedex_flags, actual_charges, predicted_charges)
    assert flags[0]["dim_anomaly"] is None


def test_cost_anomaly_review():
    """INF-04: Cost anomaly 'Review' when actual > predicted * 1.25."""
    dim_proba_y = np.array([0.8])
    fedex_flags = pd.Series(["N"])
    actual_charges = pd.Series([100.0])
    predicted_charges = np.array([60.0])  # 100 > 60*1.25=75
    flags = apply_anomaly_flags(dim_proba_y, fedex_flags, actual_charges, predicted_charges)
    assert flags[0]["cost_anomaly"] == "Review"


def test_cost_anomaly_none():
    """INF-04: No cost anomaly when actual <= predicted * 1.25."""
    dim_proba_y = np.array([0.8])
    fedex_flags = pd.Series(["N"])
    actual_charges = pd.Series([100.0])
    predicted_charges = np.array([90.0])  # 100 < 90*1.25=112.5
    flags = apply_anomaly_flags(dim_proba_y, fedex_flags, actual_charges, predicted_charges)
    assert flags[0]["cost_anomaly"] is None


def test_run_inference_returns_list(sample_df, models_dir):
    """run_inference returns list of dicts with correct keys."""
    with open(models_dir / "xgb_classifier.pkl", "rb") as f:
        clf = pickle.load(f)
    with open(models_dir / "xgb_regressor.pkl", "rb") as f:
        reg = pickle.load(f)
    results = run_inference(sample_df, clf, reg)
    assert isinstance(results, list)
    assert len(results) == len(sample_df)
    expected_keys = {"tracking_number", "dim_flag_probability", "predicted_net_charge", "dim_anomaly", "cost_anomaly"}
    assert set(results[0].keys()) == expected_keys
    assert isinstance(results[0]["tracking_number"], str)
    assert 0.0 <= results[0]["dim_flag_probability"] <= 1.0
    assert results[0]["predicted_net_charge"] > 0
