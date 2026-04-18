import type { PageId, UploadState } from '../../types/api';

interface NavItem {
  id: PageId;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview',  label: 'Overview' },
  { id: 'anomalies', label: 'Anomalies' },
  { id: 'by-zone',   label: 'By Zone' },
  { id: 'by-state',  label: 'By State' },
  { id: 'trends',    label: 'Trends' },
  { id: 'export',    label: 'Export' },
];

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  uploadState: UploadState;
}

function KVRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span style={{ color: 'var(--muted)' }}>{k}</span>
      <span className="tabular-nums" style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>{v}</span>
    </div>
  );
}

function fmtInt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}

export default function Sidebar({ activePage, onNavigate, uploadState }: SidebarProps) {
  const sk = uploadState.streamingKpis;
  const shipmentCount = uploadState.shipmentCount ?? 0;

  // Derive live ingest values — prefer streaming KPIs mid-upload, final counts otherwise
  const rows = shipmentCount;
  const flagged = sk?.dimFlaggedCount ?? (uploadState.results?.filter(r => r.dim_flag_probability > 0.5).length ?? 0);
  const dispute = sk?.disputeCandidates ?? (uploadState.results?.filter(r => r.dim_anomaly === 'Unexpected').length ?? 0);

  return (
    <aside
      aria-label="Main navigation"
      className="w-52 border-r p-3 shrink-0 font-jb"
      style={{ borderColor: 'var(--border)', background: 'var(--bg)', minHeight: 'calc(100vh - 36px)' }}
    >
      {/* Channels / nav */}
      <div className="text-[9px] tracking-[0.3em] mb-3" style={{ color: 'var(--muted)' }}>&gt; CHANNELS</div>
      <ul className="space-y-0.5">
        {NAV_ITEMS.map((item, i) => {
          const on = activePage === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={on ? 'page' : undefined}
                className="w-full text-left text-[12px] py-1.5 px-2 flex items-center gap-3 border-l-2 transition-colors duration-150 cursor-pointer"
                style={{
                  borderColor: on ? 'var(--accent)' : 'transparent',
                  background: on ? 'var(--row-hov)' : 'transparent',
                  color: on ? 'var(--accent)' : 'var(--text)',
                  textShadow: on ? 'var(--glow)' : 'none',
                  opacity: on ? 1 : 0.75,
                }}
              >
                <span className="tabular-nums" style={{ color: on ? 'var(--accent)' : 'var(--muted)' }}>
                  {String(i).padStart(2, '0')}
                </span>
                <span className="uppercase tracking-wider">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Model */}
      <div className="mt-8 text-[9px] tracking-[0.3em] mb-3" style={{ color: 'var(--muted)' }}>&gt; MODEL</div>
      <div className="space-y-1 text-[10px]">
        <KVRow k="cls.auc"   v="0.997" />
        <KVRow k="reg.r2"    v="0.866" />
        <KVRow k="reg.mae"   v="$3.88" />
        <KVRow k="n.predict" v={fmtInt(rows)} />
      </div>

      {/* Ingest */}
      <div className="mt-8 text-[9px] tracking-[0.3em] mb-3" style={{ color: 'var(--muted)' }}>&gt; INGEST</div>
      <div className="space-y-1 text-[10px]">
        <KVRow k="rows"    v={fmtInt(rows)} />
        <KVRow k="flagged" v={fmtInt(flagged)} />
        <KVRow k="dispute" v={fmtInt(dispute)} />
      </div>
    </aside>
  );
}
