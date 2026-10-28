import { useRef, useState, useCallback } from 'react';
import type { UploadState } from '../../types/api';
import Icon from '../ui/Icon';

interface UploadZoneProps {
  uploadState: UploadState;
  onUpload: (file: File) => Promise<void>;
  onDemoLoad: () => Promise<void>;
  /**
   * `full` is the first-run drop target that fills the Overview before any
   * invoice is loaded; `compact` is the pair of buttons in the title row once
   * data is on screen (still accepts a dropped file).
   */
  variant?: 'full' | 'compact';
}

function StreamProgress({ uploadState }: { uploadState: UploadState }) {
  const { totalCount, shipmentCount } = uploadState;
  const indeterminate = totalCount == null;
  const pct = indeterminate
    ? null
    : shipmentCount != null
    ? Math.min(Math.round((shipmentCount / totalCount) * 100), 99)
    : 0;

  return (
    <div className="w-full">
      <div
        role="progressbar"
        aria-label="Analyzing invoice"
        aria-valuenow={pct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-busy="true"
        className="progress-track"
      >
        {indeterminate ? (
          <div className="progress-indet" />
        ) : (
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3 text-[13px]">
        <p className="truncate" style={{ color: 'var(--muted)' }}>
          Scoring {uploadState.filename ?? 'invoice'}
        </p>
        {shipmentCount != null && (
          <p className="tnum flex-none" style={{ color: 'var(--ink)' }}>
            {totalCount != null
              ? `${shipmentCount.toLocaleString()} of ${totalCount.toLocaleString()}`
              : shipmentCount.toLocaleString()}{' '}
            <span style={{ color: 'var(--faint)' }}>rows</span>
          </p>
        )}
      </div>
    </div>
  );
}

export default function UploadZone({ uploadState, onUpload, onDemoLoad, variant = 'full' }: UploadZoneProps) {
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
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (isUploading) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [isUploading, handleFile],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      if (!isUploading) setIsDragOver(true);
    },
    [isUploading],
  );

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const openPicker = useCallback(() => {
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

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".xlsx,.csv"
      className="sr-only"
      onChange={handleInputChange}
      aria-hidden="true"
      tabIndex={-1}
    />
  );

  if (variant === 'compact') {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className="flex flex-wrap items-center gap-2 rounded-full transition-colors duration-150"
        style={{ outline: isDragOver ? '2px dashed var(--billed)' : 'none', outlineOffset: 4 }}
      >
        {fileInput}
        <button type="button" onClick={handleDemoClick} disabled={isUploading} className="btn btn-quiet">
          Try sample invoice
        </button>
        <button
          type="button"
          onClick={openPicker}
          disabled={isUploading}
          className="btn btn-primary"
          aria-label="Upload invoice file — drag and drop or click to select"
        >
          <Icon name="upload" size={16} />
          {isDragOver ? 'Drop to analyse' : 'Upload invoice'}
        </button>
      </div>
    );
  }

  return (
    <section className="card card-pad flex flex-col" aria-label="Upload an invoice">
      <div
        role="button"
        tabIndex={isUploading ? -1 : 0}
        aria-label="Upload invoice file — drag and drop or click to select"
        aria-disabled={isUploading}
        onClick={openPicker}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        className="flex min-h-[260px] flex-1 flex-col justify-between gap-8 rounded-[14px] p-6 transition-colors duration-150 sm:p-8"
        style={{
          background: isDragOver ? 'var(--active)' : 'var(--raised)',
          outline: isDragOver ? '2px dashed var(--billed)' : '1px dashed var(--line-strong)',
          outlineOffset: -1,
          cursor: isUploading ? 'progress' : 'pointer',
        }}
      >
        {fileInput}
        <div className="flex items-start gap-4">
          <span
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full"
            style={{ background: 'var(--surface)', color: 'var(--ink)' }}
          >
            <Icon name="upload" size={20} />
          </span>
          <div>
            <h2 className="text-[22px] leading-7 tracking-[-0.01em]" style={{ color: 'var(--ink)' }}>
              {isDragOver ? 'Release to analyse' : 'Drop a FedEx invoice export'}
            </h2>
            <p className="mt-1.5" style={{ color: 'var(--muted)' }}>
              CSV or XLSX, up to 50 MB. One month per upload reads best.
            </p>
          </div>
        </div>

        {isUploading ? (
          <StreamProgress uploadState={uploadState} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="btn btn-primary" aria-hidden="true">
              Choose file
            </span>
            <button type="button" onClick={handleDemoClick} className="btn btn-ghost" style={{ background: 'var(--surface)' }}>
              <Icon name="play" size={14} />
              Try sample invoice
            </button>
          </div>
        )}

        {uploadState.status === 'error' && uploadState.errorMessage && (
          <p role="alert" className="flex items-start gap-2 text-[14px]" style={{ color: 'var(--over)' }}>
            <Icon name="info" size={16} className="mt-0.5 flex-none" />
            <span>
              Couldn't analyse {uploadState.filename ?? 'that file'}: {uploadState.errorMessage}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}

export { StreamProgress };
