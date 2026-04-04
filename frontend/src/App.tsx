import { useState } from 'react';
import { BASE_URL } from './api';
import type { PageId, UploadState } from './types/api';
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

export default function App() {
  const [activePage, setActivePage] = useState<PageId>('overview');
  const [uploadState, setUploadState] = useState<UploadState>(INITIAL_UPLOAD_STATE);

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

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalCount: number | null = null;
      const allResults: import('./types/api').ShipmentResult[] = [];

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
            allResults.push(obj);

            // Update incremental KPI counters (O(1) per row)
            if (obj.dim_flag_probability > 0.5) dimFlaggedCount++;
            if (obj.dim_anomaly === 'Unexpected') {
              disputeCandidates++;
              const gap = obj.actual_net_charge - obj.predicted_net_charge;
              if (gap > 0) estRecoverable += gap;
            }

            const len = allResults.length;

            // Every 50 rows: update progress bar + streaming KPIs (cheap — just numbers)
            if (len % 50 === 0) {
              const kpis = { dimFlaggedCount, disputeCandidates, estRecoverable: parseFloat(estRecoverable.toFixed(2)) };
              // Flush full results array every 500 rows for charts; KPIs update every 50
              const flushResults = len % 500 === 0;
              setUploadState(prev => ({
                ...prev,
                shipmentCount: len,
                streamingKpis: kpis,
                ...(flushResults ? { results: [...allResults] } : {}),
              }));

              // Yield to browser so React can paint progress bar + KPIs
              await new Promise(resolve => setTimeout(resolve, 0));
            }
          } catch { /* skip malformed lines */ }
        }
      }

      setUploadState({
        status: 'complete',
        filename: file.name,
        shipmentCount: allResults.length,
        totalCount,
        analysisTimeMs: Math.round(performance.now() - startTime),
        results: allResults,
        errorMessage: null,
        streamingKpis: null,  // clear — OverviewPage computes from final results
      });
    } catch {
      setUploadState({
        status: 'error',
        filename: file.name,
        shipmentCount: null,
        totalCount: null,
        analysisTimeMs: null,
        results: null,
        errorMessage: 'Could not reach the backend. Is the API server running on port 8000?',
        streamingKpis: null,
      });
    }
  };

  const renderPage = () => {
    switch (activePage) {
      case 'overview':
        return <OverviewPage uploadState={uploadState} onUpload={handleUpload} />;
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
    <MainLayout activePage={activePage} onNavigate={setActivePage}>
      {renderPage()}
    </MainLayout>
  );
}
