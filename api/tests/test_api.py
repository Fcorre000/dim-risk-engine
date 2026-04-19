import pytest
import pandas as pd
import numpy as np
import io
import time
import zipfile
from unittest.mock import patch
import main as main_module


@pytest.fixture(autouse=True)
def clear_rate_limit_store():
    """Reset rate limit state between tests so they don't bleed into each other."""
    main_module._rate_limit_store.clear()
    yield
    main_module._rate_limit_store.clear()


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
        "Original Weight (Pounds)": rng.uniform(1, 100, n),
        "Dimmed Height (cm)": rng.uniform(2, 75, n),
        "Dimmed Width (cm)": rng.uniform(2, 75, n),
        "Dimmed Length (cm)": rng.uniform(2, 150, n),
        "Service Type": rng.choice(["FO", "ES", "SO", "PO", "SG"], n),
        "Pay Type": rng.choice(["Bill_Sender_Prepaid", "Bill_Recipient", "Bill_Third_Party"], n),
        "Pricing Zone": rng.choice(["2", "3", "4", "5", "6", "7", "8", "17"], n),
        "Shipment DIM Flag (Y or N)": rng.choice(["Y", "N"], n),
        "Net Charge Billed Currency": rng.uniform(10, 500, n),
        "Shipment Date (mm/dd/yyyy)": ["07/17/2024"] * n,
        "Shipment Rated Weight (Pounds)": rng.uniform(1, 100, n),
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


def test_file_too_large_analyze(client, sample_df):
    """POST /analyze returns 413 when file exceeds MAX_FILE_BYTES."""
    csv_bytes = sample_df.to_csv(index=False).encode()
    with patch.object(main_module, "MAX_FILE_BYTES", 1):  # 1 byte limit
        response = client.post(
            "/analyze",
            files={"file": ("invoice.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
    assert response.status_code == 413
    assert "too large" in response.json()["detail"].lower()


def test_file_too_large_stream(client, sample_df):
    """POST /analyze/stream returns 413 when file exceeds MAX_FILE_BYTES."""
    csv_bytes = sample_df.to_csv(index=False).encode()
    with patch.object(main_module, "MAX_FILE_BYTES", 1):
        response = client.post(
            "/analyze/stream",
            files={"file": ("invoice.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
    assert response.status_code == 413
    assert "too large" in response.json()["detail"].lower()


def test_rate_limit_analyze(client, sample_df):
    """POST /analyze returns 429 after RATE_LIMIT requests within the window."""
    csv_bytes = sample_df.to_csv(index=False).encode()

    # Exhaust the limit
    for _ in range(main_module.RATE_LIMIT):
        r = client.post(
            "/analyze",
            files={"file": ("invoice.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        assert r.status_code == 200

    # Next request must be rejected
    r = client.post(
        "/analyze",
        files={"file": ("invoice.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert r.status_code == 429
    assert "too many requests" in r.json()["detail"].lower()


def test_rate_limit_stream(client, sample_df):
    """POST /analyze/stream returns 429 after RATE_LIMIT requests within the window."""
    csv_bytes = sample_df.to_csv(index=False).encode()

    for _ in range(main_module.RATE_LIMIT):
        r = client.post(
            "/analyze/stream",
            files={"file": ("invoice.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        assert r.status_code == 200

    r = client.post(
        "/analyze/stream",
        files={"file": ("invoice.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert r.status_code == 429
    assert "too many requests" in r.json()["detail"].lower()


def test_rate_limit_keys_by_xff(client, sample_df):
    """X-Forwarded-For determines the bucket — different IPs don't share a limit."""
    csv_bytes = sample_df.to_csv(index=False).encode()

    # IP A exhausts its limit
    for _ in range(main_module.RATE_LIMIT):
        r = client.post(
            "/analyze",
            files={"file": ("invoice.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers={"X-Forwarded-For": "203.0.113.10"},
        )
        assert r.status_code == 200
    r = client.post(
        "/analyze",
        files={"file": ("invoice.csv", io.BytesIO(csv_bytes), "text/csv")},
        headers={"X-Forwarded-For": "203.0.113.10"},
    )
    assert r.status_code == 429

    # IP B, which hasn't spent any quota, must still succeed —
    # proves the store is not bucketed on the proxy's socket address.
    r = client.post(
        "/analyze",
        files={"file": ("invoice.csv", io.BytesIO(csv_bytes), "text/csv")},
        headers={"X-Forwarded-For": "198.51.100.20"},
    )
    assert r.status_code == 200
    assert "203.0.113.10" in main_module._rate_limit_store
    assert "198.51.100.20" in main_module._rate_limit_store


def test_rate_limit_xff_takes_leftmost(client):
    """Leftmost X-Forwarded-For entry is treated as the client identity."""
    main_module.check_rate_limit  # sanity
    from main import _client_ip
    from starlette.requests import Request

    scope = {
        "type": "http",
        "headers": [(b"x-forwarded-for", b"203.0.113.50, 10.0.0.1, 10.0.0.2")],
        "client": ("10.0.0.2", 54321),
    }
    ip = _client_ip(Request(scope))
    assert ip == "203.0.113.50"


def test_rate_limit_sweep_evicts_stale(client):
    """Stale IPs get evicted on sweep so the store can't grow forever."""
    store = main_module._rate_limit_store
    # Seed an IP whose only activity is older than the window.
    old_ts = time.time() - (main_module.RATE_WINDOW * 2)
    store["203.0.113.99"] = [old_ts]
    # Force the sweep by resetting its last-run timestamp.
    main_module._last_sweep = 0.0

    assert main_module.check_rate_limit("203.0.113.100") is True
    assert "203.0.113.99" not in store, "stale entry should be evicted"


def _build_xlsx_zip_bomb() -> bytes:
    """Craft an XLSX-shaped zip archive whose compression ratio trips the guard.

    We don't need valid spreadsheet XML — the safety check runs before openpyxl
    touches the content, so a plain ZIP with a highly-compressible entry is
    enough to exercise the ratio guard.
    """
    buf = io.BytesIO()
    payload = b"A" * (10 * 1024 * 1024)  # 10 MB of one byte — ~1000x ratio
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("xl/worksheets/sheet1.xml", payload)
    return buf.getvalue()


def test_xlsx_zip_bomb_rejected(client):
    """An XLSX whose compression ratio exceeds the ceiling is rejected before openpyxl runs."""
    bomb = _build_xlsx_zip_bomb()
    r = client.post(
        "/analyze",
        files={"file": ("bomb.xlsx", io.BytesIO(bomb), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert r.status_code == 422
    assert "zip bomb" in r.json()["detail"].lower() or "compression ratio" in r.json()["detail"].lower()


def test_size_cap_aborts_before_full_read(client):
    """Oversize upload is rejected without materialising the whole body."""
    # 3 MB of bytes, with a 1 MB ceiling — the bounded reader must stop early.
    big_bytes = b"x" * (3 * 1024 * 1024)
    with patch.object(main_module, "MAX_FILE_BYTES", 1 * 1024 * 1024):
        r = client.post(
            "/analyze",
            files={"file": ("big.csv", io.BytesIO(big_bytes), "text/csv")},
        )
    assert r.status_code == 413
    assert "too large" in r.json()["detail"].lower()
