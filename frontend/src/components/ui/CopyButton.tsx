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
    r.tracking_number,
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

export function CopyTableButton({ rows }: { rows: ShipmentResult[] }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(rowsToTsv(rows)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [rows]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-700/60 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      title={`Copy all ${rows.length} rows as tab-separated text`}
    >
      {copied ? (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
          </svg>
          <span>Copied {rows.length} rows</span>
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
          </svg>
          <span>Copy All ({rows.length})</span>
        </>
      )}
    </button>
  );
}

export default function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-700/60 hover:bg-gray-700 text-gray-300 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      title={`Copy ${label}`}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
          <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
          <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
        </svg>
      )}
      <span>{label}</span>
    </button>
  );
}
