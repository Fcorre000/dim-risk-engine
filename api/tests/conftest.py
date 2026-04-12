import pytest
import pandas as pd
import pathlib
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def sample_df():
    """Minimal valid DataFrame matching FedEx invoice structure."""
    return pd.DataFrame({
        "Tracking Number": ["1234567890"],
        "Original Weight (Pounds)": [10.0],
        "Dimmed Height (cm)": [30.0],
        "Dimmed Width (cm)": [25.0],
        "Dimmed Length (cm)": [38.0],
        "Service Type": ["FO"],
        "Pay Type": ["Bill_Sender_Prepaid"],
        "Pricing Zone": ["2"],
        "Shipment DIM Flag (Y or N)": ["Y"],
        "Net Charge Billed Currency": [50.0],
        "Shipment Date (mm/dd/yyyy)": ["07/17/2024"],
        "Shipment Rated Weight (Pounds)": [15.0],
    })


@pytest.fixture
def models_dir():
    return pathlib.Path(__file__).parent.parent.parent / "models"
