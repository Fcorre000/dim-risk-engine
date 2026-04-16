export interface ShipmentResult {
  row_index: number;                // globally unique per-upload id (stable React key)
  tracking_number: string | null;   // can be null when FedEx export omits the column
  service_type: string;             // e.g. "FO", "SG", "PO"
  weight_lbs: number;               // Original Weight (Pounds)
  dim_length: number;               // Dimmed Length (cm)
  dim_width: number;                // Dimmed Width (cm)
  dim_height: number;               // Dimmed Height (cm)
  zone: string;                     // Pricing Zone, normalized ("02", "Other")
  shipment_date: string | null;     // "YYYY-MM-DD" or null if not in source
  recipient_state: string | null;   // US state code, e.g. "CA", "TX" — null if not in source
  dim_flag_probability: number;     // 0.0 to 1.0
  actual_net_charge: number;        // dollars, from invoice
  predicted_net_charge: number;     // dollars, model output
  predicted_net_charge_low: number;  // 5th percentile lower bound (dollars)
  predicted_net_charge_high: number; // 95th percentile upper bound (dollars)
  dim_anomaly: 'Unexpected' | null;
  dim_confidence: number | null;     // P(DIM=N) when Unexpected, else null
  cost_anomaly: 'Review' | null;
  cost_confidence: 'Low' | 'Medium' | 'High' | 'Critical' | null;  // graded by overage/CI-width
}

export type PageId = 'overview' | 'anomalies' | 'by-zone' | 'by-state' | 'trends' | 'export';

export interface StreamingKpis {
  dimFlaggedCount: number;
  disputeCandidates: number;
  estRecoverable: number;
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
