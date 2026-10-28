import { useMemo } from 'react';
import type { PageId, UploadState } from '../../types/api';
import { useTheme } from '../../theme/ThemeContext';
import Icon, { Mark } from '../ui/Icon';

interface NavItem {
  id: PageId;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview',  label: 'Overview' },
  { id: 'anomalies', label: 'Disputes' },
  { id: 'by-zone',   label: 'Zones' },
  { id: 'by-state',  label: 'States' },
  { id: 'trends',    label: 'Trends' },
  { id: 'export',    label: 'Export' },
];

interface TopBarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  uploadState: UploadState;
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="icon-btn"
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
    </button>
  );
}

function InvoiceChip({ uploadState }: { uploadState: UploadState }) {
  if (!uploadState.filename) return null;
  const rows = uploadState.shipmentCount;
  const streaming = uploadState.status === 'uploading';
  return (
    <div className="hidden min-w-0 items-center gap-3 md:flex" title={uploadState.filename}>
      <span
        className="flex h-9 w-9 flex-none items-center justify-center rounded-full"
        style={{ background: 'var(--raised)', color: 'var(--muted)' }}
      >
        <Icon name="file" size={16} />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="max-w-[180px] truncate text-[14px]" style={{ color: 'var(--ink)' }}>
          {uploadState.filename}
        </p>
        <p className="meta tnum">
          {uploadState.status === 'error'
            ? 'Failed to analyse'
            : rows != null
            ? `${rows.toLocaleString()} shipments${streaming ? ' so far' : ''}`
            : 'Reading…'}
        </p>
      </div>
    </div>
  );
}

export default function TopBar({ activePage, onNavigate, uploadState }: TopBarProps) {
  const finalHigh = useMemo(
    () => uploadState.results?.reduce((n, r) => n + (r.review_priority === 'high' ? 1 : 0), 0) ?? 0,
    [uploadState.results],
  );
  const high = uploadState.streamingKpis?.disputeCandidates ?? finalHigh;

  return (
    <header className="card flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-5">
      <button
        type="button"
        onClick={() => onNavigate('overview')}
        className="flex items-center gap-2.5 rounded-full pr-2"
        aria-label="DimRisk, go to overview"
      >
        <Mark />
        <span className="text-[20px] font-semibold tracking-[-0.02em]" style={{ color: 'var(--ink)' }}>
          dimrisk
        </span>
      </button>

      <nav
        aria-label="Main navigation"
        className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto px-1 lg:order-none lg:mx-auto lg:w-auto"
      >
        {NAV_ITEMS.map((item) => {
          const on = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={on ? 'page' : undefined}
              className="nav-link"
            >
              {item.label}
              {item.id === 'anomalies' && high > 0 && (
                <span
                  className="tnum rounded-full px-1.5 text-[12px] leading-5"
                  style={{ background: 'var(--over-bg)', color: 'var(--over)' }}
                  aria-label={`${high} high priority`}
                >
                  {high.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-3 lg:ml-0">
        <InvoiceChip uploadState={uploadState} />
        <span className="hidden h-6 w-px md:block" style={{ background: 'var(--line-strong)' }} aria-hidden="true" />
        <ThemeToggle />
      </div>
    </header>
  );
}
