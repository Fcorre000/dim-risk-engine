import type { ShipmentResult } from '../types/api';

export interface KpiData {
  totalShipments: number;
  dimFlaggedCount: number;      // shipments where dim_flag_probability > 0.5
  dimFlaggedPercent: number;    // percentage, 0-100, rounded to 1 decimal
  disputeCandidates: number;    // shipments where dim_anomaly === 'Unexpected'
  estRecoverable: number;       // estimated recoverable dollars
}

export interface ZoneDataPoint {
  zone: string;                 // e.g. "02", "03"
  dimRate: number;              // 0-100 percentage of DIM-flagged in this zone
  count: number;                // total shipments in zone
}

/**
 * Derive a synthetic pricing zone from tracking number.
 * Zone is not in ShipmentResult v1; this gives demo distribution.
 * Last 2 digits of tracking_number mod 8, offset to zones 02-09.
 */
function deriveZone(trackingNumber: string): string {
  const lastTwo = parseInt(trackingNumber.slice(-2), 10);
  const zoneNum = (isNaN(lastTwo) ? 0 : lastTwo % 8) + 2;
  return String(zoneNum).padStart(2, '0');
}

/**
 * Compute KPI summary values from a list of shipment results.
 * Returns zero values for empty array.
 */
export function computeKpis(results: ShipmentResult[]): KpiData {
  if (results.length === 0) {
    return {
      totalShipments: 0,
      dimFlaggedCount: 0,
      dimFlaggedPercent: 0,
      disputeCandidates: 0,
      estRecoverable: 0,
    };
  }

  const totalShipments = results.length;

  // DIM-flagged: model probability > 0.5
  const dimFlaggedCount = results.filter((r) => r.dim_flag_probability > 0.5).length;
  const dimFlaggedPercent = parseFloat(((dimFlaggedCount / totalShipments) * 100).toFixed(1));

  // Dispute candidates: rows where DIM anomaly is Unexpected
  const disputeCandidates = results.filter((r) => r.dim_anomaly === 'Unexpected').length;

  // Estimated recoverable: for Unexpected DIM rows, use 10% of predicted as gap proxy
  // (conservative — real gap = actual - predicted, but actual charge is not in v1 response)
  const estRecoverable = results
    .filter((r) => r.dim_anomaly === 'Unexpected')
    .reduce((sum, r) => sum + r.predicted_net_charge * 0.1, 0);

  return {
    totalShipments,
    dimFlaggedCount,
    dimFlaggedPercent,
    disputeCandidates,
    estRecoverable: parseFloat(estRecoverable.toFixed(2)),
  };
}

/**
 * Compute DIM flag rate per pricing zone.
 * Returns array sorted by dimRate descending (highest anomaly zone first).
 */
export function computeZoneData(results: ShipmentResult[]): ZoneDataPoint[] {
  if (results.length === 0) return [];

  const zoneMap: Record<string, { total: number; dimFlagged: number }> = {};

  for (const r of results) {
    const zone = deriveZone(r.tracking_number);
    if (!zoneMap[zone]) zoneMap[zone] = { total: 0, dimFlagged: 0 };
    zoneMap[zone].total += 1;
    if (r.dim_flag_probability > 0.5) zoneMap[zone].dimFlagged += 1;
  }

  return Object.entries(zoneMap)
    .map(([zone, data]) => ({
      zone,
      dimRate: parseFloat(((data.dimFlagged / data.total) * 100).toFixed(1)),
      count: data.total,
    }))
    .sort((a, b) => b.dimRate - a.dimRate);
}

/**
 * Format dollar values for display.
 * Examples: 1234.56 → "$1,234.56" | 0 → "$0.00"
 */
export function formatDollars(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
