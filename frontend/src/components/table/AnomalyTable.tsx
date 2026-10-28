import { useState, useMemo, useRef, useEffect } from 'react';
import type { ShipmentResult } from '../../types/api';
import { formatDollars, zoneName } from '../../lib/metrics';
import { escapeFormula } from '../../lib/export';
import CopyButton, { CopyTableButton } from '../ui/CopyButton';
import PriorityTag from '../ui/PriorityTag';
import IntervalStrip from '../ui/IntervalStrip';
import Icon from '../ui/Icon';

type FilterValue = 'all' | 'high' | 'medium';

interface AnomalyTableProps {
  results: ShipmentResult[];
  /** Limit displayed rows. Defaults to 100 — pass undefined for unbounded. */
  pageSize?: number;
  /** Shows a "View all" action in the header. */
  onViewAll?: () => void;
}

export function FlagInfoPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Explain priority levels"
        aria-expanded={open}
        className="icon-btn h-[30px] w-[30px]"
      >
        <Icon name="info" size={16} />
      </button>
      {open && (
        <div role="tooltip" className="float absolute right-0 top-10 z-50 w-[320px] p-4 text-[14px]">
          <p style={{ color: 'var(--ink)' }}>How a shipment gets flagged</p>
          <p className="meta mt-1">Three checks run on every row:</p>
          <ul className="mt-2 space-y-1.5" style={{ color: 'var(--muted)' }}>
            <li>The DIM-weight call disagrees with FedEx's.</li>
            <li>The bill is above the model's 95% prediction interval.</li>
            <li>The shipment's profile is unusual (anomaly score over threshold).</li>
          </ul>
          <div className="mt-3 space-y-2">
            <p className="flex items-start gap-2">
              <span className="pill pill-over">High</span>
              <span style={{ color: 'var(--muted)' }}>Two or more checks fired.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="pill pill-warn">Medium</span>
              <span style={{ color: 'var(--muted)' }}>One check fired. Review when there's time.</span>
            </p>
          </div>
          <p className="meta mt-3">The percentage is the anomaly score.</p>
        </div>
      )}
    </div>
  );
}

/** The copy actions for one selected row. */
export function RowCopyBar({ row, onDismiss }: { row: ShipmentResult; onDismiss: () => void }) {
  const gap = row.actual_net_charge - row.charge_upper_95;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-[22px] py-3"
      style={{ background: 'var(--raised)', borderTop: '1px solid var(--line)' }}
    >
      <span className="text-[14px]" style={{ color: 'var(--muted)' }}>
        Selected{' '}
        <span className="mono" style={{ color: 'var(--ink)' }}>{row.tracking_number ?? `row ${row.row_index}`}</span>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={escapeFormula(row.tracking_number ?? '')} label="Tracking #" />
        <CopyButton text={formatDollars(row.actual_net_charge)} label="Billed" />
        <CopyButton
          text={`${formatDollars(row.charge_lower_95)} – ${formatDollars(row.charge_upper_95)}`}
          label="Predicted range"
        />
        <CopyButton text={`${gap >= 0 ? '+' : ''}${formatDollars(gap)}`} label="Gap" />
        <CopyButton
          text={`${escapeFormula(row.tracking_number ?? '')}\t${escapeFormula(row.service_type)}\t${formatDollars(row.actual_net_charge)}\t${formatDollars(row.charge_lower_95)} – ${formatDollars(row.charge_upper_95)}\t${row.review_priority.toUpperCase()}`}
          label="Full row"
        />
        <button type="button" onClick={onDismiss} className="icon-btn h-[30px] w-[30px]" aria-label="Dismiss">
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  );
}

const DEFAULT_PAGE_SIZE = 100;

export default function AnomalyTable({ results, pageSize = DEFAULT_PAGE_SIZE, onViewAll }: AnomalyTableProps) {
  const [filterValue, setFilterValue] = useState<FilterValue>('all');
  // Selection is by row_index — tracking_number can be null/duplicate in real data
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  // Most money over the ceiling first — the rows worth a claim
  const flaggedRows = useMemo(
    () =>
      results
        .filter((r) => r.review_priority !== 'low')
        .sort((a, b) => (b.actual_net_charge - b.charge_upper_95) - (a.actual_net_charge - a.charge_upper_95)),
    [results],
  );

  const counts = useMemo(() => {
    let high = 0;
    for (const r of flaggedRows) if (r.review_priority === 'high') high++;
    return { all: flaggedRows.length, high, medium: flaggedRows.length - high };
  }, [flaggedRows]);

  const filteredRows = useMemo(() => {
    switch (filterValue) {
      case 'high':
        return flaggedRows.filter((r) => r.review_priority === 'high');
      case 'medium':
        return flaggedRows.filter((r) => r.review_priority === 'medium');
      default:
        return flaggedRows;
    }
  }, [flaggedRows, filterValue]);

  const displayRows = pageSize == null ? filteredRows : filteredRows.slice(0, pageSize);

  const selectedRow = useMemo(
    () => (selectedRowIndex != null ? displayRows.find((r) => r.row_index === selectedRowIndex) ?? null : null),
    [selectedRowIndex, displayRows],
  );

  return (
    <section className="card flex h-full flex-col overflow-hidden" aria-label="Dispute queue">
      <div className="card-head px-[22px] pb-3 pt-[22px]">
        <div>
          <h2 className="card-title">Dispute queue</h2>
          <p className="meta tnum mt-0.5">
            {results.length === 0
              ? 'Most money over the ceiling first'
              : `Showing ${displayRows.length.toLocaleString()} of ${filteredRows.length.toLocaleString()} · most money over the ceiling first`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Filter by priority">
            {(['all', 'high', 'medium'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filterValue === f} onClick={() => setFilterValue(f)}>
                {f === 'all' ? 'All' : f === 'high' ? 'High' : 'Medium'}{' '}
                <span className="tnum" style={{ color: 'var(--faint)' }}>{counts[f].toLocaleString()}</span>
              </button>
            ))}
          </div>
          <CopyTableButton rows={filteredRows} />
          <FlagInfoPopover />
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto">
        <table className="table" aria-label="Flagged shipments, most over the ceiling first">
          <thead>
            <tr>
              <th scope="col">Tracking #</th>
              <th scope="col">Service · zone</th>
              <th scope="col">Billed against range</th>
              <th scope="col" className="num">Billed</th>
              <th scope="col" className="num">Over ceiling</th>
              <th scope="col">Priority</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: 'var(--muted)', whiteSpace: 'normal' }}>
                  Flagged shipments land here, the costliest first.
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: 'var(--muted)' }}>No shipments at this priority.</td>
              </tr>
            ) : (
              displayRows.map((row) => {
                const on = selectedRowIndex === row.row_index;
                // Residual is the gap to the 95% upper bound — what the audit
                // would actually try to recover, not the gap to the point pred.
                const resid = row.actual_net_charge - row.charge_upper_95;
                return (
                  <tr
                    key={row.row_index}
                    onClick={() => setSelectedRowIndex(on ? null : row.row_index)}
                    aria-selected={on}
                    className="row-click"
                  >
                    <td className="mono">
                      {row.tracking_number ?? <span className="italic opacity-60">no tracking #</span>}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{row.service_type} · {zoneName(row.zone)}</td>
                    <td><IntervalStrip row={row} /></td>
                    <td className="num">{formatDollars(row.actual_net_charge)}</td>
                    <td className="num" style={{ color: resid > 0 ? 'var(--over)' : 'var(--muted)' }}>
                      {resid > 0 ? `+${formatDollars(resid)}` : formatDollars(0)}
                    </td>
                    <td><PriorityTag row={row} /></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedRow && <RowCopyBar row={selectedRow} onDismiss={() => setSelectedRowIndex(null)} />}

      {onViewAll && filteredRows.length > displayRows.length && (
        <div className="px-[22px] py-3" style={{ borderTop: '1px solid var(--line)' }}>
          <button type="button" className="btn btn-quiet btn-sm -ml-3" onClick={onViewAll}>
            View all {filteredRows.length.toLocaleString()} in Disputes
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      )}
    </section>
  );
}
