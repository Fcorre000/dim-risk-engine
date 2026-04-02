import type { UploadState } from '../types/api';

interface OverviewPageProps {
  uploadState: UploadState;
  onUpload: (file: File) => Promise<void>;
}

export default function OverviewPage({ uploadState, onUpload }: OverviewPageProps) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Overview</h1>
        <p className="text-gray-500 text-sm mt-1">Upload an invoice to analyze DIM billing anomalies</p>
      </div>
      {/* Upload component slot — added in 02-03 */}
      {/* KPI cards slot — added in 02-04 */}
      {/* Charts slot — added in 02-04, 02-05 */}
      {/* Anomaly table slot — added in 02-05 */}
    </div>
  );
}
