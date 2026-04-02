import pytest


@pytest.mark.skip(reason="Plan 01-02: file parsing not implemented yet")
def test_parse_xlsx():
    """ING-02: pandas parses .xlsx and returns DataFrame with expected columns."""
    pass


@pytest.mark.skip(reason="Plan 01-02: file parsing not implemented yet")
def test_parse_csv():
    """ING-02: pandas parses .csv and returns DataFrame with expected columns."""
    pass


@pytest.mark.skip(reason="Plan 01-02: zone normalization not implemented yet")
def test_clean_zone():
    """ING-03: clean_zone normalizes '2'->'02', 'A'->'Other', '17'->'17', '99'->'Other'."""
    pass


@pytest.mark.skip(reason="Plan 01-02: leakage stripping not implemented yet")
def test_leakage_stripped():
    """ING-04: Feature matrix does not contain leakage columns."""
    pass
