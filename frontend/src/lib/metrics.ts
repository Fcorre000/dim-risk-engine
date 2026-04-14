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

  // Recoverable: for Unexpected DIM rows, gap = actual billed - upper prediction bound
  // Using predicted_net_charge_high gives a more conservative (credible) estimate
  const estRecoverable = results
    .filter((r) => r.dim_anomaly === 'Unexpected')
    .reduce((sum, r) => sum + Math.max(0, r.actual_net_charge - r.predicted_net_charge_high), 0);

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
    const zone = r.zone;
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
  month: string;      // "Jan 2022", "Feb 2022", etc. (or "Unknown" if no date)
  actual: number;     // sum of actual_net_charge from invoice
  predicted: number;  // sum of predicted_net_charge from model
  gap: number;        // actual - predicted
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Derive a month key from shipment_date ("YYYY-MM-DD" → "May 2022").
 * Returns null if date is missing or unparseable.
 */
function getMonthKey(shipmentDate: string | null): string | null {
  if (!shipmentDate) return null;
  const d = new Date(shipmentDate + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Sort key for month labels like "May 2022" → numeric for chronological ordering.
 */
function monthSortKey(label: string): number {
  const parts = label.split(' ');
  if (parts.length !== 2) return 0;
  const monthIdx = MONTH_NAMES.indexOf(parts[0]);
  const year = parseInt(parts[1], 10);
  return year * 12 + (monthIdx >= 0 ? monthIdx : 0);
}

/**
 * Aggregate shipment results into monthly actual vs predicted buckets.
 * Uses real shipment_date when available. Results sorted chronologically.
 */
export function computeMonthlyData(results: ShipmentResult[]): MonthlyDataPoint[] {
  const buckets: Record<string, { actual: number; predicted: number }> = {};

  for (const r of results) {
    const month = getMonthKey(r.shipment_date) ?? 'Unknown';
    if (!buckets[month]) buckets[month] = { actual: 0, predicted: 0 };
    buckets[month].actual += r.actual_net_charge;
    buckets[month].predicted += r.predicted_net_charge;
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return monthSortKey(a) - monthSortKey(b);
    })
    .map(([month, data]) => ({
      month,
      actual: parseFloat(data.actual.toFixed(2)),
      predicted: parseFloat(data.predicted.toFixed(2)),
      gap: parseFloat((data.actual - data.predicted).toFixed(2)),
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
    const zone = r.zone;

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
    const service = r.service_type;
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

export interface TrendsDataPoint {
  month: string;              // "May 2022", "Jun 2022", etc.
  actual: number;             // sum of actual_net_charge for this month bucket
  predicted: number;          // sum of predicted_net_charge for this month bucket
  gap: number;                // actual - predicted (positive = overcharge)
  disputeCount: number;       // count of rows where dim_anomaly === 'Unexpected' in this bucket
  cumulativeDisputes: number; // running total of dispute candidates up to and including this month
}

/**
 * Aggregate shipment results into monthly trend buckets using real shipment dates.
 * Each point adds cumulativeDisputes — the running sum of dispute candidates month over month.
 * Returns array sorted chronologically.
 */
export function computeTrendsData(results: ShipmentResult[]): TrendsDataPoint[] {
  const buckets: Record<string, { actual: number; predicted: number; disputes: number }> = {};

  for (const r of results) {
    const month = getMonthKey(r.shipment_date) ?? 'Unknown';
    if (!buckets[month]) buckets[month] = { actual: 0, predicted: 0, disputes: 0 };
    buckets[month].actual += r.actual_net_charge;
    buckets[month].predicted += r.predicted_net_charge;
    if (r.dim_anomaly === 'Unexpected') buckets[month].disputes += 1;
  }

  const sorted = Object.entries(buckets).sort(([a], [b]) => {
    if (a === 'Unknown') return 1;
    if (b === 'Unknown') return -1;
    return monthSortKey(a) - monthSortKey(b);
  });

  let cumulative = 0;
  return sorted.map(([month, b]) => {
    const actual = parseFloat(b.actual.toFixed(2));
    const predicted = parseFloat(b.predicted.toFixed(2));
    const gap = parseFloat((b.actual - b.predicted).toFixed(2));
    cumulative += b.disputes;
    return { month, actual, predicted, gap, disputeCount: b.disputes, cumulativeDisputes: cumulative };
  });
}

export type TrendsGranularity = 'day' | 'week';

/**
 * Compact day label from "YYYY-MM-DD" → "Apr 14".
 */
function getDayKey(shipmentDate: string | null): string | null {
  if (!shipmentDate) return null;
  const d = new Date(shipmentDate + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Week label from date → "Apr 8–14" (Monday-start weeks).
 * Handles month boundaries like "Apr 28–May 4".
 */
function getWeekKey(shipmentDate: string | null): string | null {
  if (!shipmentDate) return null;
  const d = new Date(shipmentDate + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  // Floor to Monday
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0 offset
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startLabel = `${MONTH_NAMES[monday.getMonth()]} ${monday.getDate()}`;
  if (monday.getMonth() === sunday.getMonth()) {
    return `${startLabel}–${sunday.getDate()}`;
  }
  return `${startLabel}–${MONTH_NAMES[sunday.getMonth()]} ${sunday.getDate()}`;
}

/**
 * Sort key for a date string "YYYY-MM-DD" → numeric timestamp.
 */
function dateSortKey(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? Infinity : d.getTime();
}

/**
 * Aggregate shipment results into daily or weekly trend buckets.
 * Same output shape as computeTrendsData — reuses TrendsDataPoint.month for period label.
 */
export function computeGranularTrendsData(
  results: ShipmentResult[],
  granularity: TrendsGranularity,
): TrendsDataPoint[] {
  const keyFn = granularity === 'day' ? getDayKey : getWeekKey;

  // Use a sortable raw date as map key, store display label alongside
  const buckets: Record<string, {
    label: string;
    sortDate: string;
    actual: number;
    predicted: number;
    disputes: number;
  }> = {};

  for (const r of results) {
    const label = keyFn(r.shipment_date) ?? 'Unknown';
    const rawDate = r.shipment_date ?? '9999-99-99';

    // For weeks, use the Monday as sort key
    let sortDate = rawDate;
    if (granularity === 'week' && r.shipment_date) {
      const d = new Date(r.shipment_date + 'T00:00:00');
      const day = d.getDay();
      const diff = day === 0 ? 6 : day - 1;
      d.setDate(d.getDate() - diff);
      sortDate = d.toISOString().slice(0, 10);
    }

    const key = label;
    if (!buckets[key]) {
      buckets[key] = { label, sortDate, actual: 0, predicted: 0, disputes: 0 };
    }
    buckets[key].actual += r.actual_net_charge;
    buckets[key].predicted += r.predicted_net_charge;
    if (r.dim_anomaly === 'Unexpected') buckets[key].disputes += 1;
  }

  const sorted = Object.values(buckets).sort((a, b) => {
    if (a.label === 'Unknown') return 1;
    if (b.label === 'Unknown') return -1;
    return dateSortKey(a.sortDate) - dateSortKey(b.sortDate);
  });

  let cumulative = 0;
  return sorted.map((b) => {
    const actual = parseFloat(b.actual.toFixed(2));
    const predicted = parseFloat(b.predicted.toFixed(2));
    const gap = parseFloat((b.actual - b.predicted).toFixed(2));
    cumulative += b.disputes;
    return {
      month: b.label,
      actual,
      predicted,
      gap,
      disputeCount: b.disputes,
      cumulativeDisputes: cumulative,
    };
  });
}
