import type { ReactNode } from 'react';
import type { PageId, UploadState } from '../../types/api';
import TopBar from './TopBar';

interface MainLayoutProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  uploadState: UploadState;
  children: ReactNode;
}

export default function MainLayout({ activePage, onNavigate, uploadState, children }: MainLayoutProps) {
  return (
    <div className="mx-auto min-h-screen max-w-[1440px] px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <TopBar activePage={activePage} onNavigate={onNavigate} uploadState={uploadState} />
      <main className="mt-8 min-w-0">{children}</main>
      <footer className="meta mt-12 flex flex-col gap-1 px-1 sm:flex-row sm:justify-between">
        <span>
          Models: calibrated XGBoost DIM classifier (AUC 0.999) · conformal charge regressor (R² 0.888,
          MAE $2.77, 95% interval covers 94.3% of held-out bills) · IsolationForest + autoencoder anomaly score.
        </span>
        <span className="flex-none">Charges in USD · dimensions in cm</span>
      </footer>
    </div>
  );
}
