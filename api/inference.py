"""Run v2 inference over a parsed invoice DataFrame and assemble per-row results.

Wraps `predict.predict_batch` with the display-field plumbing the dashboard
needs (tracking number, weight, dims, zone, shipment date, recipient state).
All ML logic — calibrated classifier, conformal regressor, isolation-forest +
autoencoder anomaly score, audit triage — lives in `predict.py`.
"""

from __future__ import annotations

import pandas as pd

from ingest import clean_zone
from predict import predict_batch


_REQUIRED_RAW_KEYS = [
    'Original Weight (Pounds)',
    'Dimmed Height (cm)', 'Dimmed Width (cm)', 'Dimmed Length (cm)',
    'Pricing Zone', 'Service Type', 'Pay Type',
    'Shipper Postal Code', 'Recipient Postal Code',
    'Recipient State/Province', 'Invoice Month (yyyymm)',
]


def _safe_float(v, default: float = 0.0) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    return f if pd.notna(f) else default


def _invoice_month_from_row(row: pd.Series) -> int | None:
    """Recover the `Invoice Month (yyyymm)` int from whichever column the export carries."""
    for col in ('Invoice Month (yyyymm)', 'Invoice Month'):
        if col in row.index and pd.notna(row[col]):
            try:
                return int(float(row[col]))
            except (TypeError, ValueError):
                pass
    for col in ('Shipment Date (mm/dd/yyyy)', 'Shipment Date'):
        if col in row.index and pd.notna(row[col]):
            ts = pd.to_datetime(row[col], errors='coerce')
            if pd.notna(ts):
                return int(ts.year * 100 + ts.month)
    return None


def _build_raw_dict(row: pd.Series) -> dict:
    """Translate one DataFrame row into the raw dict shape predict_batch expects."""
    return {
        'Original Weight (Pounds)': _safe_float(row.get('Original Weight (Pounds)')),
        'Dimmed Height (cm)': _safe_float(row.get('Dimmed Height (cm)')),
        'Dimmed Width (cm)': _safe_float(row.get('Dimmed Width (cm)')),
        'Dimmed Length (cm)': _safe_float(row.get('Dimmed Length (cm)')),
        'Pricing Zone': row.get('Pricing Zone'),
        'Service Type': row.get('Service Type'),
        'Pay Type': row.get('Pay Type'),
        'Shipper Postal Code': row.get('Shipper Postal Code', ''),
        'Recipient Postal Code': row.get('Recipient Postal Code', ''),
        'Recipient State/Province': _extract_state_from_row(row),
        'Invoice Month (yyyymm)': _invoice_month_from_row(row),
        # Optional audit-comparison fields — None when absent
        'Shipment DIM Flag (Y or N)': row.get('Shipment DIM Flag (Y or N)'),
        'Net Charge Billed Currency': _safe_float(row.get('Net Charge Billed Currency'), default=None) if pd.notna(row.get('Net Charge Billed Currency')) else None,
    }


def _extract_state_from_row(row: pd.Series) -> str | None:
    """Recipient state with column-shift fallback.

    FedEx exports sometimes shift address→city→state→country, putting the city
    name in the state column and the actual 2-letter state code in the country
    column. Try state first, fall back to country if state isn't a 2-letter
    alpha code.
    """
    s = row.get('Recipient State/Province')
    if pd.notna(s):
        v = str(s).strip().upper()
        if len(v) == 2 and v.isalpha():
            return v
    c = row.get('Recipient Country/Territory')
    if pd.notna(c):
        v = str(c).strip().upper()
        if len(v) == 2 and v.isalpha() and v != 'US':
            return v
    return None


def _extract_shipment_date(row: pd.Series) -> str | None:
    for col in ('Shipment Date (mm/dd/yyyy)', 'Shipment Date'):
        if col in row.index and pd.notna(row[col]):
            ts = pd.to_datetime(row[col], errors='coerce')
            if pd.notna(ts):
                return ts.strftime('%Y-%m-%d')
    return None


def run_inference(df: pd.DataFrame, start_index: int = 0) -> list[dict]:
    """Score a chunk of parsed invoice rows and return per-row result dicts.

    Args:
        df: Parsed invoice DataFrame (from parse_invoice or parse_invoice_chunks).
        start_index: Offset for the per-row `row_index` field. Streaming callers
            pass a running total across chunks so every result has a globally
            unique id (used as a stable React key on the frontend — tracking
            numbers can be null or duplicate in real FedEx exports).

    Returns:
        List of dicts matching the ShipmentResult Pydantic model in main.py.
        Schema version: v2 (calibrated + conformal + anomaly fusion).
    """
    if len(df) == 0:
        return []

    raw_rows = [_build_raw_dict(df.iloc[i]) for i in range(len(df))]
    predictions = predict_batch(raw_rows)

    results: list[dict] = []
    for i in range(len(df)):
        row = df.iloc[i]
        p = predictions[i]

        # Tracking number can be missing in real FedEx exports — keep as None
        # rather than serializing NaN as the string "nan", which would (a) display
        # literally in the UI and (b) collide as a React key for every NaN row,
        # breaking sort/reconciliation.
        tn_raw = row.get('Tracking Number')
        tracking_number = str(tn_raw) if pd.notna(tn_raw) else None

        results.append({
            # Display fields (sourced from the raw invoice, not the model)
            'row_index': start_index + i,
            'tracking_number': tracking_number,
            'service_type': str(row.get('Service Type', '')),
            'weight_lbs': round(_safe_float(row.get('Original Weight (Pounds)')), 1),
            'dim_length': round(_safe_float(row.get('Dimmed Length (cm)')), 1),
            'dim_width': round(_safe_float(row.get('Dimmed Width (cm)')), 1),
            'dim_height': round(_safe_float(row.get('Dimmed Height (cm)')), 1),
            'zone': clean_zone(row.get('Pricing Zone')),
            'shipment_date': _extract_shipment_date(row),
            'recipient_state': _extract_state_from_row(row),

            # Model outputs (v2 contract — see docs/api_contract.md)
            'dim_probability': round(p['dim_probability'], 4),
            'dim_disagrees_with_fedex': p['dim_disagrees_with_fedex'],
            'actual_net_charge': round(p['charge_actual'], 2) if p['charge_actual'] is not None else 0.0,
            'charge_predicted': round(p['charge_predicted'], 2),
            'charge_lower_95': round(p['charge_lower_95'], 2),
            'charge_upper_95': round(p['charge_upper_95'], 2),
            'charge_outside_interval': p['charge_outside_interval'],
            'anomaly_score': round(p['anomaly_score'], 4) if p['anomaly_score'] is not None else None,
            'anomaly_flagged': p['anomaly_flagged'],
            'review_recommended': p['review_recommended'],
            'review_priority': p['review_priority'],
        })
    return results
