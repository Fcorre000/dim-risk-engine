import { useState, useMemo } from 'react';
import type { ShipmentResult, UploadState } from '../types/api';
import { formatDollars } from '../lib/metrics';
import CopyButton, { CopyTableButton } from '../components/ui/CopyButton';

interface AnomaliesPageProps {
  uploadState: UploadState;
}

type SortColumn = 'flag' | 'actual' | 'gap' | 'confidence';
type SortDir = 'asc' | 'desc';

function flagOrder(r: ShipmentResult): number {
  if (r.dim_anomaly === 'Unexpected') return 0;
  if (r.cost_anomaly === 'Review') return 1;
  return 2;
}

function confidenceScore(r: ShipmentResult): number {
  if (r.dim_anomaly === 'Unexpected' && r.dim_confidence != null) return r.dim_confidence;
  if (r.cost_anomaly === 'Review') return r.cost_confidence === 'High' ? 1 : 0.5;
  return 0;
}

function FlagBadge({ row }: { row: ShipmentResult }) {
  if (row.dim_anomaly === 'Unexpected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30 whitespace-nowrap">
        Unexpected
        {row.dim_confidence != null && (
          <span className="text-rose-400/70 font-normal">{Math.round(row.dim_confidence * 100)}%</span>
        )}
      </span>
    );
  }
  if (row.cost_anomaly === 'Review') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30 whitespace-nowrap">
        Review
        {row.cost_confidence && (
          <span className="text-amber-400/70 font-normal">&middot; {row.cost_confidence}</span>
        )}
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
  const [sortCol, setSortCol] = useState<SortColumn>('confidence');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedTracking, setSelectedTracking] = useState<string | null>(null);

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
      } else if (sortCol === 'confidence') {
        cmp = confidenceScore(a) - confidenceScore(b);
      } else {
        const gapA = a.actual_net_charge - a.predicted_net_charge_high;
        const gapB = b.actual_net_charge - b.predicted_net_charge_high;
        cmp = gapA - gapB;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [flaggedRows, sortCol, sortDir]);

  const selectedRow = useMemo(
    () => selectedTracking ? sortedRows.find((r) => r.tracking_number === selectedTracking) ?? null : null,
    [selectedTracking, sortedRows],
  );

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
          <span className="ml-2 text-gray-600">Click a row to copy details</span>
        </p>
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-wrap gap-3">
          <p className="text-xs text-gray-500">
            Click <span className="text-gray-400">Flag</span>,{' '}
            <span className="text-gray-400">Actual $</span>,{' '}
            <span className="text-gray-400">Gap $</span>, or{' '}
            <span className="text-gray-400">Confidence</span> headers to sort
          </p>
          <CopyTableButton rows={sortedRows} />
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
                <th scope="col" className={thBase}>Predicted Range</th>
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
                <th
                  scope="col"
                  className={thSortable}
                  onClick={() => handleSort('confidence')}
                  aria-sort={sortCol === 'confidence' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Confidence<SortIcon col="confidence" sortCol={sortCol} sortDir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-500">
                    No flagged shipments found
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, idx) => {
                  const gap = row.actual_net_charge - row.predicted_net_charge_high;
                  const conf = confidenceScore(row);
                  const isSelected = selectedTracking === row.tracking_number;
                  return (
                    <tr
                      key={row.tracking_number}
                      onClick={() => setSelectedTracking(isSelected ? null : row.tracking_number)}
                      className={[
                        'border-b border-gray-800/60 transition-colors duration-75 cursor-pointer',
                        isSelected
                          ? 'bg-blue-500/10 ring-1 ring-inset ring-blue-500/30'
                          : idx % 2 === 0 ? 'bg-transparent' : 'bg-gray-800/20',
                        'hover:bg-gray-800/50',
                      ].join(' ')}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-300 whitespace-nowrap">
                        {row.tracking_number}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {row.service_type}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {row.dim_length}×{row.dim_width}×{row.dim_height}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {row.weight_lbs} lbs
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        Zone {row.zone}
                      </td>
                      <td className="px-4 py-3 text-gray-300 font-medium tabular-nums whitespace-nowrap">
                        {formatDollars(row.actual_net_charge)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 tabular-nums whitespace-nowrap">
                        <span>{formatDollars(row.predicted_net_charge_low)}</span>
                        <span className="text-gray-600 mx-0.5">&ndash;</span>
                        <span>{formatDollars(row.predicted_net_charge_high)}</span>
                      </td>
                      <td className={`px-4 py-3 tabular-nums font-medium whitespace-nowrap ${gap > 0 ? 'text-rose-400' : gap < 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                        {gap >= 0 ? '+' : ''}{formatDollars(gap)}
                      </td>
                      <td className="px-4 py-3">
                        <FlagBadge row={row} />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-400 whitespace-nowrap">
                        {conf > 0 ? `${Math.round(conf * 100)}%` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Selected row copy bar */}
        {selectedRow && (
          <div className="px-6 py-3 border-t border-gray-800 bg-gray-800/40">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-xs text-gray-400">
                Selected: <span className="text-gray-200 font-medium">{selectedRow.tracking_number}</span>
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <CopyButton text={selectedRow.tracking_number} label="Tracking #" />
                <CopyButton text={formatDollars(selectedRow.actual_net_charge)} label="Actual" />
                <CopyButton
                  text={`${formatDollars(selectedRow.predicted_net_charge_low)} – ${formatDollars(selectedRow.predicted_net_charge_high)}`}
                  label="Predicted Range"
                />
                <CopyButton
                  text={`${(selectedRow.actual_net_charge - selectedRow.predicted_net_charge_high) >= 0 ? '+' : ''}${formatDollars(selectedRow.actual_net_charge - selectedRow.predicted_net_charge_high)}`}
                  label="Gap"
                />
                <CopyButton
                  text={`${selectedRow.tracking_number}\t${selectedRow.service_type}\t${formatDollars(selectedRow.actual_net_charge)}\t${formatDollars(selectedRow.predicted_net_charge_low)} – ${formatDollars(selectedRow.predicted_net_charge_high)}\t${selectedRow.dim_anomaly ?? selectedRow.cost_anomaly ?? 'Normal'}`}
                  label="Full Row"
                />
                <button
                  type="button"
                  onClick={() => setSelectedTracking(null)}
                  className="ml-1 p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
                  aria-label="Dismiss"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
