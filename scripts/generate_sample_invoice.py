#!/usr/bin/env python3
"""
Generate a synthetic api/sample_invoice.csv for the /demo/stream endpoint.

Replaces the original CSV (which contained real shipper/recipient names,
addresses, tracking numbers, and account numbers) with fully synthetic data
that preserves the statistical distributions the XGBoost models were trained on.

Usage:
    python scripts/generate_sample_invoice.py

Output:
    api/sample_invoice.csv  (2999 rows, 65 columns — same structure as original)
"""

import pathlib
import numpy as np
import pandas as pd

SEED = 42
N_ROWS = 2999
OUT_PATH = pathlib.Path(__file__).parent.parent / "api" / "sample_invoice.csv"

rng = np.random.default_rng(SEED)

# ---------------------------------------------------------------------------
# Categorical distributions (from real data)
# ---------------------------------------------------------------------------

SERVICE_TYPES, SERVICE_WEIGHTS = zip(*[
    ("QH", 2414), ("PO", 197), ("SO", 135), ("XS", 66),
    ("SG", 64),   ("ES", 62),  ("FO", 30), ("MWT", 21), ("TA", 10),
])
SERVICE_PROBS = np.array(SERVICE_WEIGHTS) / sum(SERVICE_WEIGHTS)

SERVICE_DESC = {
    "QH": "FedEx Ground",
    "PO": "FedEx Home Delivery",
    "SO": "FedEx Ground",
    "XS": "FedEx Express Saver",
    "SG": "FedEx SmartPost",
    "ES": "FedEx 2Day",
    "FO": "FedEx First Overnight",
    "MWT": "FedEx Ground",
    "TA": "FedEx Standard Overnight",
}

OPCO_BY_SERVICE = {
    "QH": "Ground", "PO": "Ground", "SO": "Ground",
    "MWT": "Ground", "SG": "Ground",
    "XS": "Express", "ES": "Express", "FO": "Express", "TA": "Express",
}

PAY_TYPES, PAY_WEIGHTS = zip(*[
    ("Bill_Sender_Prepaid", 2836),
    ("Bill_Recipient", 150),
    ("Bill_Third_Party", 13),
])
PAY_PROBS = np.array(PAY_WEIGHTS) / sum(PAY_WEIGHTS)

ZONES, ZONE_WEIGHTS = zip(*[(6, 1057), (5, 841), (7, 401), (4, 226), (2, 171), (8, 162), (3, 138)])
ZONE_PROBS = np.array(ZONE_WEIGHTS) / sum(ZONE_WEIGHTS)

PKG_TYPES, PKG_WEIGHTS = zip(*[
    ("Customer Packaging", 2801), ("Fedex Letter", 126), ("Fedex Pak", 41),
    ("FedEx Large Box", 14), ("FedEx Medium Box", 13), ("FedEx Small Box", 3), ("Fedex Box", 1),
])
PKG_PROBS = np.array(PKG_WEIGHTS) / sum(PKG_WEIGHTS)

# Shipment months — 24-month span matching original (202205–202405)
MONTHS = [f"{y}{m:02d}" for y in range(2022, 2025) for m in range(1, 13)]
MONTHS = [m for m in MONTHS if "202205" <= m <= "202405"]
MONTH_PROBS = np.ones(len(MONTHS)) / len(MONTHS)

# ---------------------------------------------------------------------------
# Fake but plausible shipper (one fixed origin — synthetic company)
# ---------------------------------------------------------------------------

SHIPPER = {
    "name": "Shipping Dept",
    "company": "Acme Manufacturing Co",
    "address": "100 Industrial Blvd",
    "city": "ATLANTA",
    "state": "GA",
    "country": "US",
    "postal": "30301",
}

# Recipient pool — generic names + a handful of US cities/states
FIRST_NAMES = ["James", "Maria", "Robert", "Linda", "Michael", "Barbara",
               "William", "Patricia", "David", "Jennifer", "Richard", "Susan"]
LAST_NAMES  = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia",
               "Miller", "Davis", "Wilson", "Moore", "Taylor", "Anderson"]
COMPANIES   = ["Retail Depot LLC", "Home Goods Inc", "Furniture Warehouse",
               "Sleep Solutions Co", "Comfort Living", "Metro Distributors",
               "Pacific Supply Co", "Central Wholesale", "National Goods Co"]
CITIES_STATES = [
    ("CHICAGO", "IL", "60601"), ("HOUSTON", "TX", "77001"),
    ("PHOENIX", "AZ", "85001"), ("PHILADELPHIA", "PA", "19101"),
    ("SAN ANTONIO", "TX", "78201"), ("SAN DIEGO", "CA", "92101"),
    ("DALLAS", "TX", "75201"), ("JACKSONVILLE", "FL", "32099"),
    ("AUSTIN", "TX", "73301"), ("COLUMBUS", "OH", "43085"),
    ("CHARLOTTE", "NC", "28201"), ("INDIANAPOLIS", "IN", "46201"),
    ("SEATTLE", "WA", "98101"), ("DENVER", "CO", "80201"),
    ("NASHVILLE", "TN", "37201"), ("LOUISVILLE", "KY", "40201"),
    ("PORTLAND", "OR", "97201"), ("LAS VEGAS", "NV", "89101"),
    ("MEMPHIS", "TN", "38101"), ("BALTIMORE", "MD", "21201"),
]

def fake_tracking():
    return "".join(str(rng.integers(0, 10)) for _ in range(12))

def fake_invoice_number():
    return str(rng.integers(700_000_000, 799_999_999))

def fake_payer_account():
    return str(rng.integers(100_000_000, 999_999_999))

# ---------------------------------------------------------------------------
# Physical dimensions — correlated with DIM flag
# ---------------------------------------------------------------------------

def generate_dims_and_weight(dim_flag: str):
    """
    DIM=Y shipments are physically larger (high volume-to-weight ratio).
    DIM=N shipments are smaller/denser.
    Distributions fit to real data means/spread.
    """
    if dim_flag == "Y":
        length = np.clip(rng.normal(60, 15), 12, 112)
        width  = np.clip(rng.normal(15, 5),   4,  42)
        height = np.clip(rng.normal(15, 5),   4,  60)
        weight = np.clip(rng.normal(51, 22),   1, 145)
    else:
        length = np.clip(rng.normal(30, 12),   4,  60)
        width  = np.clip(rng.normal(12, 5),    2,  30)
        height = np.clip(rng.normal(10, 4),    2,  30)
        weight = np.clip(rng.normal(29, 18),   1,  80)
    return round(float(length), 1), round(float(width), 1), round(float(height), 1), round(float(weight), 1)

# ---------------------------------------------------------------------------
# Generate rows
# ---------------------------------------------------------------------------

service_types = rng.choice(SERVICE_TYPES, N_ROWS, p=SERVICE_PROBS)
pay_types     = rng.choice(PAY_TYPES,     N_ROWS, p=PAY_PROBS)
zones         = rng.choice(ZONES,         N_ROWS, p=ZONE_PROBS)
pkg_types     = rng.choice(PKG_TYPES,     N_ROWS, p=PKG_PROBS)
months        = rng.choice(MONTHS,        N_ROWS, p=MONTH_PROBS)

# DIM flag: 84% Y, 16% N (from real data)
dim_flags = rng.choice(["Y", "N"], N_ROWS, p=[0.8410, 0.1590])

payer_account = fake_payer_account()
invoice_number = fake_invoice_number()

rows = []
for i in range(N_ROWS):
    svc   = service_types[i]
    pay   = pay_types[i]
    zone  = int(zones[i])
    pkg   = pkg_types[i]
    month = str(months[i])
    dim   = dim_flags[i]

    year = int(month[:4])
    mo   = int(month[4:])
    ship_day = rng.integers(1, 29)
    ship_date = f"{mo:02d}/{ship_day:02d}/{year}"
    # delivery 1-3 business days later
    delivery_offset = rng.integers(1, 4)
    del_day = min(ship_day + int(delivery_offset), 28)
    del_date = f"{mo:02d}/{del_day:02d}/{year}"

    length, width, height, weight = generate_dims_and_weight(dim)

    # Rated weight = max(actual, DIM weight = L*W*H/139)
    dim_weight = round(length * width * height / 139, 1)
    rated_weight = round(max(weight, dim_weight), 1)

    # Net charge — lognormal fit to real distribution
    # mean~64, median~40, heavy right tail
    log_charge = rng.normal(3.65, 0.75)  # exp(3.65)≈38.5
    net_charge = round(float(np.clip(np.expm1(log_charge), 3.44, 1200)), 2)

    freight   = round(net_charge * rng.uniform(0.75, 0.85), 2)
    misc      = round(net_charge * rng.uniform(0.10, 0.20), 2)
    discount  = round(abs(net_charge - freight - misc), 2)
    declared_value = round(float(rng.choice([0.0] * 8 + [rng.uniform(50, 1000)], 1)[0]), 2)

    city_idx = rng.integers(0, len(CITIES_STATES))
    rcity, rstate, rpostal = CITIES_STATES[city_idx]
    rfirst = rng.choice(FIRST_NAMES)
    rlast  = rng.choice(LAST_NAMES)
    rcomp  = rng.choice(COMPANIES)
    rstreet_num = rng.integers(100, 9999)
    rstreet = f"{rstreet_num} Main St"

    row = {
        "Payer Account":                          payer_account,
        "Invoice Month (yyyymm)":                 month,
        "OPCO":                                   OPCO_BY_SERVICE.get(svc, "Ground"),
        "Service Type":                           svc,
        "Service Description":                    SERVICE_DESC.get(svc, "FedEx Ground"),
        "Pay Type":                               pay,
        "Shipment Date (mm/dd/yyyy)":             ship_date,
        "Shipment Delivery Date (mm/dd/yyyy)":    del_date,
        "Shipment Tracking Number":               fake_tracking(),
        "Shipper Name":                           SHIPPER["name"],
        "Shipper Company Name":                   SHIPPER["company"],
        "Shipper Address":                        SHIPPER["address"],
        "Shipper City":                           SHIPPER["city"],
        "Shipper State/Province":                 SHIPPER["state"],
        "Shipper Country/Territory":              SHIPPER["country"],
        "Shipper Postal Code":                    SHIPPER["postal"],
        "Shipment Freight Charge Amount USD":     freight,
        "Shipment Miscellaneous Charge USD":      misc,
        "Shipment Duty and Tax Charge USD":       0.00,
        "Shipment Discount Amount USD":           discount,
        "Net Charge Amount USD":                  net_charge,
        "Pieces in Shipment":                     1,
        "Shipment Rated Weight(Pounds)":          rated_weight,
        "Original Weight (Pounds)":               weight,
        "Proof of Delivery Recipient":            rlast.upper(),
        "Recipient Name":                         f"{rfirst} {rlast}",
        "Recipient Company Name":                 rcomp,
        "Recipient Address":                      rstreet,
        "Recipient City":                         rcity,
        "Recipient State/Province":               rstate,
        "Recipient Country/Territory":            "US",
        "Recipient Postal Code":                  rpostal,
        "Reference Notes Line 1":                 "",
        "Reference Notes Line 2":                 "",
        "Reference Notes Line 3":                 "",
        "Department Number":                      "",
        "PO Number":                              "",
        "Pricing Zone":                           zone,
        "Shipment DIM Flag (Y or N)":             dim,
        "Dimmed Height (in)":                     height,
        "Dimmed Width (in)":                      width,
        "Dimmed Length (in)":                     length,
        "Recipient Original Address":             "",
        "Recipient Original City":                "",
        "Recipient Original State/Province":      "",
        "Recipient Original Postal Code":         "",
        "Recipient Original Country/Territory":   "",
        "Shipment Declared Value Amount":         declared_value,
        "Customs Value":                          0.00,
        "Customs Value Currency Code":            "",
        "Invoice Date (mm/dd/yyyy)":              del_date,
        "Invoice Number":                         invoice_number,
        "Master Tracking Number":                 "",
        "Domestic/Intl":                          "Domestic",
        "Package Type":                           pkg,
        "Shipment Delivery Time (12 Hours)":      f"{rng.integers(8,18):02d}:{rng.integers(0,59):02d}",
        "Shipment Freight Charge Billed Currency":  freight,
        "Shipment Miscellaneous Charge Billed Currency": misc,
        "Shipment Duty and Tax Charge Billed Currency": 0.00,
        "Shipment Discount Billed Currency":      discount,
        "Net Charge Billed Currency":             net_charge,
        "Billed Currency Code":                   "USD",
        "Exchange Rate to USD":                   1.0,
        "Weight Type Code":                       "lb",
        "Customer Order Number":                  "",
    }
    rows.append(row)

df = pd.DataFrame(rows)

# Preserve original column order
COLUMN_ORDER = [
    "Payer Account", "Invoice Month (yyyymm)", "OPCO", "Service Type", "Service Description",
    "Pay Type", "Shipment Date (mm/dd/yyyy)", "Shipment Delivery Date (mm/dd/yyyy)",
    "Shipment Tracking Number", "Shipper Name", "Shipper Company Name", "Shipper Address",
    "Shipper City", "Shipper State/Province", "Shipper Country/Territory", "Shipper Postal Code",
    "Shipment Freight Charge Amount USD", "Shipment Miscellaneous Charge USD",
    "Shipment Duty and Tax Charge USD", "Shipment Discount Amount USD", "Net Charge Amount USD",
    "Pieces in Shipment", "Shipment Rated Weight(Pounds)", "Original Weight (Pounds)",
    "Proof of Delivery Recipient", "Recipient Name", "Recipient Company Name", "Recipient Address",
    "Recipient City", "Recipient State/Province", "Recipient Country/Territory", "Recipient Postal Code",
    "Reference Notes Line 1", "Reference Notes Line 2", "Reference Notes Line 3",
    "Department Number", "PO Number", "Pricing Zone", "Shipment DIM Flag (Y or N)",
    "Dimmed Height (in)", "Dimmed Width (in)", "Dimmed Length (in)",
    "Recipient Original Address", "Recipient Original City", "Recipient Original State/Province",
    "Recipient Original Postal Code", "Recipient Original Country/Territory",
    "Shipment Declared Value Amount", "Customs Value", "Customs Value Currency Code",
    "Invoice Date (mm/dd/yyyy)", "Invoice Number", "Master Tracking Number", "Domestic/Intl",
    "Package Type", "Shipment Delivery Time (12 Hours)",
    "Shipment Freight Charge Billed Currency", "Shipment Miscellaneous Charge Billed Currency",
    "Shipment Duty and Tax Charge Billed Currency", "Shipment Discount Billed Currency",
    "Net Charge Billed Currency", "Billed Currency Code", "Exchange Rate to USD",
    "Weight Type Code", "Customer Order Number",
]

df = df[COLUMN_ORDER]
df.to_csv(OUT_PATH, index=False, lineterminator="\n")
print(f"Written {len(df)} rows to {OUT_PATH}")
print(f"DIM flag distribution: {df['Shipment DIM Flag (Y or N)'].value_counts().to_dict()}")
print(f"Net charge range: ${df['Net Charge Billed Currency'].min():.2f} – ${df['Net Charge Billed Currency'].max():.2f}")
print(f"Net charge median: ${df['Net Charge Billed Currency'].median():.2f}")
