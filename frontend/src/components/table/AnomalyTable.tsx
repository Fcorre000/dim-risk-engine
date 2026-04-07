import { useState, useMemo, useRef, useEffect } from 'react';
import type { ShipmentResult } from '../../types/api';
import { formatDollars } from '../../lib/metrics';

type FilterValue = 'all' | 'unexpected' | 'review';

interface AnomalyTableProps {
  results: ShipmentResult[];
}


interface FlagBadgeProps {
  dimAnomaly: ShipmentResult['dim_anomaly'];
  costAnomaly: ShipmentResult['cost_anomaly'];
}

interface FlagBadgeExtProps extends FlagBadgeProps {
  dimConfidence: number | null;
  costConfidence: string | null;
}

function FlagBadge({ dimAnomaly, costAnomaly, dimConfidence, costConfidence }: FlagBadgeExtProps) {
  if (dimAnomaly === 'Unexpected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30 whitespace-nowrap">
        Unexpected
        {dimConfidence != null && (
          <span className="text-rose-400/70 font-normal">{Math.round(dimConfidence * 100)}%</span>
        )}
      </span>
    );
  }
  if (costAnomaly === 'Review') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30 whitespace-nowrap">
        Review
        {costConfidence && (
          <span className="text-amber-400/70 font-normal">&middot; {costConfidence}</span>
        )}
      </span>
    );
  }
  return null;
}

function FlagInfoPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label="Explain flag types"
        onClick={() => setOpen((v) => !v)}
        className="w-5 h-5 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-7 z-50 w-72 rounded-xl bg-gray-800 border border-gray-700 shadow-xl p-4 text-xs"
        >
          <p className="text-gray-300 font-semibold mb-3">Flag types explained</p>

          <div className="mb-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30 mb-1.5">
              Unexpected 87%
            </span>
            <p className="text-gray-400 leading-relaxed">
              The model predicted FedEx would <em>not</em> apply DIM billing, but they charged DIM anyway.
              The percentage shows how confident the model is — higher % = stronger dispute case.
            </p>
          </div>

          <div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30 mb-1.5">
              Review &middot; High
            </span>
            <p className="text-gray-400 leading-relaxed">
              The actual charge exceeded the model's 90% prediction interval upper bound.
              The predicted range shows the expected cost window — charges above it warrant investigation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
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
          <FlagInfoPopover />
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
              {['Tracking #', 'Service', 'Dims', 'Weight', 'Zone', 'Actual $', 'Predicted Range', 'Flag'].map(
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
              displayRows.map((row, idx) => (
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
                    <td className="px-4 py-3">
                      <FlagBadge dimAnomaly={row.dim_anomaly} costAnomaly={row.cost_anomaly} dimConfidence={row.dim_confidence} costConfidence={row.cost_confidence} />
                    </td>
                  </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
