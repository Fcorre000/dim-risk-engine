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
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalCount: number | null = null;
      const allResults: import('./types/api').ShipmentResult[] = [];

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
              // Immediately surface totalCount so the bar can start filling
              setUploadState(prev => ({ ...prev, totalCount }));
              continue;
            }
            allResults.push(obj);
            // Update UI every 200 rows so the progress bar feels responsive
            if (allResults.length % 200 === 0) {
              setUploadState(prev => ({
                ...prev,
                shipmentCount: allResults.length,
                results: [...allResults],
              }));
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
