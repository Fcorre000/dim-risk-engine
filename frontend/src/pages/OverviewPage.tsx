import type { UploadState } from '../types/api';
import UploadZone from '../components/upload/UploadZone';
import UploadStatusCard from '../components/upload/UploadStatusCard';

interface OverviewPageProps {
  uploadState: UploadState;
  onUpload: (file: File) => Promise<void>;
}

export default function OverviewPage({ uploadState, onUpload }: OverviewPageProps) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Overview</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload a FedEx invoice to analyze DIM billing anomalies
        </p>
      </div>

      <UploadZone uploadState={uploadState} onUpload={onUpload} />

      <UploadStatusCard uploadState={uploadState} />

      {/* KPI cards slot — added in 02-04 */}
      {/* Zone chart slot — added in 02-04 */}
      {/* Actual vs predicted chart slot — added in 02-05 */}
      {/* Anomaly table slot — added in 02-05 */}
    </div>
  );
}
