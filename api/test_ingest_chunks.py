"""Unit tests for parse_invoice_chunks generator."""
import io
import pytest
import pandas as pd
import openpyxl

from ingest import parse_invoice_chunks, REQUIRED_COLS, LEAKAGE_COLS

# Minimal valid schema: all REQUIRED_COLS + one leakage col
VALID_COLS = list(REQUIRED_COLS) + ["Shipment Rated Weight(Pounds)"]

def _make_valid_row(service_type="ES"):
    return {
        "Tracking Number": "123456789",
        "Pieces in Shipment": 1,
        "Original Weight (Pounds)": 5.0,
        "Dimmed Height (in)": 10.0,
        "Dimmed Width (in)": 10.0,
        "Dimmed Length (in)": 10.0,
        "Shipment Declared Value Amount": 100.0,
        "Service Type": service_type,
        "Pay Type": "Bill_Sender_Prepaid",
        "Pricing Zone": "2",
        "Shipment DIM Flag (Y or N)": "N",
        "Net Charge Billed Currency": 15.0,
        "Customs Value": 0.0,
        "Shipment Rated Weight(Pounds)": 6.0,
    }


def _make_csv_bytes(rows):
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    buf.write(df.to_csv(index=False).encode())
    buf.seek(0)
    return buf


def _make_xlsx_bytes(rows):
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(list(df.columns))
    for _, row in df.iterrows():
        ws.append(list(row))
    wb.save(buf)
    buf.seek(0)
    return buf


def test_csv_chunking():
    rows = [_make_valid_row() for _ in range(4)] + [_make_valid_row("NonTrans")]
    bio = _make_csv_bytes(rows)

    chunks = list(parse_invoice_chunks(bio, "test.csv", chunksize=3))

    total_rows = sum(len(c) for c in chunks)
    assert total_rows == 4, f"Expected 4 rows (1 NonTrans dropped), got {total_rows}"
    assert len(chunks) == 2, f"Expected 2 chunks with chunksize=3, got {len(chunks)}"

    # Leakage columns stay in chunk (build_feature_matrix strips them for model input)
    for chunk in chunks:
        assert "Tracking Number" in chunk.columns
        assert "Service Type" in chunk.columns


def test_xlsx_chunking():
    rows = [_make_valid_row() for _ in range(4)] + [_make_valid_row("NonTrans")]
    bio = _make_xlsx_bytes(rows)

    chunks = list(parse_invoice_chunks(bio, "test.xlsx", chunksize=3))

    total_rows = sum(len(c) for c in chunks)
    assert total_rows == 4, f"Expected 4 rows (1 NonTrans dropped), got {total_rows}"

    for chunk in chunks:
        assert "Tracking Number" in chunk.columns
        assert "Service Type" in chunk.columns
