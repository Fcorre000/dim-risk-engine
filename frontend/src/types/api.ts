export type ReviewPriority = 'high' | 'medium' | 'low';

export interface ShipmentResult {
  // Display fields (echoed straight from the invoice)
  row_index: number;                // globally unique per-upload id (stable React key)
  tracking_number: string | null;   // can be null when FedEx export omits the column
  service_type: string;             // e.g. "Ground", "FO", "SG"
  weight_lbs: number;               // Original Weight (Pounds)
  dim_length: number;               // Dimmed Length (cm)
  dim_width: number;                // Dimmed Width (cm)
  dim_height: number;               // Dimmed Height (cm)
  zone: string;                     // Pricing Zone, normalized ("02", "Other")
  shipment_date: string | null;     // "YYYY-MM-DD" or null if not in source
  recipient_state: string | null;   // US state code, e.g. "CA", "TX" — null if not in source

  // v2 contract — see docs/api_contract.md
  dim_probability: number;                       // calibrated P(DIM flagged), 0.0–1.0
  dim_disagrees_with_fedex: boolean | null;      // null when ground truth absent
  actual_net_charge: number;                     // dollars, from invoice
  charge_predicted: number;                      // conformal point prediction (USD)
  charge_lower_95: number;                       // lower bound of 95% prediction interval
  charge_upper_95: number;                       // upper bound of 95% prediction interval
  charge_outside_interval: boolean | null;       // null when ground truth absent
  anomaly_score: number | null;                  // IF + AE fused percentile rank, 0.0–1.0
  anomaly_flagged: boolean | null;               // true iff anomaly_score >= calibrated threshold
  review_recommended: boolean;                   // true if any of the three audit signals fired
  review_priority: ReviewPriority;               // 'high' | 'medium' | 'low'
}

export type PageId = 'overview' | 'anomalies' | 'by-zone' | 'by-state' | 'trends' | 'export';

export interface StreamingKpis {
  dimFlaggedCount: number;        // count of rows where dim_disagrees_with_fedex === true
  disputeCandidates: number;      // count of rows where review_priority === 'high'
  estRecoverable: number;         // sum of max(0, actual_net_charge - charge_upper_95) over flagged rows
}

export interface UploadState {
  status: 'idle' | 'uploading' | 'complete' | 'error';
  filename: string | null;
  shipmentCount: number | null;
  totalCount: number | null;   // from __meta__.total — null for XLSX or unknown
  analysisTimeMs: number | null;
  results: ShipmentResult[] | null;
  errorMessage: string | null;
  streamingKpis: StreamingKpis | null;  // incremental KPIs updated during streaming
}
