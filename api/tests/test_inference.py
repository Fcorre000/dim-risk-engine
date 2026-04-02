import pytest


@pytest.mark.skip(reason="Plan 01-01/01-03: inference not implemented yet")
def test_classifier_loaded(client):
    """INF-01: Classifier loaded at startup, predict_proba returns shape (N,2)."""
    pass


@pytest.mark.skip(reason="Plan 01-03: regressor not implemented yet")
def test_regressor_expm1():
    """INF-02: Regressor output converted via expm1 to positive dollar values."""
    pass


@pytest.mark.skip(reason="Plan 01-03: anomaly logic not implemented yet")
def test_dim_anomaly_logic():
    """INF-03: DIM anomaly = 'Unexpected' when P(DIM=N)>0.6 and FedEx=Y."""
    pass


@pytest.mark.skip(reason="Plan 01-03: anomaly logic not implemented yet")
def test_cost_anomaly_logic():
    """INF-04: Cost anomaly = 'Review' when actual > predicted * 1.25."""
    pass
