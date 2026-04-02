export interface ShipmentResult {
  tracking_number: string;
  dim_flag_probability: number;   // 0.0 to 1.0
  predicted_net_charge: number;   // dollars
  dim_anomaly: 'Unexpected' | null;
  cost_anomaly: 'Review' | null;
}

export type PageId = 'overview' | 'anomalies' | 'by-zone' | 'by-sku' | 'trends' | 'export';

export interface UploadState {
  status: 'idle' | 'uploading' | 'complete' | 'error';
  filename: string | null;
  shipmentCount: number | null;
  analysisTimeMs: number | null;
  results: ShipmentResult[] | null;
  errorMessage: string | null;
}
