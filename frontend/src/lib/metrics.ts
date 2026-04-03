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

  // Recoverable: for Unexpected DIM rows, gap = actual billed - model predicted
  const estRecoverable = results
    .filter((r) => r.dim_anomaly === 'Unexpected')
    .reduce((sum, r) => sum + Math.max(0, r.actual_net_charge - r.predicted_net_charge), 0);

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

export interface MonthlyDataPoint {
  month: string;      // "M1" .. "M6"
  actual: number;     // sum of actual_net_charge from invoice
  predicted: number;  // sum of predicted_net_charge from model
  gap: number;        // actual - predicted
}

/**
 * Derive a month bucket (M1-M6) from tracking number.
 * Third-to-last and second-to-last digits mod 6 → month index.
 * (Invoice date not in API response — synthetic bucketing for demo.)
 */
function deriveMonth(trackingNumber: string): string {
  const slice = parseInt(trackingNumber.slice(-3, -1), 10);
  const idx = (isNaN(slice) ? 0 : slice % 6) + 1;
  return `M${idx}`;
}

/**
 * Aggregate shipment results into 6 monthly actual vs predicted buckets.
 * Uses real actual_net_charge from invoice. Returns M1..M6 array.
 */
export function computeMonthlyData(results: ShipmentResult[]): MonthlyDataPoint[] {
  const MONTHS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'];
  const buckets: Record<string, { actual: number; predicted: number }> = {};
  for (const m of MONTHS) buckets[m] = { actual: 0, predicted: 0 };

  for (const r of results) {
    const month = deriveMonth(r.tracking_number);
    if (!buckets[month]) buckets[month] = { actual: 0, predicted: 0 };
    buckets[month].actual += r.actual_net_charge;
    buckets[month].predicted += r.predicted_net_charge;
  }

  return MONTHS.map((m) => ({
    month: m,
    actual: parseFloat(buckets[m].actual.toFixed(2)),
    predicted: parseFloat(buckets[m].predicted.toFixed(2)),
    gap: parseFloat((buckets[m].actual - buckets[m].predicted).toFixed(2)),
  }));
}

export interface ZoneDetailPoint {
  zone: string;
  dimRate: number;
  count: number;
  actualTotal: number;
  predictedTotal: number;
  gapTotal: number;
  unexpected: number;
}

/**
 * Compute per-zone statistics including actual/predicted totals and gap.
 * Extends computeZoneData with financial summary per zone.
 * Returns array sorted by gapTotal descending (highest overcharge zone first).
 */
export function computeZoneDetails(results: ShipmentResult[]): ZoneDetailPoint[] {
  if (results.length === 0) return [];

  const zoneMap: Record<string, {
    total: number;
    dimFlagged: number;
    actual: number;
    predicted: number;
    unexpected: number;
  }> = {};

  for (const r of results) {
    const lastTwo = parseInt(r.tracking_number.slice(-2), 10);
    const zoneNum = (isNaN(lastTwo) ? 0 : lastTwo % 8) + 2;
    const zone = String(zoneNum).padStart(2, '0');

    if (!zoneMap[zone]) {
      zoneMap[zone] = { total: 0, dimFlagged: 0, actual: 0, predicted: 0, unexpected: 0 };
    }
    zoneMap[zone].total += 1;
    if (r.dim_flag_probability > 0.5) zoneMap[zone].dimFlagged += 1;
    zoneMap[zone].actual += r.actual_net_charge;
    zoneMap[zone].predicted += r.predicted_net_charge;
    if (r.dim_anomaly === 'Unexpected') zoneMap[zone].unexpected += 1;
  }

  return Object.entries(zoneMap)
    .map(([zone, d]) => ({
      zone,
      dimRate: parseFloat(((d.dimFlagged / d.total) * 100).toFixed(1)),
      count: d.total,
      actualTotal: parseFloat(d.actual.toFixed(2)),
      predictedTotal: parseFloat(d.predicted.toFixed(2)),
      gapTotal: parseFloat((d.actual - d.predicted).toFixed(2)),
      unexpected: d.unexpected,
    }))
    .sort((a, b) => b.gapTotal - a.gapTotal);
}

const SKU_SERVICES = [
  'FedEx Ground', 'FedEx 2Day', 'FedEx Overnight', 'FedEx Express Saver',
  'FedEx Ground', 'FedEx Home', 'FedEx 2Day AM', 'FedEx Priority', 'FedEx Ground', 'FedEx Economy',
];

function deriveServiceFromTracking(trackingNumber: string): string {
  const idx = parseInt(trackingNumber.slice(-1), 10);
  return SKU_SERVICES[isNaN(idx) ? 0 : idx];
}

export interface SkuDataPoint {
  service: string;
  count: number;
  dimFlagged: number;
  unexpected: number;
  review: number;
  actualTotal: number;
  gapTotal: number;
}

/**
 * Aggregate shipment results by FedEx service type (SKU).
 * Service type derived from last digit of tracking number.
 * Returns array sorted by gapTotal descending.
 */
export function computeSkuData(results: ShipmentResult[]): SkuDataPoint[] {
  if (results.length === 0) return [];

  const skuMap: Record<string, {
    count: number;
    dimFlagged: number;
    unexpected: number;
    review: number;
    actual: number;
    gap: number;
  }> = {};

  for (const r of results) {
    const service = deriveServiceFromTracking(r.tracking_number);
    if (!skuMap[service]) {
      skuMap[service] = { count: 0, dimFlagged: 0, unexpected: 0, review: 0, actual: 0, gap: 0 };
    }
    skuMap[service].count += 1;
    if (r.dim_flag_probability > 0.5) skuMap[service].dimFlagged += 1;
    if (r.dim_anomaly === 'Unexpected') skuMap[service].unexpected += 1;
    if (r.cost_anomaly === 'Review') skuMap[service].review += 1;
    skuMap[service].actual += r.actual_net_charge;
    skuMap[service].gap += r.actual_net_charge - r.predicted_net_charge;
  }

  return Object.entries(skuMap)
    .map(([service, d]) => ({
      service,
      count: d.count,
      dimFlagged: d.dimFlagged,
      unexpected: d.unexpected,
      review: d.review,
      actualTotal: parseFloat(d.actual.toFixed(2)),
      gapTotal: parseFloat(d.gap.toFixed(2)),
    }))
    .sort((a, b) => b.gapTotal - a.gapTotal);
}
