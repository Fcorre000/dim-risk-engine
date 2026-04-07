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

/**
 * Generate a CSV string from an array of dispute candidate shipments.
 * Columns: Tracking #, Flag type, Actual $, Predicted $, Gap $
 * Values are not quoted unless they contain a comma (plain numbers/IDs — safe).
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
    return `"${r.tracking_number}",${r.service_type},${dims},${r.weight_lbs},${r.zone},${flagType},${actual},${predLow},${predicted},${predHigh},${gap},${confidence}`;
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
