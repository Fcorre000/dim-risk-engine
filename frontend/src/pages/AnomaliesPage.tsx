import { useState, useMemo, useEffect } from 'react';
import type { PageId, ShipmentResult, UploadState } from '../types/api';
import { formatDollars, zoneName } from '../lib/metrics';
import { CopyTableButton } from '../components/ui/CopyButton';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import PriorityTag from '../components/ui/PriorityTag';
import IntervalStrip from '../components/ui/IntervalStrip';
import Icon from '../components/ui/Icon';
import { FlagInfoPopover, RowCopyBar } from '../components/table/AnomalyTable';

interface AnomaliesPageProps {
  uploadState: UploadState;
  onNavigate: (page: PageId) => void;
}

type SortColumn = 'flag' | 'actual' | 'gap' | 'confidence';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const SORT_NAME: Record<SortColumn, string> = {
  flag: 'priority',
  actual: 'billed',
  gap: 'over ceiling',
  confidence: 'anomaly score',
};

function flagOrder(r: ShipmentResult): number {
  if (r.review_priority === 'high') return 0;
  if (r.review_priority === 'medium') return 1;
  return 2;
}

// "Confidence" in the v2 contract is the unsupervised anomaly fusion score
// (IsolationForest + autoencoder percentile rank). Falls back to 0 when the
// anomaly artifacts weren't loaded.
function confidenceScore(r: ShipmentResult): number {
  return r.anomaly_score ?? 0;
}

function SortHeader({
  col, label, sortCol, sortDir, onSort, align = 'left',
}: {
  col: SortColumn; label: string; sortCol: SortColumn; sortDir: SortDir;
  onSort: (c: SortColumn) => void; align?: 'left' | 'right';
}) {
  const on = col === sortCol;
  return (
    <th
      scope="col"
      className={align === 'right' ? 'num' : undefined}
      aria-sort={on ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="sort" onClick={() => onSort(col)}>
        {label}
        {on && <Icon name={sortDir === 'asc' ? 'arrowUp' : 'arrowDown'} size={12} />}
      </button>
    </th>
  );
}

export default function AnomaliesPage({ uploadState, onNavigate }: AnomaliesPageProps) {
  const [sortCol, setSortCol] = useState<SortColumn>('confidence');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>(100);
  const [page, setPage] = useState(1);

  const results = useMemo(() => uploadState.results ?? [], [uploadState.results]);

  const flaggedRows = useMemo(
    () => results.filter((r) => r.review_priority !== 'low'),
    [results]
  );

  const highCount = useMemo(() => flaggedRows.filter((r) => r.review_priority === 'high').length, [flaggedRows]);

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
        const gapA = a.actual_net_charge - a.charge_upper_95;
        const gapB = b.actual_net_charge - b.charge_upper_95;
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
      <div className="space-y-6">
        <PageHeader title="Disputes" sub="Every shipment the audit flagged, with the evidence for a claim." />
        <section className="card">
          <EmptyState onGoToOverview={() => onNavigate('overview')}>
            No invoice scored yet. Flagged shipments appear here once one is.
          </EmptyState>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disputes"
        sub={
          <span className="tnum">
            {flaggedRows.length.toLocaleString()} of {results.length.toLocaleString()} shipments flagged
            {highCount > 0 && <> · {highCount.toLocaleString()} high priority</>}. Select a row to copy its details.
          </span>
        }
      />

      <section className="card overflow-hidden" aria-label="Flagged shipments">
        <div className="card-head px-[22px] pb-3 pt-[22px]">
          <p className="text-[14px]" style={{ color: 'var(--muted)' }}>
            Sorted by <span style={{ color: 'var(--ink)' }}>{SORT_NAME[sortCol]}</span>,{' '}
            {sortDir === 'asc' ? 'lowest' : 'highest'} first
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="page-size" className="text-[13px]" style={{ color: 'var(--muted)' }}>Rows per page</label>
            <span className="relative inline-flex">
              <select
                id="page-size"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
                className="select"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <Icon name="chevronDown" size={14} className="pointer-events-none absolute right-3 top-[9px]" style={{ color: 'var(--muted)' }} />
            </span>
            <CopyTableButton rows={sortedRows} />
            <FlagInfoPopover />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table" aria-label="Flagged shipments sortable table">
            <thead>
              <tr>
                <th scope="col">Tracking #</th>
                <th scope="col">Service</th>
                <th scope="col">Zone</th>
                <th scope="col" className="num">Dims (cm)</th>
                <th scope="col" className="num">Weight</th>
                <th scope="col">Billed against range</th>
                <SortHeader col="actual" label="Billed" align="right" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <th scope="col" className="num">Predicted range</th>
                <SortHeader col="gap" label="Over ceiling" align="right" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortHeader col="flag" label="Priority" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortHeader col="confidence" label="Anomaly" align="right" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ color: 'var(--muted)' }}>
                    Nothing flagged. Every shipment on this invoice landed inside the model's range.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => {
                  const gap = row.actual_net_charge - row.charge_upper_95;
                  const conf = confidenceScore(row);
                  const isSelected = selectedRowIndex === row.row_index;
                  return (
                    <tr
                      key={row.row_index}
                      onClick={() => setSelectedRowIndex(isSelected ? null : row.row_index)}
                      aria-selected={isSelected}
                      className="row-click"
                    >
                      <td className="mono">
                        {row.tracking_number ?? <span className="italic opacity-60">no tracking #</span>}
                      </td>
                      <td style={{ color: 'var(--muted)' }}>{row.service_type}</td>
                      <td style={{ color: 'var(--muted)' }}>{zoneName(row.zone)}</td>
                      <td className="num" style={{ color: 'var(--muted)' }}>
                        {row.dim_length || row.dim_width || row.dim_height
                          ? `${row.dim_length}×${row.dim_width}×${row.dim_height}`
                          : '—'}
                      </td>
                      <td className="num" style={{ color: 'var(--muted)' }}>
                        {row.weight_lbs ? <>{row.weight_lbs} <span style={{ color: 'var(--faint)' }}>lb</span></> : '—'}
                      </td>
                      <td><IntervalStrip row={row} /></td>
                      <td className="num">{formatDollars(row.actual_net_charge)}</td>
                      <td className="num" style={{ color: 'var(--muted)' }}>
                        {formatDollars(row.charge_lower_95)}–{formatDollars(row.charge_upper_95)}
                      </td>
                      <td className="num" style={{ color: gap > 0 ? 'var(--over)' : 'var(--muted)' }}>
                        {gap > 0 ? `+${formatDollars(gap)}` : formatDollars(0)}
                      </td>
                      <td><PriorityTag row={{ ...row, anomaly_score: null }} /></td>
                      <td className="num" style={{ color: 'var(--muted)' }}>
                        {row.anomaly_score != null ? `${Math.round(conf * 100)}%` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {selectedRow && <RowCopyBar row={selectedRow} onDismiss={() => setSelectedRowIndex(null)} />}

        {sortedRows.length > 0 && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-[22px] py-3"
            style={{ borderTop: '1px solid var(--line)' }}
          >
            <span className="tnum text-[13px]" style={{ color: 'var(--muted)' }}>
              <span style={{ color: 'var(--ink)' }}>{(pageStart + 1).toLocaleString()}–{pageEnd.toLocaleString()}</span>{' '}
              of {sortedRows.length.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                aria-label="Previous page" className="btn btn-quiet btn-sm">
                <Icon name="chevronLeft" size={14} /> Previous
              </button>
              <span className="tnum px-2 text-[13px]" style={{ color: 'var(--muted)' }}>
                Page <span style={{ color: 'var(--ink)' }}>{page}</span> of {totalPages.toLocaleString()}
              </span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                aria-label="Next page" className="btn btn-quiet btn-sm">
                Next <Icon name="chevronRight" size={14} />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
