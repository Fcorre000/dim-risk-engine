import { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import type { ShipmentResult } from '../../types/api';
import { formatDollars } from '../../lib/metrics';

interface ActualVsPredictedChartProps {
  data: ShipmentResult[];
}

interface ScatterPoint {
  predicted: number;
  actual: number;
  tracking: string;
  service: string;
  zone: string;
  gap: number;
  color: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const point: ScatterPoint = payload[0]?.payload;
  if (!point) return null;
  const gap = point.gap;
  return (
    <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-gray-100 mb-1">{point.tracking}</p>
      <p className="text-gray-400">{point.service} &middot; Zone {point.zone}</p>
      <div className="mt-1.5 space-y-0.5">
        <p className="text-blue-400">Actual: {formatDollars(point.actual)}</p>
        <p className="text-gray-400">Predicted: {formatDollars(point.predicted)}</p>
        <p className={`font-medium ${gap > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
          Gap: {gap >= 0 ? '+' : ''}{formatDollars(gap)}
        </p>
      </div>
    </div>
  );
}

const LEGEND_ITEMS = [
  { color: '#f43f5e', label: 'Unexpected (DIM anomaly)' },
  { color: '#f59e0b', label: 'Review (cost anomaly)' },
  { color: '#3b82f6', label: 'Normal' },
];

export default function ActualVsPredictedChart({ data }: ActualVsPredictedChartProps) {
  const scatterData = useMemo<ScatterPoint[]>(() =>
    data.map((r) => ({
      predicted: r.predicted_net_charge,
      actual: r.actual_net_charge,
      tracking: r.tracking_number,
      service: r.service_type,
      zone: r.zone,
      gap: r.actual_net_charge - r.predicted_net_charge,
      color:
        r.dim_anomaly === 'Unexpected' ? '#f43f5e'
        : r.cost_anomaly === 'Review' ? '#f59e0b'
        : '#3b82f6',
    })),
    [data],
  );

  const maxVal = useMemo(() => {
    if (scatterData.length === 0) return 100;
    const max = Math.max(...scatterData.map((d) => Math.max(d.actual, d.predicted)));
    return Math.ceil(max * 1.1);
  }, [scatterData]);

  if (data.length === 0) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-10 flex items-center justify-center">
        <p className="text-sm text-gray-500">Upload an invoice to see actual vs predicted charges</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-5">
      <h2 className="text-sm font-semibold text-gray-100 mb-1">Actual vs Predicted — Per Shipment</h2>
      <p className="text-xs text-gray-500 mb-4">
        Each dot is one shipment. Dots above the diagonal were charged more than predicted.
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            type="number"
            dataKey="predicted"
            name="Predicted"
            domain={[0, maxVal]}
            tickFormatter={(v) => `$${v}`}
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
            label={{ value: 'Model Predicted ($)', position: 'insideBottom', offset: -4, fill: '#6B7280', fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="actual"
            name="Actual"
            domain={[0, maxVal]}
            tickFormatter={(v) => `$${v}`}
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'FedEx Billed ($)', angle: -90, position: 'insideLeft', offset: 4, fill: '#6B7280', fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#4b5563' }} />
          <ReferenceLine
            segment={[{ x: 0, y: 0 }, { x: maxVal, y: maxVal }]}
            stroke="#4b5563"
            strokeDasharray="6 3"
            strokeWidth={1.5}
          />
          <Scatter data={scatterData} isAnimationActive={false}>
            {scatterData.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} fillOpacity={0.7} r={4} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex items-center justify-center gap-5 mt-3">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
