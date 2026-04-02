import { useState } from 'react';
import type { PageId, UploadState } from './types/api';
import MainLayout from './components/layout/MainLayout';
import OverviewPage from './pages/OverviewPage';
import PlaceholderPage from './pages/PlaceholderPage';

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

  // onUpload will be implemented in 02-03 with real API call
  const handleUpload = async (_file: File): Promise<void> => {
    // Placeholder — replaced in 02-03
    setUploadState((prev) => ({ ...prev, status: 'uploading' }));
  };

  const renderPage = () => {
    switch (activePage) {
      case 'overview':
        return <OverviewPage uploadState={uploadState} onUpload={handleUpload} />;
      case 'anomalies':
        return <PlaceholderPage title="Anomalies" />;
      case 'by-zone':
        return <PlaceholderPage title="By Zone" />;
      case 'by-sku':
        return <PlaceholderPage title="By SKU" />;
      case 'trends':
        return <PlaceholderPage title="Trends" />;
      case 'export':
        return <PlaceholderPage title="Export" />;
      default:
        return <PlaceholderPage title="Page Not Found" />;
    }
  };

  return (
    <MainLayout activePage={activePage} onNavigate={setActivePage}>
      {renderPage()}
    </MainLayout>
  );
}
