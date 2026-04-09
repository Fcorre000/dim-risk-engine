import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { BASE_URL } from './api';
import type { PageId, ShipmentResult, UploadState } from './types/api';
import MainLayout from './components/layout/MainLayout';
import OverviewPage from './pages/OverviewPage';
import AnomaliesPage from './pages/AnomaliesPage';
import ByZonePage from './pages/ByZonePage';
import BySkuPage from './pages/BySkuPage';
import TrendsPage from './pages/TrendsPage';
import ExportPage from './pages/ExportPage';

const INITIAL_UPLOAD_STATE: UploadState = {
  status: 'idle',
  filename: null,
  shipmentCount: null,
  totalCount: null,
  analysisTimeMs: null,
  results: null,
  errorMessage: null,
  streamingKpis: null,
};

// Reads an NDJSON streaming response and drives uploadState updates.
// Shared by both the file-upload path and the demo path.
async function consumeNdjsonStream(
  response: Response,
  filename: string,
  startTime: number,
  setUploadState: React.Dispatch<React.SetStateAction<UploadState>>,
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let totalCount: number | null = null;
  const allResults: ShipmentResult[] = [];

  // Incremental KPI counters — avoids O(n²) recomputation from full array
  let dimFlaggedCount = 0;
  let disputeCandidates = 0;
  let estRecoverable = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.__meta__) {
          totalCount = typeof obj.total === 'number' ? obj.total : null;
          setUploadState(prev => ({ ...prev, totalCount }));
          continue;
        }
        if (obj.__error__) {
          throw new Error(obj.__error__);
        }
        allResults.push(obj);

        // Update incremental KPI counters (O(1) per row)
        if (obj.dim_flag_probability > 0.5) dimFlaggedCount++;
        if (obj.dim_anomaly === 'Unexpected') {
          disputeCandidates++;
          const gap = obj.actual_net_charge - obj.predicted_net_charge_high;
          if (gap > 0) estRecoverable += gap;
        }

        const len = allResults.length;

        // Every 50 rows: update progress bar + streaming KPIs (cheap — just numbers)
        if (len % 50 === 0) {
          const kpis = { dimFlaggedCount, disputeCandidates, estRecoverable: parseFloat(estRecoverable.toFixed(2)) };
          // Flush full results array every 500 rows for charts; KPIs update every 50
          const flushResults = len % 500 === 0;
          // flushSync forces React to commit to DOM synchronously — without it,
          // React 18's automatic batching can defer the render past our yield point
          flushSync(() => {
            setUploadState(prev => ({
              ...prev,
              shipmentCount: len,
              streamingKpis: kpis,
              ...(flushResults ? { results: [...allResults] } : {}),
            }));
          });

          // Yield to browser so it can paint the committed DOM update
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } catch { /* skip malformed lines */ }
    }
  }

  // Flush tail rows past the last 50-row boundary
  if (allResults.length % 50 !== 0) {
    flushSync(() => {
      setUploadState(prev => ({
        ...prev,
        shipmentCount: allResults.length,
        streamingKpis: {
          dimFlaggedCount,
          disputeCandidates,
          estRecoverable: parseFloat(estRecoverable.toFixed(2)),
        },
        results: [...allResults],
      }));
    });
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  setUploadState({
    status: 'complete',
    filename,
    shipmentCount: allResults.length,
    totalCount,
    analysisTimeMs: Math.round(performance.now() - startTime),
    results: allResults,
    errorMessage: null,
    streamingKpis: null,
  });
}

export default function App() {
  const [activePage, setActivePage] = useState<PageId>('overview');
  const [uploadState, setUploadState] = useState<UploadState>(INITIAL_UPLOAD_STATE);
  const [serverStatus, setServerStatus] = useState<'checking' | 'warming' | 'ready'>('checking');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setServerStatus('warming');
    }, 3000);

    fetch(`${BASE_URL}/health`)
      .then(() => { clearTimeout(timer); if (!cancelled) setServerStatus('ready'); })
      .catch(() => { clearTimeout(timer); if (!cancelled) setServerStatus('ready'); });

    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const handleUpload = async (file: File): Promise<void> => {
    setUploadState({
      status: 'uploading',
      filename: file.name,
      shipmentCount: null,
      totalCount: null,
      analysisTimeMs: null,
      results: null,
      errorMessage: null,
      streamingKpis: null,
    });

    const startTime = performance.now();

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${BASE_URL}/analyze/stream`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok || !response.body) {
        const errorBody = await response.json().catch(() => ({ detail: 'Upload failed' }));
        setUploadState({
          status: 'error',
          filename: file.name,
          shipmentCount: null,
          totalCount: null,
          analysisTimeMs: null,
          results: null,
          errorMessage: errorBody.detail ?? `Server error ${response.status}`,
          streamingKpis: null,
        });
        return;
      }

      await consumeNdjsonStream(response, file.name, startTime, setUploadState);
    } catch (e) {
      setUploadState({
        status: 'error',
        filename: file.name,
        shipmentCount: null,
        totalCount: null,
        analysisTimeMs: null,
        results: null,
        errorMessage: e instanceof Error ? e.message : 'Could not reach the backend. Is the API server running on port 8000?',
        streamingKpis: null,
      });
    }
  };

  const handleDemoLoad = async (): Promise<void> => {
    setUploadState({
      status: 'uploading',
      filename: 'sample-invoice.csv',
      shipmentCount: null,
      totalCount: null,
      analysisTimeMs: null,
      results: null,
      errorMessage: null,
      streamingKpis: null,
    });

    const startTime = performance.now();

    try {
      const response = await fetch(`${BASE_URL}/demo/stream`);

      if (!response.ok || !response.body) {
        const errorBody = await response.json().catch(() => ({ detail: 'Demo load failed' }));
        setUploadState({
          status: 'error',
          filename: 'sample-invoice.csv',
          shipmentCount: null,
          totalCount: null,
          analysisTimeMs: null,
          results: null,
          errorMessage: errorBody.detail ?? `Server error ${response.status}`,
          streamingKpis: null,
        });
        return;
      }

      await consumeNdjsonStream(response, 'sample-invoice.csv', startTime, setUploadState);
    } catch (e) {
      setUploadState({
        status: 'error',
        filename: 'sample-invoice.csv',
        shipmentCount: null,
        totalCount: null,
        analysisTimeMs: null,
        results: null,
        errorMessage: e instanceof Error ? e.message : 'Could not reach the backend. Is the API server running on port 8000?',
        streamingKpis: null,
      });
    }
  };

  const renderPage = () => {
    switch (activePage) {
      case 'overview':
        return <OverviewPage uploadState={uploadState} onUpload={handleUpload} onDemoLoad={handleDemoLoad} />;
      case 'anomalies':
        return <AnomaliesPage uploadState={uploadState} />;
      case 'by-zone':
        return <ByZonePage uploadState={uploadState} />;
      case 'by-sku':
        return <BySkuPage uploadState={uploadState} />;
      case 'trends':
        return <TrendsPage uploadState={uploadState} />;
      case 'export':
        return <ExportPage uploadState={uploadState} />;
      default:
        return null;
    }
  };

  return (
    <>
      {serverStatus === 'warming' && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2.5 bg-amber-950/95 border-b border-amber-800/50 px-4 py-2.5 backdrop-blur-sm"
        >
          <svg
            className="w-3.5 h-3.5 animate-spin shrink-0 text-amber-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-xs text-amber-300">
            Server warming up after inactivity — this can take up to 60 seconds. The demo will start automatically once ready.
          </p>
        </div>
      )}
      <MainLayout activePage={activePage} onNavigate={setActivePage}>
        {renderPage()}
      </MainLayout>
    </>
  );
}
