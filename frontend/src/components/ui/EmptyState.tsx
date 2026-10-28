import type { ReactNode } from 'react';
import Icon from './Icon';

interface EmptyStateProps {
  children: ReactNode;
  /** When set, shows a button that takes the user to the upload on Overview. */
  onGoToOverview?: () => void;
}

/** An empty block keeps its frame and says, in one sentence, what fills it. */
export default function EmptyState({ children, onGoToOverview }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-4 px-[22px] py-10 sm:flex-row sm:items-center sm:justify-between">
      <p style={{ color: 'var(--muted)' }}>{children}</p>
      {onGoToOverview && (
        <button type="button" className="btn btn-ghost" onClick={onGoToOverview}>
          Upload an invoice
          <Icon name="arrowRight" size={16} />
        </button>
      )}
    </div>
  );
}
