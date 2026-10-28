import { useState, useCallback } from 'react';
import type { ShipmentResult } from '../../types/api';
import { formatDollars } from '../../lib/metrics';
import { escapeFormula } from '../../lib/export';
import Icon from './Icon';

interface CopyButtonProps {
  text: string;
  label: string;
}

const TSV_HEADER = 'Tracking #\tService\tDims\tWeight\tZone\tActual\tPredicted Low\tPredicted High\tGap\tPriority\tAnomaly Score';

function rowToTsv(r: ShipmentResult): string {
  const gap = r.actual_net_charge - r.charge_upper_95;
  const score = r.anomaly_score != null ? `${Math.round(r.anomaly_score * 100)}%` : '';
  // Paste-target is a spreadsheet cell — same formula-injection guard as CSV.
  return [
    escapeFormula(r.tracking_number ?? ''),
    escapeFormula(r.service_type),
    `${r.dim_length}x${r.dim_width}x${r.dim_height}`,
    `${r.weight_lbs} lbs`,
    escapeFormula(r.zone),
    formatDollars(r.actual_net_charge),
    formatDollars(r.charge_lower_95),
    formatDollars(r.charge_upper_95),
    `${gap >= 0 ? '+' : ''}${formatDollars(gap)}`,
    r.review_priority.toUpperCase(),
    escapeFormula(score),
  ].join('\t');
}

export function rowsToTsv(rows: ShipmentResult[]): string {
  return [TSV_HEADER, ...rows.map(rowToTsv)].join('\n');
}

function useCopied(ms: number) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), ms);
    });
  }, [ms]);
  return { copied, copy };
}

export function CopyTableButton({ rows }: { rows: ShipmentResult[] }) {
  const { copied, copy } = useCopied(1500);
  return (
    <button
      type="button"
      onClick={() => copy(rowsToTsv(rows))}
      disabled={rows.length === 0}
      className="btn btn-ghost btn-sm"
      title={`Copy all ${rows.length} rows as tab-separated text`}
    >
      <Icon name={copied ? 'check' : 'copy'} size={14} style={copied ? { color: 'var(--ok)' } : undefined} />
      {copied ? `Copied ${rows.length.toLocaleString()}` : `Copy all ${rows.length.toLocaleString()}`}
    </button>
  );
}

export default function CopyButton({ text, label }: CopyButtonProps) {
  const { copied, copy } = useCopied(1200);
  return (
    <button
      type="button"
      onClick={() => copy(text)}
      className="btn btn-ghost btn-sm"
      title={`Copy ${label}`}
    >
      <Icon name={copied ? 'check' : 'copy'} size={14} style={copied ? { color: 'var(--ok)' } : undefined} />
      <span>{label}</span>
    </button>
  );
}
