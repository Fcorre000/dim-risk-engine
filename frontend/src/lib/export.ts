import type { ShipmentResult } from '../types/api';

/**
 * A dispute candidate is any shipment where FedEx was flagged as anomalous:
 * - dim_anomaly === 'Unexpected': DIM charge where model predicts DIM=N (strongest dispute case)
 * - cost_anomaly === 'Review': Actual charge > predicted × 1.25
 */
export function getDisputeCandidates(results: ShipmentResult[]): ShipmentResult[] {
  return results.filter(
    (r) => r.dim_anomaly === 'Unexpected' || r.cost_anomaly === 'Review'
  );
}

// CWE-1236: Excel / Google Sheets / LibreOffice treat cells whose first character
// is one of `= + - @ \t \r` as a formula. A tracking number like `=HYPERLINK(...)`
// would fire when a user opens our export. Prepending a single quote neutralises
// the leading sigil — spreadsheets render it literally and strip the guard.
const FORMULA_SIGILS = new Set(['=', '+', '-', '@', '\t', '\r']);

export function escapeFormula(s: string): string {
  if (!s) return s;
  return FORMULA_SIGILS.has(s[0]) ? `'${s}` : s;
}

/** Quote a CSV field, neutralise leading formula sigils, and double any embedded quotes. */
export function csvField(s: string): string {
  return `"${escapeFormula(s).replace(/"/g, '""')}"`;
}

/**
 * Generate a CSV string from an array of dispute candidate shipments.
 * Columns: Tracking #, Flag type, Actual $, Predicted $, Gap $
 * All string-valued fields are quoted and run through the formula-injection guard.
 * Numeric fields come from `.toFixed()` so they're safe by construction.
 * Returns a string with CRLF line endings per RFC 4180.
 */
export function generateDisputeCandidatesCsv(candidates: ShipmentResult[]): string {
  const HEADER = 'Tracking #,Service,Dims (LxWxH),Weight (lbs),Zone,Flag type,Actual $,Predicted Low $,Predicted $,Predicted High $,Gap $,Confidence';
  const rows = candidates.map((r) => {
    const flagType = r.dim_anomaly ?? r.cost_anomaly ?? '';
    const dims = `${r.dim_length}x${r.dim_width}x${r.dim_height}`;
    const actual = r.actual_net_charge.toFixed(2);
    const predLow = r.predicted_net_charge_low.toFixed(2);
    const predicted = r.predicted_net_charge.toFixed(2);
    const predHigh = r.predicted_net_charge_high.toFixed(2);
    const gap = (r.actual_net_charge - r.predicted_net_charge_high).toFixed(2);
    const confidence = r.dim_confidence != null ? `${Math.round(r.dim_confidence * 100)}%` : (r.cost_confidence ?? '');
    return [
      csvField(r.tracking_number ?? ''),
      csvField(r.service_type),
      csvField(dims),
      r.weight_lbs,
      csvField(r.zone),
      csvField(flagType),
      actual,
      predLow,
      predicted,
      predHigh,
      gap,
      csvField(confidence),
    ].join(',');
  });
  return [HEADER, ...rows].join('\r\n');
}

/**
 * Trigger a browser file download for the given CSV string.
 * Uses Blob + URL.createObjectURL — no server call required.
 * filename: e.g. "dimrisk-disputes-2024-01.csv"
 */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
