import { useRef, useState, useCallback } from 'react';
import type { UploadState } from '../../types/api';

interface UploadZoneProps {
  uploadState: UploadState;
  onUpload: (file: File) => Promise<void>;
}

export default function UploadZone({ uploadState, onUpload }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isUploading = uploadState.status === 'uploading';

  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext !== 'xlsx' && ext !== 'csv') return;
      await onUpload(file);
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (isUploading) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [isUploading, handleFile]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!isUploading) setIsDragOver(true);
    },
    [isUploading]
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!isUploading) inputRef.current?.click();
  }, [isUploading]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile]
  );

  return (
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
      className={[
        'relative rounded-xl border-2 border-dashed p-10 text-center transition-colors duration-200',
        'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
        isUploading
          ? 'border-gray-700 bg-gray-900 cursor-not-allowed opacity-60'
          : isDragOver
          ? 'border-blue-500 bg-blue-950/20'
          : 'border-gray-700 bg-gray-900 hover:border-gray-500 hover:bg-gray-800/50',
      ].join(' ')}
    >
      {/* Hidden file input */}
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
        <div className="flex flex-col items-center gap-3 w-full px-2">
          {/* Progress bar */}
          {(() => {
            const pct =
              uploadState.totalCount != null && uploadState.shipmentCount != null
                ? Math.min(Math.round((uploadState.shipmentCount / uploadState.totalCount) * 100), 99)
                : null;
            return (
              <div
                role="progressbar"
                aria-label="Analyzing invoice"
                aria-valuenow={pct ?? undefined}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-busy="true"
                className="relative w-full h-1.5 rounded-full bg-gray-800 overflow-hidden"
              >
                {/* Fill — grows from left as rows stream in; full-width when total unknown */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-blue-700 overflow-hidden transition-[width] duration-300 ease-out"
                  style={{ width: pct != null ? `${pct}%` : '100%' }}
                >
                  {/* Shimmer sweep inside the fill so it's clipped to filled area */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-300/50 to-transparent animate-shimmer" />
                </div>
              </div>
            );
          })()}
          <div className="flex items-baseline justify-between w-full">
            <p className="text-sm text-gray-400">Analyzing invoice…</p>
            {uploadState.shipmentCount != null && (
              <p className="text-xs tabular-nums text-blue-400">
                {uploadState.totalCount != null
                  ? `${uploadState.shipmentCount.toLocaleString()} / ${uploadState.totalCount.toLocaleString()} rows`
                  : `${uploadState.shipmentCount.toLocaleString()} rows`}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-300">
              {isDragOver ? 'Drop to analyze' : 'Drag & drop your invoice'}
            </p>
            <p className="text-xs text-gray-500 mt-1">or click to browse — .xlsx or .csv</p>
          </div>
        </div>
      )}

      {/* Error message near the field (SKILL.md error-feedback rule) */}
      {uploadState.status === 'error' && uploadState.errorMessage && (
        <p role="alert" className="mt-4 text-sm text-rose-400">
          {uploadState.errorMessage}
        </p>
      )}
    </div>
  );
}
