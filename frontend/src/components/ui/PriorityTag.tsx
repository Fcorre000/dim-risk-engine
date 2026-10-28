import type { ShipmentResult } from '../../types/api';

/**
 * The flag cell: review_priority as a pale pill, with the calibrated
 * anomaly_score as the percentage on flagged rows.
 */
export default function PriorityTag({ row }: { row: Pick<ShipmentResult, 'review_priority' | 'anomaly_score'> }) {
  const score = row.anomaly_score != null ? `${Math.round(row.anomaly_score * 100)}%` : null;
  if (row.review_priority === 'high') {
    return (
      <span className="pill pill-over" title="Two or more audit signals fired">
        High{score && <span className="opacity-75">{score}</span>}
      </span>
    );
  }
  if (row.review_priority === 'medium') {
    return (
      <span className="pill pill-warn" title="One audit signal fired">
        Medium{score && <span className="opacity-75">{score}</span>}
      </span>
    );
  }
  return <span className="pill pill-neutral">Clear</span>;
}
