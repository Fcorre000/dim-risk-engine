import { useState, useMemo } from 'react';
import type { PageId, UploadState } from '../types/api';
import { computeGranularTrendsData, pickGranularity, type TrendsGranularity } from '../lib/metrics';
import TrendsChart from '../components/charts/TrendsChart';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';

interface TrendsPageProps {
  uploadState: UploadState;
  onNavigate: (page: PageId) => void;
}

const GRAINS: { id: TrendsGranularity; label: string }[] = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

export default function TrendsPage({ uploadState, onNavigate }: TrendsPageProps) {
  const results = useMemo(() => uploadState.results ?? [], [uploadState.results]);
  const autoGrain = useMemo(() => pickGranularity(results), [results]);
  const [choice, setChoice] = useState<TrendsGranularity | null>(null);
  const granularity = choice ?? autoGrain;
  const trendsData = useMemo(
    () => computeGranularTrendsData(results, granularity),
    [results, granularity],
  );

  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Trends" sub="Billed against the model and high-priority shipments over time." />
        <section className="card">
          <EmptyState onGoToOverview={() => onNavigate('overview')}>
            No invoice scored yet. Trends appear here once one is.
          </EmptyState>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trends"
        sub={<span className="tnum">{results.length.toLocaleString()} shipments, grouped by {granularity}</span>}
        actions={
          <div className="seg" role="group" aria-label="Group by">
            {GRAINS.map((g) => (
              <button key={g.id} type="button" aria-pressed={granularity === g.id} onClick={() => setChoice(g.id)}>
                {g.label}
              </button>
            ))}
          </div>
        }
      />
      <TrendsChart data={trendsData} />
    </div>
  );
}
