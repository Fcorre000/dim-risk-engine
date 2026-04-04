"""Integration smoke test for /analyze/stream with chunked parsing."""
import io
import pathlib
import pytest
import pandas as pd

from fastapi.testclient import TestClient

from ingest import REQUIRED_COLS

MODELS_DIR = pathlib.Path(__file__).parent.parent / "models"

@pytest.fixture(scope="module")
def client():
    if not (MODELS_DIR / "xgb_classifier.pkl").exists():
        pytest.skip("Models not found — skipping integration test")
    from main import app
    with TestClient(app) as c:
        yield c


def _make_csv_bytes(n_rows=10):
    rows = []
    for i in range(n_rows):
        rows.append({
            "Tracking Number": f"TRK{i:06d}",
            "Pieces in Shipment": 1,
            "Original Weight (Pounds)": 5.0,
            "Dimmed Height (in)": 10.0,
            "Dimmed Width (in)": 10.0,
            "Dimmed Length (in)": 10.0,
            "Shipment Declared Value Amount": 100.0,
            "Service Type": "ES",
            "Pay Type": "Bill_Sender_Prepaid",
            "Pricing Zone": "2",
            "Shipment DIM Flag (Y or N)": "N",
            "Net Charge Billed Currency": 15.0,
            "Customs Value": 0.0,
        })
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    buf.write(df.to_csv(index=False).encode())
    buf.seek(0)
    return buf


def test_stream_endpoint_returns_ndjson(client):
    csv_bytes = _make_csv_bytes(10)

    response = client.post(
        "/analyze/stream",
        files={"file": ("test.csv", csv_bytes, "text/csv")},
    )

    assert response.status_code == 200

    import json
    lines = [ln for ln in response.text.strip().split("\n") if ln.strip()]
    parsed = [json.loads(ln) for ln in lines]

    # First line must be meta
    assert parsed[0].get("__meta__") is True, f"Expected __meta__ in first line: {parsed[0]}"

    # At least one subsequent line must have tracking_number
    row_lines = parsed[1:]
    assert any("tracking_number" in r for r in row_lines), "No shipment rows found in stream"

    # No error lines
    assert not any("__error__" in r for r in parsed), f"Error line found: {parsed}"
