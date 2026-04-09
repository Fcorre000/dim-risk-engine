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
    predicted_high = np.array([62.5])
    flags = apply_anomaly_flags(dim_proba_y, fedex_flags, actual_charges, predicted_charges, predicted_high)
    assert flags[0]["dim_anomaly"] == "Unexpected"
    assert flags[0]["dim_confidence"] == 0.7


def test_dim_anomaly_none_low_prob():
    """INF-03: No DIM anomaly when P(DIM=N) < 0.6."""
    dim_proba_y = np.array([0.8])  # P(DIM=N) = 0.2 < 0.6
    fedex_flags = pd.Series(["Y"])
    actual_charges = pd.Series([50.0])
    predicted_charges = np.array([50.0])
    predicted_high = np.array([62.5])
    flags = apply_anomaly_flags(dim_proba_y, fedex_flags, actual_charges, predicted_charges, predicted_high)
    assert flags[0]["dim_anomaly"] is None
    assert flags[0]["dim_confidence"] is None


def test_dim_anomaly_none_fedex_n():
    """INF-03: No DIM anomaly when FedEx flag is N (even if P(DIM=N)>0.6)."""
    dim_proba_y = np.array([0.3])  # P(DIM=N) = 0.7 > 0.6
    fedex_flags = pd.Series(["N"])
    actual_charges = pd.Series([50.0])
    predicted_charges = np.array([50.0])
    predicted_high = np.array([62.5])
    flags = apply_anomaly_flags(dim_proba_y, fedex_flags, actual_charges, predicted_charges, predicted_high)
    assert flags[0]["dim_anomaly"] is None


def test_cost_anomaly_review():
    """INF-04: Cost anomaly 'Review' when actual > predicted_high; confidence is a valid grade."""
    dim_proba_y = np.array([0.8])
    fedex_flags = pd.Series(["N"])
    actual_charges = pd.Series([100.0])
    predicted_charges = np.array([60.0])
    predicted_high = np.array([75.0])   # 100 > 75
    predicted_low = np.array([48.0])    # CI width = 27; overage = 25 → multiple ≈ 0.93 → "Medium"
    flags = apply_anomaly_flags(dim_proba_y, fedex_flags, actual_charges, predicted_charges, predicted_high, predicted_low)
    assert flags[0]["cost_anomaly"] == "Review"
    assert flags[0]["cost_confidence"] in {"Low", "Medium", "High", "Critical"}
    assert flags[0]["cost_confidence"] == "Medium"  # 25/27 ≈ 0.93, between 0.5 and 1.0


def test_cost_confidence_grades():
    """INF-04b: cost_confidence grades match overage/CI-width multiples."""
    def flags_for(actual, pred_high, pred_low):
        return apply_anomaly_flags(
            np.array([0.8]), pd.Series(["N"]),
            pd.Series([actual]), np.array([pred_high * 0.8]),
            np.array([pred_high]), np.array([pred_low]),
        )[0]["cost_confidence"]

    ci_width = 20.0
    pred_low, pred_high = 40.0, 60.0
    # overage = actual - pred_high; multiple = overage / ci_width
    assert flags_for(68.0, pred_high, pred_low) == "Low"       # 8/20 = 0.40
    assert flags_for(78.0, pred_high, pred_low) == "Medium"    # 18/20 = 0.90
    assert flags_for(95.0, pred_high, pred_low) == "High"      # 35/20 = 1.75
    assert flags_for(120.0, pred_high, pred_low) == "Critical"  # 60/20 = 3.00


def test_cost_anomaly_none():
    """INF-04: No cost anomaly when actual <= predicted_high."""
    dim_proba_y = np.array([0.8])
    fedex_flags = pd.Series(["N"])
    actual_charges = pd.Series([100.0])
    predicted_charges = np.array([90.0])
    predicted_high = np.array([112.5])  # 100 < 112.5
    flags = apply_anomaly_flags(dim_proba_y, fedex_flags, actual_charges, predicted_charges, predicted_high)
    assert flags[0]["cost_anomaly"] is None
    assert flags[0]["cost_confidence"] is None


def test_run_inference_returns_list(sample_df, models_dir):
    """run_inference returns list of dicts with correct keys."""
    with open(models_dir / "xgb_classifier.pkl", "rb") as f:
        clf = pickle.load(f)
    with open(models_dir / "xgb_regressor.pkl", "rb") as f:
        reg = pickle.load(f)
    from inference import load_residual_quantiles
    rq = load_residual_quantiles(models_dir)
    results = run_inference(sample_df, clf, reg, rq)
    assert isinstance(results, list)
    assert len(results) == len(sample_df)
    expected_keys = {
        "tracking_number", "service_type", "weight_lbs", "dim_length", "dim_width",
        "dim_height", "zone", "shipment_date", "dim_flag_probability",
        "actual_net_charge", "predicted_net_charge",
        "predicted_net_charge_low", "predicted_net_charge_high",
        "dim_anomaly", "dim_confidence", "cost_anomaly", "cost_confidence",
    }
    assert set(results[0].keys()) == expected_keys
    assert isinstance(results[0]["tracking_number"], str)
    assert 0.0 <= results[0]["dim_flag_probability"] <= 1.0
    assert results[0]["predicted_net_charge"] > 0
    assert results[0]["predicted_net_charge_low"] <= results[0]["predicted_net_charge"]
    assert results[0]["predicted_net_charge_high"] >= results[0]["predicted_net_charge"]
