import { useRef, useState, useCallback } from 'react';
import type { UploadState } from '../../types/api';

interface UploadZoneProps {
  uploadState: UploadState;
  onUpload: (file: File) => Promise<void>;
  onDemoLoad: () => Promise<void>;
}

export default function UploadZone({ uploadState, onUpload, onDemoLoad }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isUploading = uploadState.status === 'uploading';

  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext !== 'xlsx' && ext !== 'csv') return;
      await onUpload(file);
    },
    [onUpload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (isUploading) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [isUploading, handleFile],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!isUploading) setIsDragOver(true);
    },
    [isUploading],
  );

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleClick = useCallback(() => {
    if (!isUploading) inputRef.current?.click();
  }, [isUploading]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile],
  );

  const handleDemoClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isUploading) onDemoLoad();
    },
    [isUploading, onDemoLoad],
  );

  return (
    <section
      className="border"
      style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
    >
      <div
        className="px-4 py-2 border-b flex items-center justify-between text-[10px] tracking-widest"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
      >
        <span>&gt; INGEST.SOURCE · DROP OR BROWSE</span>
        <span>.xlsx · .csv · 50 MB max</span>
      </div>

      <div className="p-4 space-y-3">
        <div
          role="button"
          tabIndex={isUploading ? -1 : 0}
          aria-label="Upload invoice file — drag and drop or click to select"
          aria-disabled={isUploading}
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleClick();
          }}
          className="relative border border-dashed p-10 text-center transition-colors duration-150 cursor-pointer"
          style={{
            borderColor: isDragOver ? 'var(--accent)' : 'var(--border-2)',
            background: isDragOver ? 'var(--row-hov)' : 'transparent',
            opacity: isUploading ? 0.7 : 1,
            cursor: isUploading ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            className="sr-only"
            onChange={handleInputChange}
            aria-hidden="true"
            tabIndex={-1}
          />

          {isUploading ? (
            <div className="flex flex-col items-center gap-3 w-full">
              {(() => {
                const { totalCount, shipmentCount } = uploadState;
                const indeterminate = totalCount == null;
                const pct = indeterminate
                  ? null
                  : shipmentCount != null
                  ? Math.min(Math.round((shipmentCount / totalCount) * 100), 99)
                  : 0;

                return (
                  <div
                    role="progressbar"
                    aria-label="Analyzing invoice"
                    aria-valuenow={pct ?? undefined}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-busy="true"
                    className="relative w-full h-1 overflow-hidden"
                    style={{ background: 'var(--border)' }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 overflow-hidden"
                      style={{
                        width: indeterminate ? '100%' : `${pct}%`,
                        background: 'var(--accent)',
                        boxShadow: 'var(--glow)',
                        transition: 'width 300ms ease-out',
                      }}
                    >
                      <div
                        className="absolute inset-0 animate-shimmer"
                        style={{
                          background:
                            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
                        }}
                      />
                    </div>
                  </div>
                );
              })()}
              <div className="flex items-baseline justify-between w-full text-[11px]">
                <p className="tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
                  &gt; DECODING {uploadState.filename ?? 'stream'}
                </p>
                {uploadState.shipmentCount != null && (
                  <p className="tabular-nums" style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>
                    {uploadState.totalCount != null
                      ? `${uploadState.shipmentCount.toLocaleString()} / ${uploadState.totalCount.toLocaleString()}`
                      : uploadState.shipmentCount.toLocaleString()}{' '}
                    ROWS
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-[11px] tracking-widest uppercase" style={{ color: 'var(--text)' }}>
              <span className="text-[20px] leading-none opacity-70" style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>⇣</span>
              <p>{isDragOver ? 'Release to analyze' : 'Drag & drop invoice'}</p>
              <p className="text-[10px]" style={{ color: 'var(--muted)' }}>
                OR CLICK · .xlsx · .csv
              </p>
            </div>
          )}

          {uploadState.status === 'error' && uploadState.errorMessage && (
            <p role="alert" className="mt-4 text-[11px]" style={{ color: 'var(--crit)' }}>
              ▲ {uploadState.errorMessage}
            </p>
          )}
        </div>

        {!isUploading && (
          <div className="flex items-center gap-3 text-[10px] tracking-widest" style={{ color: 'var(--muted)' }}>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span>OR</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>
        )}

        {!isUploading && (
          <button
            type="button"
            onClick={handleDemoClick}
            className="w-full border px-4 py-2 text-[11px] tracking-widest uppercase transition-colors duration-150 cursor-pointer"
            style={{ borderColor: 'var(--border-2)', background: 'transparent', color: 'var(--text)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--row-hov)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.textShadow = 'var(--glow)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.textShadow = 'none'; }}
          >
            ▶ LOAD 3,000-ROW SAMPLE
          </button>
        )}
      </div>
    </section>
  );
}
