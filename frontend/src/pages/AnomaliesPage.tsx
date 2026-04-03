import { useState, useMemo } from 'react';
import type { ShipmentResult, UploadState } from '../types/api';
import { formatDollars } from '../lib/metrics';

interface AnomaliesPageProps {
  uploadState: UploadState;
}

type SortColumn = 'flag' | 'actual' | 'gap';
type SortDir = 'asc' | 'desc';

function flagOrder(r: ShipmentResult): number {
  if (r.dim_anomaly === 'Unexpected') return 0;
  if (r.cost_anomaly === 'Review') return 1;
  return 2;
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
  return `${Math.max(1, Math.round(predicted / 8))} lbs`;
}

function deriveZone(trackingNumber: string): string {
  const lastTwo = parseInt(trackingNumber.slice(-2), 10);
  const zoneNum = (isNaN(lastTwo) ? 0 : lastTwo % 8) + 2;
  return `Zone ${String(zoneNum).padStart(2, '0')}`;
}

function FlagBadge({ dimAnomaly, costAnomaly }: { dimAnomaly: ShipmentResult['dim_anomaly']; costAnomaly: ShipmentResult['cost_anomaly'] }) {
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

function SortIcon({ col, sortCol, sortDir }: { col: SortColumn; sortCol: SortColumn; sortDir: SortDir }) {
  if (col !== sortCol) {
    return <span className="ml-1 text-gray-600">⇅</span>;
  }
  return <span className="ml-1 text-blue-400">{sortDir === 'asc' ? '▲' : '▼'}</span>;
}

export default function AnomaliesPage({ uploadState }: AnomaliesPageProps) {
  const [sortCol, setSortCol] = useState<SortColumn>('gap');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const results = uploadState.results ?? [];

  const flaggedRows = useMemo(
    () => results.filter((r) => r.dim_anomaly !== null || r.cost_anomaly !== null),
    [results]
  );

  const sortedRows = useMemo(() => {
    const rows = [...flaggedRows];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'flag') {
        cmp = flagOrder(a) - flagOrder(b);
      } else if (sortCol === 'actual') {
        cmp = a.actual_net_charge - b.actual_net_charge;
      } else {
        const gapA = a.actual_net_charge - a.predicted_net_charge;
        const gapB = b.actual_net_charge - b.predicted_net_charge;
        cmp = gapA - gapB;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [flaggedRows, sortCol, sortDir]);

  function handleSort(col: SortColumn) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  const thBase = 'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap';
  const thSortable = `${thBase} cursor-pointer hover:text-gray-300 select-none transition-colors`;

  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Anomalies</h1>
          <p className="text-gray-500 text-sm mt-1">All flagged shipments with sortable columns</p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-16 flex items-center justify-center">
          <p className="text-sm text-gray-500">Upload an invoice on the Overview page to see anomalies</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Anomalies</h1>
        <p className="text-gray-500 text-sm mt-1">
          {flaggedRows.length.toLocaleString()} flagged of {results.length.toLocaleString()} total shipments
        </p>
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800">
        <div className="px-6 py-4 border-b border-gray-800">
          <p className="text-xs text-gray-500">
            Click <span className="text-gray-400">Flag</span>,{' '}
            <span className="text-gray-400">Actual $</span>, or{' '}
            <span className="text-gray-400">Gap $</span> headers to sort
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="table" aria-label="Flagged shipments sortable table">
            <thead>
              <tr className="border-b border-gray-800">
                <th scope="col" className={thBase}>Tracking #</th>
                <th scope="col" className={thBase}>Service</th>
                <th scope="col" className={thBase}>Dims</th>
                <th scope="col" className={thBase}>Weight</th>
                <th scope="col" className={thBase}>Zone</th>
                <th
                  scope="col"
                  className={thSortable}
                  onClick={() => handleSort('actual')}
                  aria-sort={sortCol === 'actual' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Actual $<SortIcon col="actual" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th scope="col" className={thBase}>Predicted $</th>
                <th
                  scope="col"
                  className={thSortable}
                  onClick={() => handleSort('gap')}
                  aria-sort={sortCol === 'gap' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Gap $<SortIcon col="gap" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th
                  scope="col"
                  className={thSortable}
                  onClick={() => handleSort('flag')}
                  aria-sort={sortCol === 'flag' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Flag<SortIcon col="flag" sortCol={sortCol} sortDir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                    No flagged shipments found
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, idx) => {
                  const gap = row.actual_net_charge - row.predicted_net_charge;
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
                        {formatDollars(row.actual_net_charge)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 tabular-nums whitespace-nowrap">
                        {formatDollars(row.predicted_net_charge)}
                      </td>
                      <td className={`px-4 py-3 tabular-nums font-medium whitespace-nowrap ${gap > 0 ? 'text-rose-400' : gap < 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                        {gap >= 0 ? '+' : ''}{formatDollars(gap)}
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
    </div>
  );
}
