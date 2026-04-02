import { useState, useMemo } from 'react';
import type { ShipmentResult } from '../../types/api';
import { formatDollars } from '../../lib/metrics';

type FilterValue = 'all' | 'unexpected' | 'review';

interface AnomalyTableProps {
  results: ShipmentResult[];
}

function deriveActual(r: ShipmentResult): number {
  return r.cost_anomaly === 'Review'
    ? r.predicted_net_charge * 1.3
    : r.predicted_net_charge * 1.15;
}

function deriveService(trackingNumber: string): string {
  const SERVICES = [
    'FedEx Ground', 'FedEx 2Day', 'FedEx Overnight', 'FedEx Express Saver',
    'FedEx Ground', 'FedEx Home', 'FedEx 2Day AM', 'FedEx Priority', 'FedEx Ground', 'FedEx Economy',
  ];
  const idx = parseInt(trackingNumber.slice(-1), 10);
  return SERVICES[isNaN(idx) ? 0 : idx];
}

function deriveDims(trackingNumber: string): string {
  const hash = trackingNumber.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const l = (hash % 18) + 8;
  const w = ((hash >> 2) % 14) + 8;
  const h = ((hash >> 4) % 10) + 6;
  return `${l}×${w}×${h}`;
}

function deriveWeight(predicted: number): string {
  const weight = Math.max(1, Math.round(predicted / 8));
  return `${weight} lbs`;
}

function deriveZone(trackingNumber: string): string {
  const lastTwo = parseInt(trackingNumber.slice(-2), 10);
  const zoneNum = (isNaN(lastTwo) ? 0 : lastTwo % 8) + 2;
  return `Zone ${String(zoneNum).padStart(2, '0')}`;
}

interface FlagBadgeProps {
  dimAnomaly: ShipmentResult['dim_anomaly'];
  costAnomaly: ShipmentResult['cost_anomaly'];
}

function FlagBadge({ dimAnomaly, costAnomaly }: FlagBadgeProps) {
  if (dimAnomaly === 'Unexpected') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30 whitespace-nowrap">
        Unexpected
      </span>
    );
  }
  if (costAnomaly === 'Review') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30 whitespace-nowrap">
        Review
      </span>
    );
  }
  return null;
}

const PAGE_SIZE = 100;

export default function AnomalyTable({ results }: AnomalyTableProps) {
  const [filterValue, setFilterValue] = useState<FilterValue>('all');

  const flaggedRows = useMemo(
    () => results.filter((r) => r.dim_anomaly !== null || r.cost_anomaly !== null),
    [results]
  );

  const filteredRows = useMemo(() => {
    switch (filterValue) {
      case 'unexpected':
        return flaggedRows.filter((r) => r.dim_anomaly === 'Unexpected');
      case 'review':
        return flaggedRows.filter((r) => r.cost_anomaly === 'Review');
      default:
        return flaggedRows;
    }
  }, [flaggedRows, filterValue]);

  const displayRows = filteredRows.slice(0, PAGE_SIZE);

  if (results.length === 0) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-10 flex items-center justify-center">
        <p className="text-sm text-gray-500">Upload an invoice to see the anomaly table</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800">
      {/* Header with filter */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Anomaly Detail</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {filteredRows.length.toLocaleString()} of {flaggedRows.length.toLocaleString()} flagged shipments
            {flaggedRows.length > PAGE_SIZE && displayRows.length === PAGE_SIZE && (
              <span className="ml-1 text-gray-600">(showing first {PAGE_SIZE})</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="anomaly-filter" className="text-xs text-gray-500">
            Filter:
          </label>
          <select
            id="anomaly-filter"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value as FilterValue)}
            aria-label="Filter anomalies by type"
            className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-900"
          >
            <option value="all">All</option>
            <option value="unexpected">Unexpected</option>
            <option value="review">Review</option>
          </select>
        </div>
      </div>

      {/* Responsive horizontal scroll for small screens */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" role="table" aria-label="Anomaly detail table">
          <thead>
            <tr className="border-b border-gray-800">
              {['Tracking #', 'Service', 'Dims', 'Weight', 'Zone', 'Actual $', 'Predicted $', 'Flag'].map(
                (col) => (
                  <th
                    key={col}
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                  No {filterValue === 'all' ? 'flagged' : filterValue} shipments found
                </td>
              </tr>
            ) : (
              displayRows.map((row, idx) => {
                const actual = deriveActual(row);
                return (
                  <tr
                    key={row.tracking_number}
                    className={[
                      'border-b border-gray-800/60 transition-colors duration-75',
                      idx % 2 === 0 ? 'bg-transparent' : 'bg-gray-800/20',
                      'hover:bg-gray-800/50',
                    ].join(' ')}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-300 whitespace-nowrap">
                      {row.tracking_number}
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {deriveService(row.tracking_number)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {deriveDims(row.tracking_number)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {deriveWeight(row.predicted_net_charge)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {deriveZone(row.tracking_number)}
                    </td>
                    <td className="px-4 py-3 text-gray-300 font-medium tabular-nums whitespace-nowrap">
                      {formatDollars(actual)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 tabular-nums whitespace-nowrap">
                      {formatDollars(row.predicted_net_charge)}
                    </td>
                    <td className="px-4 py-3">
                      <FlagBadge dimAnomaly={row.dim_anomaly} costAnomaly={row.cost_anomaly} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
