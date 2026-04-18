export type KpiAccent = 'default' | 'accent' | 'warn' | 'crit';

interface KpiCardProps {
  /** Micro-label displayed above the value, e.g. "N.SHIPMENTS". */
  title: string;
  /** Formatted value string. */
  value: string;
  /** Optional caption below the value. */
  subtitle?: string;
  /** Color tone for the value. */
  accent?: KpiAccent;
  /** Sequential register number for the top-right `REG.000` tag. */
  registerIndex?: number;
}

const ACCENT_COLOR: Record<KpiAccent, string> = {
  default: 'var(--text)',
  accent:  'var(--accent)',
  warn:    'var(--warn)',
  crit:    'var(--crit)',
};

export default function KpiCard({
  title,
  value,
  subtitle,
  accent = 'default',
  registerIndex,
}: KpiCardProps) {
  const valueStyle = {
    color: ACCENT_COLOR[accent],
    textShadow: accent === 'accent' ? 'var(--glow)' : 'none',
  };

  return (
    <div
      role="region"
      aria-label={title}
      className="border p-4 relative"
      style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
    >
      <div className="text-[9px] tracking-[0.3em]" style={{ color: 'var(--muted)' }}>
        {title}
      </div>
      <div
        className="mt-2 font-grot text-[30px] leading-none font-semibold tabular-nums"
        style={valueStyle}
      >
        {value}
      </div>
      {subtitle && (
        <div className="mt-2 text-[9px] tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          {subtitle}
        </div>
      )}
      {registerIndex !== undefined && (
        <div
          className="absolute top-1 right-2 text-[9px] tabular-nums"
          style={{ color: 'var(--muted)', opacity: 0.5 }}
        >
          REG.{String(registerIndex).padStart(3, '0')}
        </div>
      )}
    </div>
  );
}
