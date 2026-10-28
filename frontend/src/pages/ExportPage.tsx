import { useMemo } from 'react';
import type { PageId, UploadState } from '../types/api';
import { getDisputeCandidates, generateDisputeCandidatesCsv, downloadCsv } from '../lib/export';
import { formatDollars } from '../lib/metrics';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import PriorityTag from '../components/ui/PriorityTag';
import Icon from '../components/ui/Icon';

interface ExportPageProps {
  uploadState: UploadState;
  onNavigate: (page: PageId) => void;
}

const CSV_COLUMNS = [
  'Tracking #', 'Service', 'Dims (LxWxH)', 'Weight (lbs)', 'Zone', 'Priority', 'DIM Disagrees',
  'Charge Outside Interval', 'Anomaly Flagged', 'Actual $', 'Predicted Low $', 'Predicted $',
  'Predicted High $', 'Gap $', 'Anomaly Score',
];

export default function ExportPage({ uploadState, onNavigate }: ExportPageProps) {
  const results = useMemo(() => uploadState.results ?? [], [uploadState.results]);
  const candidates = useMemo(() => getDisputeCandidates(results), [results]);
  const totalGap = candidates.reduce(
    (sum, r) => sum + Math.max(0, r.actual_net_charge - r.charge_upper_95),
    0
  );

  // Sort by recoverable gap (actual - upper bound), descending — same definition
  // used by the Overview "Est. recoverable" KPI so the top of this list is also
  // the most cash on the table.
  const sortedCandidates = useMemo(
    () =>
      [...candidates].sort(
        (a, b) =>
          (b.actual_net_charge - b.charge_upper_95) -
          (a.actual_net_charge - a.charge_upper_95)
      ),
    [candidates],
  );

  const date = new Date().toISOString().slice(0, 10);
  const filename = `dimrisk-disputes-${date}.csv`;

  function handleDownload() {
    const csv = generateDisputeCandidatesCsv(candidates);
    downloadCsv(csv, filename);
  }

  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Export" sub="Download the dispute candidates as a CSV to file with FedEx." />
        <section className="card">
          <EmptyState onGoToOverview={() => onNavigate('overview')}>
            No invoice scored yet. The dispute file is built from one.
          </EmptyState>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Export"
        sub={
          <span className="tnum">
            {candidates.length.toLocaleString()} dispute candidates
            {totalGap > 0 && <> · {formatDollars(totalGap)} billed above the model's ceiling</>}
          </span>
        }
        actions={
          <button
            type="button"
            onClick={handleDownload}
            disabled={candidates.length === 0}
            className="btn btn-primary"
            aria-label={`Download ${candidates.length} dispute candidates as CSV`}
          >
            <Icon name="download" size={16} />
            Download CSV
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <section className="card overflow-hidden" aria-label="Dispute candidates">
          <div className="px-[22px] pb-3 pt-[22px]">
            <h2 className="card-title">Dispute candidates</h2>
            <p className="meta mt-0.5">High and medium priority, most money over the ceiling first</p>
          </div>

          {candidates.length === 0 ? (
            <p className="px-[22px] pb-8" style={{ color: 'var(--muted)' }}>
              No dispute candidates. Every shipment landed inside the model's range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table" aria-label="Dispute candidates export table">
                <thead>
                  <tr>
                    <th scope="col">Tracking #</th>
                    <th scope="col">Priority</th>
                    <th scope="col" className="num">Billed</th>
                    <th scope="col" className="num">Predicted</th>
                    <th scope="col" className="num">Over ceiling</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCandidates.map((row) => {
                    // Same "recoverable" math as Overview KPI — gap to upper bound, not to point.
                    const gap = row.actual_net_charge - row.charge_upper_95;
                    return (
                      <tr key={row.row_index}>
                        <td className="mono">
                          {row.tracking_number ?? <span className="italic opacity-60">no tracking #</span>}
                        </td>
                        <td><PriorityTag row={{ ...row, anomaly_score: null }} /></td>
                        <td className="num">{formatDollars(row.actual_net_charge)}</td>
                        <td className="num" style={{ color: 'var(--muted)' }}>{formatDollars(row.charge_predicted)}</td>
                        <td className="num" style={{ color: gap > 0 ? 'var(--over)' : 'var(--muted)' }}>
                          {gap > 0 ? `+${formatDollars(gap)}` : formatDollars(0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="card card-pad" aria-label="What the file contains">
          <h2 className="card-title">What's in the file</h2>
          <p className="meta mt-0.5 break-all">{filename}</p>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <dt className="meta">Rows</dt>
              <dd className="figure mt-1 text-[24px] leading-8">{candidates.length.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="meta">Columns</dt>
              <dd className="figure mt-1 text-[24px] leading-8">{CSV_COLUMNS.length}</dd>
            </div>
          </dl>
          <ul className="mt-5 flex flex-wrap gap-1.5">
            {CSV_COLUMNS.map((c) => (
              <li key={c} className="pill pill-neutral">{c}</li>
            ))}
          </ul>
          <p className="meta mt-5">
            Text cells starting with = + - or @ are prefixed with a quote so spreadsheets don't run them as formulas.
          </p>
        </aside>
      </div>
    </div>
  );
}
