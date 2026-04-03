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
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    downloadCsv(csv, `dimrisk-disputes-${date}.csv`);
  }

  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Export</h1>
          <p className="text-gray-500 text-sm mt-1">Download dispute candidates as a CSV for FedEx claim submission</p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-16 flex items-center justify-center">
          <p className="text-sm text-gray-500">Upload an invoice on the Overview page to export dispute candidates</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row with title + download button */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Export</h1>
          <p className="text-gray-500 text-sm mt-1">
            {candidates.length.toLocaleString()} dispute candidate{candidates.length !== 1 ? 's' : ''} found
            {totalGap > 0 && (
              <span className="ml-2 text-rose-400 font-medium">
                Est. recoverable: +{formatDollars(totalGap)}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={candidates.length === 0}
          className={[
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold',
            'transition-colors duration-150 whitespace-nowrap',
            candidates.length > 0
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed',
          ].join(' ')}
          aria-label={`Download ${candidates.length} dispute candidates as CSV`}
        >
          <svg
            aria-hidden="true"
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 4v12m-4-4l4 4 4-4" />
          </svg>
          Download CSV
        </button>
      </div>

      {/* Candidate table */}
      <div className="rounded-xl bg-gray-900 border border-gray-800">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-100">Dispute Candidates</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Shipments where DIM anomaly = Unexpected or Cost anomaly = Review — sorted by gap descending
          </p>
        </div>

        {candidates.length === 0 ? (
          <div className="px-6 py-16 flex items-center justify-center">
            <p className="text-sm text-gray-500">No dispute candidates found in this invoice</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table" aria-label="Dispute candidates export table">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Tracking #', 'Flag type', 'Actual $', 'Predicted $', 'Gap $'].map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...candidates]
                  .sort((a, b) =>
                    (b.actual_net_charge - b.predicted_net_charge) -
                    (a.actual_net_charge - a.predicted_net_charge)
                  )
                  .map((row, idx) => {
                    const gap = row.actual_net_charge - row.predicted_net_charge;
                    const flagType = row.dim_anomaly ?? row.cost_anomaly ?? '';
                    const isUnexpected = row.dim_anomaly === 'Unexpected';
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
                        <td className="px-4 py-3 whitespace-nowrap">
                          {isUnexpected ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30 whitespace-nowrap">
                              {flagType}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30 whitespace-nowrap">
                              {flagType}
                            </span>
                          )}
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
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
