import { useState, useMemo, useEffect } from 'react';
import type { ShipmentResult, UploadState } from '../types/api';
import { formatDollars } from '../lib/metrics';
import CopyButton, { CopyTableButton } from '../components/ui/CopyButton';

interface AnomaliesPageProps {
  uploadState: UploadState;
}

type SortColumn = 'flag' | 'actual' | 'gap' | 'confidence';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

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
  // Selection is by row_index (not tracking_number) because tracking can be null/duplicate
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>(100);
  const [page, setPage] = useState(1);

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

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));

  // Clamp page when underlying data shrinks (filter, new upload) or page size grows
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Reset to first page when sort changes so users see top of new ordering
  useEffect(() => {
    setPage(1);
  }, [sortCol, sortDir, pageSize]);

  const pageStart = (page - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, sortedRows.length);
  const pagedRows = useMemo(
    () => sortedRows.slice(pageStart, pageEnd),
    [sortedRows, pageStart, pageEnd],
  );

  // Selection persists across pages — look up in full sorted list by row_index
  const selectedRow = useMemo(
    () => selectedRowIndex != null ? sortedRows.find((r) => r.row_index === selectedRowIndex) ?? null : null,
    [selectedRowIndex, sortedRows],
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
          <div className="flex items-center gap-3">
            <label htmlFor="page-size" className="text-xs text-gray-500">
              Rows per page:
            </label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
              aria-label="Rows per page"
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-900"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <CopyTableButton rows={sortedRows} />
          </div>
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
                pagedRows.map((row, idx) => {
                  const gap = row.actual_net_charge - row.predicted_net_charge_high;
                  const conf = confidenceScore(row);
                  const isSelected = selectedRowIndex === row.row_index;
                  return (
                    <tr
                      key={row.row_index}
                      onClick={() => setSelectedRowIndex(isSelected ? null : row.row_index)}
                      className={[
                        'border-b border-gray-800/60 transition-colors duration-75 cursor-pointer',
                        isSelected
                          ? 'bg-blue-500/10 ring-1 ring-inset ring-blue-500/30'
                          : idx % 2 === 0 ? 'bg-transparent' : 'bg-gray-800/20',
                        'hover:bg-gray-800/50',
                      ].join(' ')}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-300 whitespace-nowrap">
                        {row.tracking_number ?? <span className="text-gray-600 italic">no tracking #</span>}
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

        {/* Pagination footer */}
        {sortedRows.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-800 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-gray-500 tabular-nums">
              Showing <span className="text-gray-300">{(pageStart + 1).toLocaleString()}</span>
              {'–'}
              <span className="text-gray-300">{pageEnd.toLocaleString()}</span>
              {' of '}
              <span className="text-gray-300">{sortedRows.length.toLocaleString()}</span>
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={page === 1}
                aria-label="First page"
                className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 disabled:cursor-not-allowed"
              >
                «
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
                className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 disabled:cursor-not-allowed"
              >
                ‹ Prev
              </button>
              <span className="px-3 py-1 text-xs text-gray-400 tabular-nums">
                Page <span className="text-gray-200 font-medium">{page}</span> of {totalPages.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 disabled:cursor-not-allowed"
              >
                Next ›
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                aria-label="Last page"
                className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 disabled:cursor-not-allowed"
              >
                »
              </button>
            </div>
          </div>
        )}

        {/* Selected row copy bar */}
        {selectedRow && (
          <div className="px-6 py-3 border-t border-gray-800 bg-gray-800/40">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-xs text-gray-400">
                Selected: <span className="text-gray-200 font-medium">{selectedRow.tracking_number ?? `row #${selectedRow.row_index}`}</span>
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <CopyButton text={selectedRow.tracking_number ?? ''} label="Tracking #" />
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
                  text={`${selectedRow.tracking_number ?? ''}\t${selectedRow.service_type}\t${formatDollars(selectedRow.actual_net_charge)}\t${formatDollars(selectedRow.predicted_net_charge_low)} – ${formatDollars(selectedRow.predicted_net_charge_high)}\t${selectedRow.dim_anomaly ?? selectedRow.cost_anomaly ?? 'Normal'}`}
                  label="Full Row"
                />
                <button
                  type="button"
                  onClick={() => setSelectedRowIndex(null)}
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
