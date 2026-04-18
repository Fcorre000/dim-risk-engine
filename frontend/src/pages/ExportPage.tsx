import type { UploadState } from '../types/api';
import { getDisputeCandidates, generateDisputeCandidatesCsv, downloadCsv } from '../lib/export';
import { formatDollars } from '../lib/metrics';

interface ExportPageProps {
  uploadState: UploadState;
}

export default function ExportPage({ uploadState }: ExportPageProps) {
  const results = uploadState.results ?? [];
  const candidates = getDisputeCandidates(results);
  const totalGap = candidates.reduce(
    (sum, r) => sum + (r.actual_net_charge - r.predicted_net_charge),
    0
  );

  function handleDownload() {
    const csv = generateDisputeCandidatesCsv(candidates);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `dimrisk-disputes-${date}.csv`);
  }

  if (results.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: 'var(--muted)' }}>
          &gt; 05 EXPORT · DISPUTE.CSV
        </h1>
        <section className="border" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <div className="p-10 text-center text-[11px] tracking-widest" style={{ color: 'var(--muted)' }}>
            NO SIGNAL — INGEST AN INVOICE ON 00 OVERVIEW
          </div>
        </section>
      </div>
    );
  }

  const sortedCandidates = [...candidates].sort(
    (a, b) =>
      (b.actual_net_charge - b.predicted_net_charge) -
      (a.actual_net_charge - a.predicted_net_charge)
  );

  return (
    <div className="space-y-4">
      {/* Header + download button */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: 'var(--muted)' }}>
            &gt; 05 EXPORT · DISPUTE.CSV
          </h1>
          <p className="text-[10px] tracking-widest uppercase mt-1" style={{ color: 'var(--muted)' }}>
            N.CANDIDATES {candidates.length.toLocaleString()}
            {totalGap > 0 && (
              <span className="ml-2" style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>
                · RECOVER.USD +{formatDollars(totalGap)}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={candidates.length === 0}
          className="border px-4 py-2 text-[11px] tracking-widest uppercase transition-colors duration-150"
          style={{
            borderColor: candidates.length > 0 ? 'var(--accent)' : 'var(--border-2)',
            background: 'transparent',
            color: candidates.length > 0 ? 'var(--accent)' : 'var(--muted)',
            textShadow: candidates.length > 0 ? 'var(--glow)' : 'none',
            cursor: candidates.length > 0 ? 'pointer' : 'not-allowed',
          }}
          onMouseEnter={(e) => {
            if (candidates.length > 0) e.currentTarget.style.background = 'var(--row-hov)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          aria-label={`Download ${candidates.length} dispute candidates as CSV`}
        >
          ⇣ DOWNLOAD .CSV
        </button>
      </div>

      {/* Candidate table */}
      <section className="border" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
        <div
          className="px-4 py-2 border-b flex items-center justify-between text-[10px] tracking-widest"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <span>&gt; TBL.05 · DISPUTE_CANDIDATES</span>
          <span>ORDER.BY gap DESC</span>
        </div>

        {candidates.length === 0 ? (
          <div className="p-10 text-center text-[11px] tracking-widest" style={{ color: 'var(--muted)' }}>
            · OK — NO DISPUTE CANDIDATES
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] font-jb" role="table" aria-label="Dispute candidates export table">
              <thead>
                <tr className="border-b text-[9px] tracking-widest" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                  <th scope="col" className="px-4 py-2 text-left">SHIPMENT_ID</th>
                  <th scope="col" className="px-4 py-2 text-left">FLAG</th>
                  <th scope="col" className="px-4 py-2 text-right">ACT</th>
                  <th scope="col" className="px-4 py-2 text-right">PRED</th>
                  <th scope="col" className="px-4 py-2 text-right">GAP</th>
                </tr>
              </thead>
              <tbody>
                {sortedCandidates.map((row) => {
                  const gap = row.actual_net_charge - row.predicted_net_charge;
                  const isUnexpected = row.dim_anomaly === 'Unexpected';
                  return (
                    <tr
                      key={row.row_index}
                      className="border-b transition-colors duration-150"
                      style={{ borderColor: 'var(--border)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--row-hov)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td className="px-4 py-1.5 tabular-nums">
                        {row.tracking_number ?? <span className="italic opacity-60">no tracking #</span>}
                      </td>
                      <td className="px-4 py-1.5 whitespace-nowrap">
                        {isUnexpected ? (
                          <span style={{ color: 'var(--crit)' }}>▲ UNEXPECTED</span>
                        ) : (
                          <span style={{ color: 'var(--warn)' }}>■ REVIEW</span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 tabular-nums text-right">
                        {formatDollars(row.actual_net_charge)}
                      </td>
                      <td className="px-4 py-1.5 tabular-nums text-right" style={{ color: 'var(--muted)' }}>
                        {formatDollars(row.predicted_net_charge)}
                      </td>
                      <td
                        className="px-4 py-1.5 tabular-nums text-right"
                        style={{ color: gap > 0 ? 'var(--crit)' : gap < 0 ? 'var(--accent)' : 'var(--muted)' }}
                      >
                        {gap >= 0 ? '+' : ''}{formatDollars(gap)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
