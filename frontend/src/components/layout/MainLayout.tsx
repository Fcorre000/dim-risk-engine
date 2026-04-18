import type { ReactNode } from 'react';
import type { PageId, UploadState } from '../../types/api';
import Sidebar from './Sidebar';
import OpsHeader from './OpsHeader';

interface MainLayoutProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  uploadState: UploadState;
  children: ReactNode;
}

export default function MainLayout({ activePage, onNavigate, uploadState, children }: MainLayoutProps) {
  return (
    <div
      id="ops-root"
      className="min-h-screen font-jb"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      <OpsHeader />
      <div className="flex">
        <div className="hidden lg:flex">
          <Sidebar activePage={activePage} onNavigate={onNavigate} uploadState={uploadState} />
        </div>
        <main className="flex-1 p-6 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
