import pytest
import pandas as pd
import io
from ingest import parse_invoice, clean_zone, build_feature_matrix, FEATURE_COLS, LEAKAGE_COLS


def test_parse_xlsx(sample_df):
    """ING-02: parse .xlsx returns DataFrame."""
    buf = io.BytesIO()
    sample_df.to_excel(buf, index=False, engine="openpyxl")
    buf.seek(0)
    result = parse_invoice(buf, "test.xlsx")
    assert isinstance(result, pd.DataFrame)
    assert "Tracking Number" in result.columns
    assert len(result) == len(sample_df)


def test_parse_csv(sample_df):
    """ING-02: parse .csv returns DataFrame."""
    csv_bytes = sample_df.to_csv(index=False).encode()
    result = parse_invoice(io.BytesIO(csv_bytes), "test.csv")
    assert isinstance(result, pd.DataFrame)
    assert "Tracking Number" in result.columns


def test_clean_zone():
    """ING-03: zone normalization."""
    assert clean_zone("2") == "02"
    assert clean_zone("17") == "17"
    assert clean_zone("A") == "Other"
    assert clean_zone("99") == "Other"
    assert clean_zone(None) == "Other"
    assert clean_zone(" 8 ") == "08"
    assert clean_zone(2) == "02"
    assert clean_zone(50) == "50"
    assert clean_zone(51) == "Other"


def test_leakage_stripped(sample_df):
    """ING-04: leakage columns not in feature matrix."""
    X = build_feature_matrix(sample_df)
    for col in LEAKAGE_COLS:
        assert col not in X.columns


def test_feature_matrix_shape(sample_df):
    """Feature matrix has exactly 34 columns."""
    X = build_feature_matrix(sample_df)
    assert X.shape[1] == 34
    assert len(X) == len(sample_df)


def test_feature_matrix_columns(sample_df):
    """Feature matrix columns match FEATURE_COLS exactly."""
    X = build_feature_matrix(sample_df)
    assert X.columns.tolist() == FEATURE_COLS


def test_missing_zone_filled(sample_df):
    """Missing zones filled with 0 via reindex."""
    X = build_feature_matrix(sample_df)
    # sample_df has zone "2" -> zone_clean_02=1, all others should be 0
    assert X["zone_clean_02"].iloc[0] == 1
    assert X["zone_clean_17"].iloc[0] == 0
    assert X["zone_clean_Other"].iloc[0] == 0


def test_engineered_features(sample_df):
    """volume and dim_weight_calculator computed correctly."""
    X = build_feature_matrix(sample_df)
    expected_volume = 12.0 * 10.0 * 15.0  # 1800.0
    expected_dim_calc = expected_volume / 139.0
    assert abs(X["volume"].iloc[0] - expected_volume) < 0.01
    assert abs(X["dim_weight_calculator"].iloc[0] - expected_dim_calc) < 0.01


def test_parse_missing_columns():
    """Missing required columns raises ValueError."""
    bad_df_bytes = pd.DataFrame({"col_a": [1]}).to_csv(index=False).encode()
    with pytest.raises(ValueError, match="Missing required columns"):
        parse_invoice(io.BytesIO(bad_df_bytes), "bad.csv")
