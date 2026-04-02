---
phase: 01-backend-inference-api
plan: 02
subsystem: backend
tags: [ingestion, feature-engineering, preprocessing, xgboost, pandas]
dependency_graph:
  requires: [01-01]
  provides: [01-03, 01-04]
  affects: [api/ingest.py]
tech_stack:
  added: [openpyxl]
  patterns: [reindex-fill-zero, pandas-ohe, zone-normalization, tdd-red-green]
key_files:
  created: [api/ingest.py]
  modified: [api/tests/test_ingest.py]
decisions:
  - "Drop NonTrans rows in parse_invoice — matches training data behavior per research open question #3"
  - "clean_zone maps integers 1-50 to zero-padded strings, anything else to Other"
  - "reindex(columns=FEATURE_COLS, fill_value=0) guarantees exact 34-column matrix regardless of invoice column subset"
metrics:
  duration: 2min
  completed: "2026-04-02"
  tasks_completed: 1
  files_changed: 2
---

# Phase 01 Plan 02: File Ingestion and Feature Matrix Assembly Summary

**One-liner:** Pandas-based invoice parser with zone normalization and 34-column XGBoost feature matrix assembly using reindex fill-zero pattern.

## What Was Built

`api/ingest.py` is the data pipeline that sits between raw file upload and model inference. It contains three exported functions and two constants:

- `parse_invoice(file_bytes, filename)` — reads .xlsx or .csv via BytesIO, validates required columns, drops NonTrans rows
- `clean_zone(raw_zone)` — normalizes any zone value to zero-padded 2-digit string (zones 1-50) or "Other"
- `build_feature_matrix(df)` — engineers 4 derived features, one-hot encodes 3 categorical columns, reindexes to exact 34 FEATURE_COLS
- `FEATURE_COLS` — 34-element list matching the XGBoost training feature order exactly
- `LEAKAGE_COLS` — 2-element list of columns that must never enter model input

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| RED | Failing tests for ingest module | 2a43590 | api/tests/test_ingest.py |
| GREEN | Implement ingest.py | 617858f | api/ingest.py |

## Test Results

All 9 ingest tests pass:
- `test_parse_xlsx` — .xlsx round-trip via BytesIO
- `test_parse_csv` — .csv round-trip via BytesIO
- `test_clean_zone` — 9 edge cases including None, int, whitespace, out-of-range
- `test_leakage_stripped` — confirms neither leakage column in feature matrix
- `test_feature_matrix_shape` — exactly 34 columns, row count preserved
- `test_feature_matrix_columns` — columns match FEATURE_COLS order exactly
- `test_missing_zone_filled` — zone_clean_02=1, all other zone columns=0
- `test_engineered_features` — volume=H*W*L, dim_weight_calculator=volume/139.0
- `test_parse_missing_columns` — ValueError raised with message listing missing cols

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Drop NonTrans rows | Matches training behavior per research (open question #3) — model was not trained on non-transportation rows |
| clean_zone range 1-50 | FedEx pricing zones are 1-50; anything outside is non-standard and maps to Other |
| reindex fill_value=0 | Guarantees exact column alignment regardless of what zones/service types appear in a given invoice |
| Customs Value optional | Not always present in invoice exports; fill with 0.0 if missing |

## Deviations from Plan

None — plan executed exactly as written. TDD flow followed: RED commit at 2a43590, GREEN commit at 617858f.

## Known Stubs

None — all exported functions are fully implemented and tested.

## Self-Check

### Files

- [x] api/ingest.py exists
- [x] api/tests/test_ingest.py exists and contains no @pytest.mark.skip

### Commits

- [x] 2a43590 — RED test commit
- [x] 617858f — GREEN implementation commit

### Verification

- [x] `python -m pytest tests/test_ingest.py -v` — 9 passed
- [x] `python -c "from ingest import FEATURE_COLS; print(len(FEATURE_COLS))"` — outputs 34
- [x] test_health still passes (no regressions)

## Self-Check: PASSED
