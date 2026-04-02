import type { UploadState } from '../../types/api';

interface UploadStatusCardProps {
  uploadState: UploadState;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export default function UploadStatusCard({ uploadState }: UploadStatusCardProps) {
  if (uploadState.status !== 'complete') return null;

  return (
    <div
      role="status"
      aria-label="Upload analysis complete"
      className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-5 flex items-center justify-between gap-4 flex-wrap"
    >
      {/* File info */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <p
            className="text-sm font-medium text-gray-100 truncate"
            title={uploadState.filename ?? ''}
          >
            {uploadState.filename}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {uploadState.shipmentCount?.toLocaleString()} shipments
          </p>
        </div>
      </div>

      {/* Stats + badge */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-100">
            {uploadState.shipmentCount?.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">Shipments</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-100">
            {uploadState.analysisTimeMs != null ? formatMs(uploadState.analysisTimeMs) : '—'}
          </p>
          <p className="text-xs text-gray-500">Analysis time</p>
        </div>

        {/* Analyzed badge */}
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold ring-1 ring-emerald-500/30">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Analyzed
        </span>
      </div>
    </div>
  );
}
