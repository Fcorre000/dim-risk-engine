import { useState, useMemo, useEffect } from 'react';
import type { ShipmentResult, UploadState } from '../types/api';
import { formatDollars } from '../lib/metrics';
import { escapeFormula } from '../lib/export';
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

function FlagCell({ row }: { row: ShipmentResult }) {
  if (row.dim_anomaly === 'Unexpected') {
    return (
      <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--crit)' }}>
        ▲ UNEXPECTED
        {row.dim_confidence != null && (
          <span className="ml-1 opacity-70">{Math.round(row.dim_confidence * 100)}%</span>
        )}
      </span>
    );
  }
  if (row.cost_anomaly === 'Review') {
    return (
      <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--warn)' }}>
        ■ REVIEW
        {row.cost_confidence && <span className="ml-1 opacity-70">· {row.cost_confidence}</span>}
      </span>
    );
  }
  return <span style={{ color: 'var(--muted)' }}>· OK</span>;
}

function SortMark({ col, sortCol, sortDir }: { col: SortColumn; sortCol: SortColumn; sortDir: SortDir }) {
  if (col !== sortCol) {
    return <span className="ml-1 opacity-50">⇅</span>;
  }
  return (
    <span className="ml-1" style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>
      {sortDir === 'asc' ? '▲' : '▼'}
    </span>
  );
}

const pagerBtn =
  'px-2 py-1 text-[10px] tracking-widest uppercase cursor-pointer transition-colors duration-150 border';

export default function AnomaliesPage({ uploadState }: AnomaliesPageProps) {
  const [sortCol, setSortCol] = useState<SortColumn>('confidence');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
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

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [sortCol, sortDir, pageSize]);

  const pageStart = (page - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, sortedRows.length);
  const pagedRows = useMemo(
    () => sortedRows.slice(pageStart, pageEnd),
    [sortedRows, pageStart, pageEnd],
  );

  const selectedRow = useMemo(
    () => (selectedRowIndex != null ? sortedRows.find((r) => r.row_index === selectedRowIndex) ?? null : null),
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

  if (results.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: 'var(--muted)' }}>
          &gt; 01 ANOMALIES · DISPUTE_QUEUE.ALL
        </h1>
        <section className="border" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <div className="p-10 text-center text-[11px] tracking-widest" style={{ color: 'var(--muted)' }}>
            NO SIGNAL — INGEST AN INVOICE ON 00 OVERVIEW
          </div>
        </section>
      </div>
    );
  }

  const thBase = 'px-4 py-2 text-left tracking-widest whitespace-nowrap';
  const thSortable = `${thBase} cursor-pointer select-none`;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: 'var(--muted)' }}>
          &gt; 01 ANOMALIES · DISPUTE_QUEUE.ALL
        </h1>
        <p className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          {flaggedRows.length.toLocaleString()} / {results.length.toLocaleString()} FLAGGED · CLICK ROW TO COPY
        </p>
      </div>

      <section className="border" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
        {/* Toolbar */}
        <div
          className="px-4 py-2 border-b flex items-center justify-between gap-3 flex-wrap text-[10px] tracking-widest"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <span>&gt; TBL.01 · DISPUTE_QUEUE.ALL</span>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="hidden sm:inline">
              SORT BY <span style={{ color: 'var(--text)' }}>{sortCol.toUpperCase()}</span>{' '}
              <span style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
            </span>
            <label htmlFor="page-size" className="tracking-widest">ROWS</label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
              aria-label="Rows per page"
              className="border px-2 py-1 text-[10px] tracking-widest uppercase cursor-pointer"
              style={{ background: 'var(--panel)', borderColor: 'var(--border-2)', color: 'var(--text)' }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <CopyTableButton rows={sortedRows} />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] font-jb" role="table" aria-label="Flagged shipments sortable table">
            <thead>
              <tr className="border-b text-[9px]" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                <th scope="col" className={thBase}>SHIPMENT_ID</th>
                <th scope="col" className={thBase}>SVC</th>
                <th scope="col" className={thBase}>DIMS</th>
                <th scope="col" className={`${thBase} text-right`}>LB</th>
                <th scope="col" className={thBase}>Z</th>
                <th
                  scope="col"
                  className={`${thSortable} text-right`}
                  onClick={() => handleSort('actual')}
                  aria-sort={sortCol === 'actual' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  ACT<SortMark col="actual" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th scope="col" className={`${thBase} text-right`}>PRED</th>
                <th
                  scope="col"
                  className={`${thSortable} text-right`}
                  onClick={() => handleSort('gap')}
                  aria-sort={sortCol === 'gap' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  RESID<SortMark col="gap" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th
                  scope="col"
                  className={thSortable}
                  onClick={() => handleSort('flag')}
                  aria-sort={sortCol === 'flag' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  FLAG<SortMark col="flag" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th
                  scope="col"
                  className={`${thSortable} text-right`}
                  onClick={() => handleSort('confidence')}
                  aria-sort={sortCol === 'confidence' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  CONF<SortMark col="confidence" sortCol={sortCol} sortDir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-[11px] tracking-widest" style={{ color: 'var(--muted)' }}>
                    NO FLAGGED SHIPMENTS
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => {
                  const gap = row.actual_net_charge - row.predicted_net_charge_high;
                  const conf = confidenceScore(row);
                  const isSelected = selectedRowIndex === row.row_index;
                  return (
                    <tr
                      key={row.row_index}
                      onClick={() => setSelectedRowIndex(isSelected ? null : row.row_index)}
                      className="border-b cursor-pointer transition-colors duration-150"
                      style={{
                        borderColor: 'var(--border)',
                        background: isSelected ? 'var(--row-hov)' : 'transparent',
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--row-hov)'; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td className="px-4 py-1.5 tabular-nums">
                        {row.tracking_number ?? <span className="italic opacity-60">no tracking #</span>}
                      </td>
                      <td className="px-4 py-1.5" style={{ color: 'var(--muted)' }}>{row.service_type}</td>
                      <td className="px-4 py-1.5 tabular-nums" style={{ color: 'var(--muted)' }}>
                        {row.dim_length}×{row.dim_width}×{row.dim_height}
                      </td>
                      <td className="px-4 py-1.5 tabular-nums text-right" style={{ color: 'var(--muted)' }}>
                        {row.weight_lbs}
                      </td>
                      <td className="px-4 py-1.5" style={{ color: 'var(--muted)' }}>{row.zone}</td>
                      <td className="px-4 py-1.5 tabular-nums text-right">
                        {formatDollars(row.actual_net_charge)}
                      </td>
                      <td className="px-4 py-1.5 tabular-nums text-right" style={{ color: 'var(--muted)' }}>
                        {formatDollars(row.predicted_net_charge_low)}
                        <span className="mx-0.5 opacity-50">–</span>
                        {formatDollars(row.predicted_net_charge_high)}
                      </td>
                      <td
                        className="px-4 py-1.5 tabular-nums text-right"
                        style={{ color: gap > 0 ? 'var(--crit)' : gap < 0 ? 'var(--accent)' : 'var(--muted)' }}
                      >
                        {gap >= 0 ? '+' : ''}{formatDollars(gap)}
                      </td>
                      <td className="px-4 py-1.5">
                        <FlagCell row={row} />
                      </td>
                      <td className="px-4 py-1.5 tabular-nums text-right" style={{ color: 'var(--muted)' }}>
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
          <div
            className="px-4 py-2 border-t flex items-center justify-between gap-3 flex-wrap text-[10px] tracking-widest"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            <span className="tabular-nums">
              SHOW <span style={{ color: 'var(--text)' }}>{(pageStart + 1).toLocaleString()}</span>
              <span className="opacity-50">–</span>
              <span style={{ color: 'var(--text)' }}>{pageEnd.toLocaleString()}</span>{' '}
              / <span style={{ color: 'var(--text)' }}>{sortedRows.length.toLocaleString()}</span>
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage(1)} disabled={page === 1} aria-label="First page"
                className={pagerBtn}
                style={{ borderColor: 'var(--border-2)', background: 'transparent', color: page === 1 ? 'var(--muted)' : 'var(--text)', opacity: page === 1 ? 0.4 : 1 }}>
                «
              </button>
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page"
                className={pagerBtn}
                style={{ borderColor: 'var(--border-2)', background: 'transparent', color: page === 1 ? 'var(--muted)' : 'var(--text)', opacity: page === 1 ? 0.4 : 1 }}>
                ‹ PREV
              </button>
              <span className="px-3 tabular-nums">
                PG <span style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>{page}</span> / {totalPages.toLocaleString()}
              </span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} aria-label="Next page"
                className={pagerBtn}
                style={{ borderColor: 'var(--border-2)', background: 'transparent', color: page >= totalPages ? 'var(--muted)' : 'var(--text)', opacity: page >= totalPages ? 0.4 : 1 }}>
                NEXT ›
              </button>
              <button type="button" onClick={() => setPage(totalPages)} disabled={page >= totalPages} aria-label="Last page"
                className={pagerBtn}
                style={{ borderColor: 'var(--border-2)', background: 'transparent', color: page >= totalPages ? 'var(--muted)' : 'var(--text)', opacity: page >= totalPages ? 0.4 : 1 }}>
                »
              </button>
            </div>
          </div>
        )}

        {/* Selected row copy bar */}
        {selectedRow && (
          <div
            className="px-4 py-2 border-t flex items-center justify-between gap-3 flex-wrap text-[11px]"
            style={{ borderColor: 'var(--border)', background: 'var(--row-hov)' }}
          >
            <span style={{ color: 'var(--muted)' }}>
              SELECTED <span style={{ color: 'var(--text)' }}>{selectedRow.tracking_number ?? `row #${selectedRow.row_index}`}</span>
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <CopyButton text={escapeFormula(selectedRow.tracking_number ?? '')} label="Tracking #" />
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
                text={`${escapeFormula(selectedRow.tracking_number ?? '')}\t${escapeFormula(selectedRow.service_type)}\t${formatDollars(selectedRow.actual_net_charge)}\t${formatDollars(selectedRow.predicted_net_charge_low)} – ${formatDollars(selectedRow.predicted_net_charge_high)}\t${escapeFormula(selectedRow.dim_anomaly ?? selectedRow.cost_anomaly ?? 'Normal')}`}
                label="Full Row"
              />
              <button
                type="button"
                onClick={() => setSelectedRowIndex(null)}
                className="px-2 py-1 text-[10px] tracking-widest uppercase cursor-pointer"
                style={{ color: 'var(--muted)' }}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
