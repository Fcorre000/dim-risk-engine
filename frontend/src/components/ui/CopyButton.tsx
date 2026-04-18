import { useState, useCallback } from 'react';
import type { ShipmentResult } from '../../types/api';
import { formatDollars } from '../../lib/metrics';

interface CopyButtonProps {
  text: string;
  label: string;
}

const TSV_HEADER = 'Tracking #\tService\tDims\tWeight\tZone\tActual\tPredicted Low\tPredicted High\tGap\tFlag\tConfidence';

function rowToTsv(r: ShipmentResult): string {
  const gap = r.actual_net_charge - r.predicted_net_charge_high;
  const flag = r.dim_anomaly ?? r.cost_anomaly ?? '';
  const conf = r.dim_anomaly === 'Unexpected' && r.dim_confidence != null
    ? `${Math.round(r.dim_confidence * 100)}%`
    : r.cost_confidence ?? '';
  return [
    r.tracking_number ?? '',
    r.service_type,
    `${r.dim_length}x${r.dim_width}x${r.dim_height}`,
    `${r.weight_lbs} lbs`,
    r.zone,
    formatDollars(r.actual_net_charge),
    formatDollars(r.predicted_net_charge_low),
    formatDollars(r.predicted_net_charge_high),
    `${gap >= 0 ? '+' : ''}${formatDollars(gap)}`,
    flag,
    conf,
  ].join('\t');
}

export function rowsToTsv(rows: ShipmentResult[]): string {
  return [TSV_HEADER, ...rows.map(rowToTsv)].join('\n');
}

const BASE_CLS =
  'inline-flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-widest uppercase border transition-colors duration-150 cursor-pointer';

export function CopyTableButton({ rows }: { rows: ShipmentResult[] }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(rowsToTsv(rows)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [rows]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={BASE_CLS}
      style={{
        borderColor: 'var(--border-2)',
        background: 'transparent',
        color: copied ? 'var(--accent)' : 'var(--text)',
        textShadow: copied ? 'var(--glow)' : 'none',
      }}
      title={`Copy all ${rows.length} rows as tab-separated text`}
    >
      {copied ? `✓ COPIED ${rows.length}` : `⧉ COPY ALL (${rows.length})`}
    </button>
  );
}

export default function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={BASE_CLS}
      style={{
        borderColor: 'var(--border-2)',
        background: 'transparent',
        color: copied ? 'var(--accent)' : 'var(--text)',
        textShadow: copied ? 'var(--glow)' : 'none',
      }}
      title={`Copy ${label}`}
    >
      {copied ? '✓' : '⧉'} <span>{label}</span>
    </button>
  );
}
