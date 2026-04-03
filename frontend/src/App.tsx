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
      analysisTimeMs: null,
      results: null,
      errorMessage: null,
    });

    const startTime = performance.now();

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${BASE_URL}/analyze`, {
        method: 'POST',
        body: formData,
      });

      const elapsed = performance.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ detail: 'Upload failed' }));
        setUploadState({
          status: 'error',
          filename: file.name,
          shipmentCount: null,
          analysisTimeMs: null,
          results: null,
          errorMessage: errorBody.detail ?? `Server error ${response.status}`,
        });
        return;
      }

      const results = await response.json();

      setUploadState({
        status: 'complete',
        filename: file.name,
        shipmentCount: results.length,
        analysisTimeMs: Math.round(elapsed),
        results,
        errorMessage: null,
      });
    } catch {
      setUploadState({
        status: 'error',
        filename: file.name,
        shipmentCount: null,
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
