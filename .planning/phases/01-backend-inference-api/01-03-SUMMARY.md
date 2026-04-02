---
phase: 01-backend-inference-api
plan: 03
subsystem: backend
tags: [inference, xgboost, anomaly-detection, tdd]
dependency_graph:
  requires: [01-02]
  provides: [inference-module]
  affects: [01-04]
tech_stack:
  added: []
  patterns: [tdd, xgboost-predict-proba, np-expm1, pandas-series-normalization]
key_files:
  created:
    - api/inference.py
  modified:
    - api/tests/test_inference.py
decisions:
  - "apply_anomaly_flags is a pure function taking arrays/series for testability without real models"
  - "fedex_dim_flags normalized via .str.upper().str.strip() to handle whitespace and case variants"
  - "predicted_charges uses np.expm1 before any comparison — dollar values never raw log-space"
metrics:
  duration: 2min
  completed: 2026-04-02
  tasks_completed: 1
  files_created: 1
  files_modified: 1
---

# Phase 01 Plan 03: Inference Module Summary

**One-liner:** XGBoost inference module with separate apply_anomaly_flags function — DIM anomaly via P(DIM=N) > 0.6 threshold, cost anomaly via actual > predicted * 1.25, regressor output converted from log-space via np.expm1.

## What Was Built

`api/inference.py` with two exported functions:

- `apply_anomaly_flags(dim_proba_y, fedex_dim_flags, actual_charges, predicted_charges)` — pure function that applies business rules independently from model I/O, enabling isolated unit tests without real model files.
- `run_inference(df, clf, reg)` — orchestrates build_feature_matrix, clf.predict_proba, reg.predict, np.expm1 conversion, and apply_anomaly_flags into a list of per-shipment result dicts.

`api/tests/test_inference.py` replaces 4 skipped stubs with 8 real tests:
- 2 integration tests (real model files): classifier proba shape, regressor expm1 dollars
- 3 DIM anomaly unit tests: Unexpected / None low-prob / None fedex-N
- 2 cost anomaly unit tests: Review / None within-threshold
- 1 end-to-end test: run_inference returns correct dict structure

## Decisions Made

- `apply_anomaly_flags` is a pure function — it receives arrays and series rather than operating on the DataFrame directly. This decouples anomaly logic from model I/O and makes each behavior independently testable.
- FedEx DIM flag normalization via `.str.upper().str.strip()` applied once per call to handle any casing or whitespace variation in uploaded invoice files.
- `np.expm1` applied on the raw regressor output before any downstream use — dollar values are always unwrapped before comparisons or rounding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ingest.py already existed from parallel plan 01-02**
- **Found during:** Task 1 setup (checking if stub needed)
- **Issue:** Plan noted that ingest.py might not exist due to parallel execution; however, 01-02 had already completed and ingest.py was fully implemented.
- **Fix:** No stub needed — inference.py imports the real ingest.py directly.
- **Files modified:** None (no deviation action required)
- **Outcome:** Tests ran against real ingest.build_feature_matrix, validating the full pipeline end-to-end.

## Verification

```
cd api && python -m pytest tests/test_inference.py -v
# 8 passed, 0 failed, 0 skipped in 1.24s

cd api && python -m pytest tests/ -v
# 18 passed, 4 skipped (api endpoint tests — plan 01-04), 0 failed in 1.40s
```

## Known Stubs

None — all functions are fully implemented and wired.

## Self-Check: PASSED

- api/inference.py: FOUND
- api/tests/test_inference.py: FOUND (no @pytest.mark.skip markers)
- Commits: 56a34e3 (RED tests), 3b38179 (GREEN implementation)
