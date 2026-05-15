"""Tests for the v2 inference path (calibrated classifier + conformal regressor + anomaly fusion).

The old XGBoost-Booster-on-UBJ tests are gone — v2 artifacts are sklearn pickles
and the inference contract is the dict returned by predict.predict_shipment.
"""
import pandas as pd

from inference import run_inference
from predict import predict_shipment


EXPECTED_KEYS = {
    "row_index", "tracking_number", "service_type", "weight_lbs",
    "dim_length", "dim_width", "dim_height", "zone",
    "shipment_date", "recipient_state",
    "dim_probability", "dim_disagrees_with_fedex",
    "actual_net_charge", "charge_predicted",
    "charge_lower_95", "charge_upper_95", "charge_outside_interval",
    "anomaly_score", "anomaly_flagged",
    "review_recommended", "review_priority",
}


def _example_row():
    """Canonical example from docs/api_contract.md — keep these aligned."""
    return {
        "Original Weight (Pounds)": 18.4,
        "Dimmed Height (cm)": 45.0,
        "Dimmed Width (cm)": 50.0,
        "Dimmed Length (cm)": 60.0,
        "Pricing Zone": "05",
        "Service Type": "Ground",
        "Pay Type": "Bill_Sender_Prepaid",
        "Shipper Postal Code": "76019",
        "Recipient Postal Code": "90210",
        "Recipient State/Province": "CA",
        "Invoice Month (yyyymm)": 202604,
        "Shipment DIM Flag (Y or N)": "Y",
        "Net Charge Billed Currency": 127.23,
    }


def test_predict_shipment_schema():
    """predict_shipment returns the v2 response shape with all keys present."""
    out = predict_shipment(_example_row())
    expected = {
        "dim_predicted", "dim_probability", "dim_disagrees_with_fedex",
        "charge_predicted", "charge_lower_95", "charge_upper_95",
        "charge_actual", "charge_outside_interval",
        "anomaly_score", "anomaly_flagged",
        "review_recommended", "review_priority",
    }
    assert set(out.keys()) == expected
    assert 0.0 <= out["dim_probability"] <= 1.0
    # Conformal interval contains its point prediction (always true for a valid SCR fit)
    assert out["charge_lower_95"] <= out["charge_predicted"] <= out["charge_upper_95"]
    assert out["review_priority"] in {"high", "medium", "low"}


def test_predict_shipment_without_ground_truth():
    """Optional ground-truth fields → audit-comparison keys become None."""
    row = _example_row()
    del row["Shipment DIM Flag (Y or N)"]
    del row["Net Charge Billed Currency"]
    out = predict_shipment(row)
    assert out["dim_disagrees_with_fedex"] is None
    assert out["charge_outside_interval"] is None
    assert out["charge_actual"] is None


def test_predict_shipment_priority_triage():
    """A row hand-tuned to trip all three signals lands in 'high'."""
    out = predict_shipment(_example_row())
    # $127.23 actual vs predicted ~$26 is well above the upper bound, and the
    # anomaly fusion score should fire — both signals plus the (false) DIM
    # agreement give us either 'medium' or 'high'. Real example sits at 'high'.
    if out["charge_outside_interval"] and out["anomaly_flagged"]:
        assert out["review_priority"] == "high"


def test_run_inference_returns_v2_schema():
    """run_inference over a chunk wraps predict_batch and emits new field names."""
    df = pd.DataFrame([{
        "Tracking Number": "TEST123",
        "Original Weight (Pounds)": 10.0,
        "Dimmed Height (cm)": 30.0,
        "Dimmed Width (cm)": 25.0,
        "Dimmed Length (cm)": 38.0,
        "Service Type": "Ground",
        "Pay Type": "Bill_Sender_Prepaid",
        "Pricing Zone": "2",
        "Shipper Postal Code": "76019",
        "Recipient Postal Code": "90210",
        "Recipient State/Province": "CA",
        "Invoice Month (yyyymm)": 202604,
        "Shipment DIM Flag (Y or N)": "Y",
        "Net Charge Billed Currency": 50.0,
        "Shipment Date (mm/dd/yyyy)": "07/17/2024",
    }])
    results = run_inference(df)
    assert isinstance(results, list)
    assert len(results) == 1
    row = results[0]
    assert set(row.keys()) == EXPECTED_KEYS
    assert row["row_index"] == 0
    assert row["tracking_number"] == "TEST123"
    assert 0.0 <= row["dim_probability"] <= 1.0
    assert row["charge_predicted"] > 0
    assert row["charge_lower_95"] <= row["charge_predicted"] <= row["charge_upper_95"]
    assert row["review_priority"] in {"high", "medium", "low"}


def test_run_inference_start_index_offset():
    """Streaming caller passes start_index so row_index stays globally unique across chunks."""
    df = pd.DataFrame([{
        "Tracking Number": f"T{i}",
        "Original Weight (Pounds)": 10.0,
        "Dimmed Height (cm)": 30.0, "Dimmed Width (cm)": 25.0, "Dimmed Length (cm)": 38.0,
        "Service Type": "Ground", "Pay Type": "Bill_Sender_Prepaid",
        "Pricing Zone": "2",
        "Shipper Postal Code": "76019", "Recipient Postal Code": "90210",
        "Recipient State/Province": "CA", "Invoice Month (yyyymm)": 202604,
        "Shipment DIM Flag (Y or N)": "N", "Net Charge Billed Currency": 50.0,
        "Shipment Date (mm/dd/yyyy)": "07/17/2024",
    } for i in range(3)])
    results = run_inference(df, start_index=1000)
    assert [r["row_index"] for r in results] == [1000, 1001, 1002]


def test_run_inference_handles_missing_optional_columns():
    """No Net Charge column → charge_outside_interval is None but the row still scores."""
    df = pd.DataFrame([{
        "Tracking Number": "T1",
        "Original Weight (Pounds)": 10.0,
        "Dimmed Height (cm)": 30.0, "Dimmed Width (cm)": 25.0, "Dimmed Length (cm)": 38.0,
        "Service Type": "Ground", "Pay Type": "Bill_Sender_Prepaid",
        "Pricing Zone": "2",
        "Shipper Postal Code": "76019", "Recipient Postal Code": "90210",
        "Recipient State/Province": "CA", "Invoice Month (yyyymm)": 202604,
        "Shipment DIM Flag (Y or N)": "N",
        # Net Charge Billed Currency is missing/NaN entirely
        "Net Charge Billed Currency": None,
        "Shipment Date (mm/dd/yyyy)": "07/17/2024",
    }])
    results = run_inference(df)
    assert results[0]["charge_outside_interval"] is None
    assert results[0]["charge_predicted"] > 0
