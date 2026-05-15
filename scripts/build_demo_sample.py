"""Build a stratified demo invoice from the full 2years FedEx export.

The original April-2024-only sample (1,618 rows) is honestly clean — only
~0.7% land in 'high' audit priority once v2 inference is applied. That makes
the demo button look like it isn't doing anything. This script re-samples
the full 25-month invoice so the demo CSV has a meaningful spread of
review_priority values while staying small enough to ship in the repo.

Output: api/sample_invoice.csv with the SAME column structure as the FedEx
export (66 columns) so /demo/stream → parse_invoice_chunks → run_inference
goes through the same code path as a real upload.

Strategy:
    - All `high` rows (every dispute candidate we can find)
    - Random sample of `medium` rows
    - Random sample of `low` rows to keep total around 1,700
Sampling uses a fixed seed for reproducibility.

Run:  python3 scripts/build_demo_sample.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))

from inference import run_inference  # noqa: E402

SRC = Path(
    # Override at runtime: SOURCE_INVOICE=/path/to/2years.csv python3 scripts/build_demo_sample.py
    __import__("os").environ.get(
        "SOURCE_INVOICE",
        str(ROOT.parent / "shipping-dim-xgboost-pytorch" / "2years.csv"),
    )
)
DST = ROOT / "api" / "sample_invoice.csv"

# Target row counts per priority tier
N_HIGH = None         # take all
N_MEDIUM = 250
N_LOW = 1350
SEED = 42

print(f"Loading {SRC} ...")
df = pd.read_csv(SRC)
print(f"  {len(df):,} rows, {len(df.columns)} cols")

# Normalize tracking alias the way parse_invoice does so inference doesn't choke
if "Tracking Number" not in df.columns:
    for alt in ("Shipment Tracking Number", "Master Tracking Number"):
        if alt in df.columns:
            df = df.rename(columns={alt: "Tracking Number"})
            break

# Inject Customs Value if missing (matches parse_invoice's optional fill)
if "Customs Value" not in df.columns:
    df["Customs Value"] = 0.0

# Drop NonTrans rows (same as ingest)
if "Service Type" in df.columns:
    df = df[df["Service Type"] != "NonTrans"].reset_index(drop=True)

# Run inference in chunks (memory safety; full file is ~26 MB / 57k rows)
print("Scoring full invoice through v2 inference ...")
CHUNK = 5000
priorities: list[str] = []
for i in range(0, len(df), CHUNK):
    chunk = df.iloc[i : i + CHUNK]
    rows = run_inference(chunk)
    priorities.extend(r["review_priority"] for r in rows)
    print(f"  scored {i + len(chunk):>6,} / {len(df):,}")

df["__priority"] = priorities
n_high = (df["__priority"] == "high").sum()
n_med = (df["__priority"] == "medium").sum()
n_low = (df["__priority"] == "low").sum()
print(f"distribution: high={n_high:,} medium={n_med:,} low={n_low:,}")

rng = np.random.default_rng(SEED)
high = df[df["__priority"] == "high"]
med = df[df["__priority"] == "medium"].sample(min(N_MEDIUM, n_med), random_state=SEED)
low = df[df["__priority"] == "low"].sample(min(N_LOW, n_low), random_state=SEED)

# Restore tracking column to its original FedEx name (Shipment Tracking Number)
# so the demo CSV matches the export shape an operator would actually receive.
sample = pd.concat([high, med, low], ignore_index=True)
sample = sample.drop(columns=["__priority", "Customs Value"], errors="ignore")
if "Tracking Number" in sample.columns:
    sample = sample.rename(columns={"Tracking Number": "Shipment Tracking Number"})

# Shuffle so the demo doesn't render highs first then lows
sample = sample.sample(frac=1, random_state=SEED).reset_index(drop=True)

print(f"Final sample: {len(sample):,} rows, {len(sample.columns)} cols")
print(f"  high={len(high):,} medium={len(med):,} low={len(low):,}")

sample.to_csv(DST, index=False)
print(f"Wrote {DST} ({DST.stat().st_size / 1024:.1f} KB)")
