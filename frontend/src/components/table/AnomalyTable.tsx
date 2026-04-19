import { useState, useMemo, useRef, useEffect } from 'react';
import type { ShipmentResult } from '../../types/api';
import { formatDollars } from '../../lib/metrics';
import { escapeFormula } from '../../lib/export';
import CopyButton, { CopyTableButton } from '../ui/CopyButton';

type FilterValue = 'all' | 'unexpected' | 'review';

interface AnomalyTableProps {
  results: ShipmentResult[];
  /** Limit displayed rows. Defaults to 100 — pass undefined for unbounded. */
  pageSize?: number;
  /** Overrides the panel title, e.g. `> TBL.01 · DISPUTE_QUEUE.PEEK`. */
  title?: string;
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
  return (
    <span className="whitespace-nowrap" style={{ color: 'var(--muted)' }}>
      · OK
    </span>
  );
}

function FlagInfoPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Explain flag types"
        className="px-2 py-1 text-[10px] tracking-widest uppercase cursor-pointer"
        style={{ color: 'var(--muted)' }}
      >
        ? FLAGS
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-8 z-50 w-80 border p-3 text-[11px]"
          style={{ borderColor: 'var(--border-2)', background: 'var(--panel)', color: 'var(--text)' }}
        >
          <p className="text-[10px] tracking-widest mb-3" style={{ color: 'var(--muted)' }}>&gt; FLAG TYPES</p>
          <div className="mb-3">
            <p style={{ color: 'var(--crit)' }}>▲ UNEXPECTED 87%</p>
            <p className="leading-snug mt-1" style={{ color: 'var(--muted)' }}>
              Model predicted FedEx would <em>not</em> apply DIM billing; they charged DIM anyway. Higher % = stronger dispute.
            </p>
          </div>
          <div>
            <p style={{ color: 'var(--warn)' }}>■ REVIEW · HIGH</p>
            <p className="leading-snug mt-1" style={{ color: 'var(--muted)' }}>
              Actual charge exceeded the 90% prediction interval upper bound. Investigate above-range charges.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const DEFAULT_PAGE_SIZE = 100;

export default function AnomalyTable({ results, pageSize = DEFAULT_PAGE_SIZE, title }: AnomalyTableProps) {
  const [filterValue, setFilterValue] = useState<FilterValue>('all');
  // Selection is by row_index — tracking_number can be null/duplicate in real data
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  const flaggedRows = useMemo(
    () => results.filter((r) => r.dim_anomaly !== null || r.cost_anomaly !== null),
    [results],
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

  const displayRows = pageSize == null ? filteredRows : filteredRows.slice(0, pageSize);

  const selectedRow = useMemo(
    () => (selectedRowIndex != null ? displayRows.find((r) => r.row_index === selectedRowIndex) ?? null : null),
    [selectedRowIndex, displayRows],
  );

  if (results.length === 0) {
    return (
      <section className="border" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
        <div className="px-4 py-2 border-b text-[10px] tracking-widest flex justify-between" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
          <span>{title ?? '> TBL.01 · DISPUTE_QUEUE.PEEK'}</span>
          <span>ORDER.BY dim.conf DESC</span>
        </div>
        <div className="p-10 text-center text-[11px] tracking-widest" style={{ color: 'var(--muted)' }}>
          NO SIGNAL — INGEST AN INVOICE
        </div>
      </section>
    );
  }

  const headerTitle = title ?? `> TBL.01 · DISPUTE_QUEUE${pageSize != null ? '.PEEK' : '.ALL'}`;

  return (
    <section className="border" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
      {/* Toolbar */}
      <div
        className="px-4 py-2 border-b flex items-center justify-between gap-3 flex-wrap text-[10px] tracking-widest"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
      >
        <span>{headerTitle}</span>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="hidden sm:inline">
            {filteredRows.length.toLocaleString()} / {flaggedRows.length.toLocaleString()} FLAGGED
            {flaggedRows.length > displayRows.length && (
              <span className="opacity-60 ml-1">· FIRST {displayRows.length}</span>
            )}
          </span>
          <CopyTableButton rows={filteredRows} />
          <FlagInfoPopover />
          <label htmlFor="anomaly-filter" className="text-[10px] tracking-widest" style={{ color: 'var(--muted)' }}>
            FILTER
          </label>
          <select
            id="anomaly-filter"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value as FilterValue)}
            aria-label="Filter anomalies by type"
            className="border px-2 py-1 text-[10px] tracking-widest uppercase cursor-pointer"
            style={{ background: 'var(--panel)', borderColor: 'var(--border-2)', color: 'var(--text)' }}
          >
            <option value="all">ALL</option>
            <option value="unexpected">UNEXPECTED</option>
            <option value="review">REVIEW</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px] font-jb" role="table" aria-label="Anomaly detail table">
          <thead>
            <tr className="border-b text-[9px] tracking-widest" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
              <th className="px-4 py-2 text-left">SHIPMENT_ID</th>
              <th className="px-4 py-2 text-left">SVC</th>
              <th className="px-4 py-2 text-left">DIMS</th>
              <th className="px-4 py-2 text-right">LB</th>
              <th className="px-4 py-2 text-left">Z</th>
              <th className="px-4 py-2 text-right">ACT</th>
              <th className="px-4 py-2 text-right">PRED</th>
              <th className="px-4 py-2 text-right">RESID</th>
              <th className="px-4 py-2 text-left">FLAG</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-[11px] tracking-widest" style={{ color: 'var(--muted)' }}>
                  NO ROWS MATCH FILTER
                </td>
              </tr>
            ) : (
              displayRows.map((row) => {
                const on = selectedRowIndex === row.row_index;
                const resid = row.actual_net_charge - row.predicted_net_charge_high;
                return (
                  <tr
                    key={row.row_index}
                    onClick={() =>
                      setSelectedRowIndex(on ? null : row.row_index)
                    }
                    className="border-b cursor-pointer transition-colors duration-150"
                    style={{
                      borderColor: 'var(--border)',
                      background: on ? 'var(--row-hov)' : 'transparent',
                    }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--row-hov)'; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
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
                    <td className="px-4 py-1.5 tabular-nums text-right">{formatDollars(row.actual_net_charge)}</td>
                    <td className="px-4 py-1.5 tabular-nums text-right" style={{ color: 'var(--muted)' }}>
                      {formatDollars(row.predicted_net_charge_low)}<span className="mx-0.5 opacity-50">–</span>{formatDollars(row.predicted_net_charge_high)}
                    </td>
                    <td
                      className="px-4 py-1.5 tabular-nums text-right"
                      style={{ color: resid > 0 ? 'var(--crit)' : resid < 0 ? 'var(--accent)' : 'var(--muted)' }}
                    >
                      {resid >= 0 ? '+' : ''}{formatDollars(resid)}
                    </td>
                    <td className="px-4 py-1.5">
                      <FlagCell row={row} />
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
  );
}
