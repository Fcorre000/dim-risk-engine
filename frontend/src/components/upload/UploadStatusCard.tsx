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
    <section
      role="status"
      aria-label="Upload analysis complete"
      className="border"
      style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
    >
      <div
        className="px-4 py-2 border-b flex items-center justify-between text-[10px] tracking-widest"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
      >
        <span>&gt; INGEST.RESULT</span>
        <span style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>✓ ANALYZED</span>
      </div>
      <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap text-[11px]">
        <div className="min-w-0">
          <p className="truncate" style={{ color: 'var(--text)' }} title={uploadState.filename ?? ''}>
            {uploadState.filename}
          </p>
          <p className="mt-0.5 tracking-widest text-[10px] uppercase" style={{ color: 'var(--muted)' }}>
            {uploadState.shipmentCount?.toLocaleString()} shipments
          </p>
        </div>
        <div className="flex items-center gap-8">
          <div className="text-right">
            <p className="font-grot text-[20px] leading-none tabular-nums" style={{ color: 'var(--text)' }}>
              {uploadState.shipmentCount?.toLocaleString() ?? '—'}
            </p>
            <p className="mt-1 text-[9px] tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
              ROWS
            </p>
          </div>
          <div className="text-right">
            <p className="font-grot text-[20px] leading-none tabular-nums" style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>
              {uploadState.analysisTimeMs != null ? formatMs(uploadState.analysisTimeMs) : '—'}
            </p>
            <p className="mt-1 text-[9px] tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
              ELAPSED
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
