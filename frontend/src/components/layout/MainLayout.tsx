import type { ReactNode } from 'react';
import type { PageId } from '../../types/api';
import Sidebar from './Sidebar';

interface MainLayoutProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
}

export default function MainLayout({ activePage, onNavigate, children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* Sidebar hidden on mobile, shown on lg+ */}
      <div className="hidden lg:flex">
        <Sidebar activePage={activePage} onNavigate={onNavigate} />
      </div>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
