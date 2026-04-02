import pytest


@pytest.mark.skip(reason="Plan 01-04: endpoint not wired yet")
def test_analyze_endpoint(client):
    """INF-05: POST /analyze returns 200 and JSON array for valid xlsx."""
    pass


@pytest.mark.skip(reason="Plan 01-04: endpoint not wired yet")
def test_analyze_csv(client):
    """INF-05: POST /analyze accepts .csv files."""
    pass


@pytest.mark.skip(reason="Plan 01-04: endpoint not wired yet")
def test_performance_5k_rows(client):
    """INF-05: 5,000-row upload returns response in < 1 second."""
    pass


@pytest.mark.skip(reason="Plan 01-04: endpoint not wired yet")
def test_analyze_invalid_file(client):
    """POST /analyze returns 422 for missing required columns."""
    pass


def test_health(client):
    """Health endpoint returns 200 with models_loaded=True."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["models_loaded"] is True
