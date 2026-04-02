import pytest
import pandas as pd
import numpy as np
import io
import time


def test_health(client):
    """Health endpoint returns 200 with models_loaded=True."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["models_loaded"] is True


def test_analyze_endpoint(client, sample_df):
    """INF-05: POST /analyze returns 200 and JSON array for valid xlsx."""
    buf = io.BytesIO()
    sample_df.to_excel(buf, index=False, engine="openpyxl")
    buf.seek(0)
    response = client.post(
        "/analyze",
        files={"file": ("invoice.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == len(sample_df)
    row = data[0]
    assert "tracking_number" in row
    assert "dim_flag_probability" in row
    assert "predicted_net_charge" in row
    assert "dim_anomaly" in row
    assert "cost_anomaly" in row
    assert 0.0 <= row["dim_flag_probability"] <= 1.0
    assert row["predicted_net_charge"] > 0


def test_analyze_csv(client, sample_df):
    """INF-05: POST /analyze accepts .csv files."""
    csv_bytes = sample_df.to_csv(index=False).encode()
    response = client.post(
        "/analyze",
        files={"file": ("invoice.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == len(sample_df)


def test_analyze_invalid_file(client):
    """POST /analyze returns 422 for missing required columns."""
    bad_csv = "col_a,col_b\n1,2\n".encode()
    response = client.post(
        "/analyze",
        files={"file": ("bad.csv", io.BytesIO(bad_csv), "text/csv")},
    )
    assert response.status_code == 422
    assert "Missing required columns" in response.json()["detail"]


def test_performance_5k_rows(client):
    """INF-05: 5,000-row upload returns response in < 1 second."""
    n = 5000
    rng = np.random.default_rng(42)
    df = pd.DataFrame({
        "Tracking Number": [f"TRK{i:06d}" for i in range(n)],
        "Pieces in Shipment": rng.integers(1, 10, n),
        "Original Weight (Pounds)": rng.uniform(1, 100, n),
        "Dimmed Height (in)": rng.uniform(1, 30, n),
        "Dimmed Width (in)": rng.uniform(1, 30, n),
        "Dimmed Length (in)": rng.uniform(1, 60, n),
        "Shipment Declared Value Amount": rng.uniform(0, 1000, n),
        "Customs Value": np.zeros(n),
        "Service Type": rng.choice(["FO", "ES", "SO", "PO", "SG"], n),
        "Pay Type": rng.choice(["Bill_Sender_Prepaid", "Bill_Recipient", "Bill_Third_Party"], n),
        "Pricing Zone": rng.choice(["2", "3", "4", "5", "6", "7", "8", "17"], n),
        "Shipment DIM Flag (Y or N)": rng.choice(["Y", "N"], n),
        "Net Charge Billed Currency": rng.uniform(10, 500, n),
        "Shipment Rated Weight(Pounds)": rng.uniform(1, 100, n),
    })
    csv_bytes = df.to_csv(index=False).encode()

    start = time.perf_counter()
    response = client.post(
        "/analyze",
        files={"file": ("big.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    elapsed = time.perf_counter() - start

    assert response.status_code == 200
    data = response.json()
    assert len(data) == n
    assert elapsed < 1.0, f"5k rows took {elapsed:.2f}s, exceeds 1s SLA"
