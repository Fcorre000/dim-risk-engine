import pandas as pd
import numpy as np
import io
from typing import Union

FEATURE_COLS = [
    'Pieces in Shipment', 'Original Weight (Pounds)', 'Dimmed Height (in)',
    'Dimmed Width (in)', 'Dimmed Length (in)', 'Shipment Declared Value Amount',
    'Customs Value', 'volume', 'dim_weight_calculator', 'dim_weight_ratio',
    'has_dimensions', 'Service Type_CTAG', 'Service Type_ES', 'Service Type_FO',
    'Service Type_MWT', 'Service Type_PO', 'Service Type_QH', 'Service Type_RMGR',
    'Service Type_SG', 'Service Type_SO', 'Service Type_TA', 'Service Type_XS',
    'Pay Type_Bill_Recipient', 'Pay Type_Bill_Sender_Prepaid', 'Pay Type_Bill_Third_Party',
    'zone_clean_02', 'zone_clean_03', 'zone_clean_04', 'zone_clean_05',
    'zone_clean_06', 'zone_clean_07', 'zone_clean_08', 'zone_clean_17', 'zone_clean_Other'
]

LEAKAGE_COLS = ["Shipment Rated Weight(Pounds)", "Net Charge Billed Currency"]

REQUIRED_COLS = [
    "Tracking Number", "Pieces in Shipment", "Original Weight (Pounds)",
    "Dimmed Height (in)", "Dimmed Width (in)", "Dimmed Length (in)",
    "Shipment Declared Value Amount", "Service Type", "Pay Type",
    "Pricing Zone", "Shipment DIM Flag (Y or N)", "Net Charge Billed Currency",
]


def parse_invoice(file_bytes: io.BytesIO, filename: str) -> pd.DataFrame:
    """Parse an uploaded invoice file (.xlsx or .csv) and return a validated DataFrame.

    Args:
        file_bytes: File content as BytesIO.
        filename: Original filename — used to detect .xlsx vs .csv.

    Returns:
        DataFrame with raw invoice rows (leakage columns still present).

    Raises:
        ValueError: If file type unsupported or required columns are missing.
    """
    fn = filename.lower()
    if fn.endswith(".xlsx"):
        df = pd.read_excel(file_bytes, engine="openpyxl")
    elif fn.endswith(".csv"):
        df = pd.read_csv(file_bytes)
    else:
        raise ValueError("Unsupported file type. Upload .xlsx or .csv")

    # Normalize tracking number column — FedEx exports use different names
    for alt in ("Shipment Tracking Number", "Master Tracking Number"):
        if alt in df.columns and "Tracking Number" not in df.columns:
            df = df.rename(columns={alt: "Tracking Number"})
            break

    # Customs Value is optional — fill if missing
    if "Customs Value" not in df.columns:
        df["Customs Value"] = 0.0

    # Validate required columns (excluding Customs Value which we just filled)
    required_to_check = [c for c in REQUIRED_COLS if c != "Customs Value"]
    missing = [c for c in required_to_check if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Drop NonTrans rows — matches training behavior (non-transportation charges)
    if "Service Type" in df.columns:
        df = df[df["Service Type"] != "NonTrans"].reset_index(drop=True)

    return df


def clean_zone(raw_zone) -> str:
    """Normalize a FedEx Pricing Zone value to a zero-padded string or 'Other'.

    Valid zones are integers 1–50 (inclusive). Anything outside that range,
    non-numeric, or None maps to 'Other'.

    Examples:
        clean_zone("2")   -> "02"
        clean_zone(17)    -> "17"
        clean_zone("A")   -> "Other"
        clean_zone("99")  -> "Other"
        clean_zone(None)  -> "Other"
        clean_zone(" 8 ") -> "08"
    """
    try:
        z = int(float(str(raw_zone).strip()))
        if 1 <= z <= 50:
            return f"{z:02d}"
        else:
            return "Other"
    except (ValueError, TypeError):
        return "Other"


def build_feature_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """Transform a raw invoice DataFrame into the exact 34-column feature matrix
    expected by the XGBoost models.

    Steps:
    1. Engineer volume, dim_weight_calculator, dim_weight_ratio, has_dimensions
    2. Normalize Pricing Zone via clean_zone, then one-hot encode
    3. One-hot encode Service Type and Pay Type
    4. Reindex to FEATURE_COLS (fills missing columns with 0, drops extras)

    Leakage columns (LEAKAGE_COLS) are never included in the output.

    Args:
        df: Raw invoice DataFrame from parse_invoice.

    Returns:
        DataFrame with exactly 34 columns matching FEATURE_COLS.
    """
    df = df.copy()

    # Ensure Customs Value is present
    if "Customs Value" not in df.columns:
        df["Customs Value"] = 0.0

    # --- Engineered features ---
    H = df["Dimmed Height (in)"].fillna(0)
    W = df["Dimmed Width (in)"].fillna(0)
    L = df["Dimmed Length (in)"].fillna(0)

    df["volume"] = H * W * L
    df["dim_weight_calculator"] = df["volume"] / 139.0

    orig_weight = df["Original Weight (Pounds)"].replace(0, np.nan)
    df["dim_weight_ratio"] = df["dim_weight_calculator"] / orig_weight
    df["dim_weight_ratio"] = df["dim_weight_ratio"].replace([np.inf, -np.inf], 0).fillna(0)

    df["has_dimensions"] = ((H > 0) & (W > 0) & (L > 0)).astype(int)

    # --- Zone normalization and OHE ---
    df["zone_clean"] = df["Pricing Zone"].apply(clean_zone)
    zone_dummies = pd.get_dummies(df["zone_clean"], prefix="zone_clean")

    # --- Service Type and Pay Type OHE ---
    svc_dummies = pd.get_dummies(df["Service Type"], prefix="Service Type")
    pay_dummies = pd.get_dummies(df["Pay Type"], prefix="Pay Type")

    # --- Assemble feature DataFrame ---
    feature_df = pd.concat([df, zone_dummies, svc_dummies, pay_dummies], axis=1)

    # Reindex to exact FEATURE_COLS — fills missing columns with 0, drops leakage and extras
    return feature_df.reindex(columns=FEATURE_COLS, fill_value=0)
