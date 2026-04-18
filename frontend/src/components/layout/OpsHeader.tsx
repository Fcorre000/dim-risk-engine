import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { VARIANTS, VARIANT_IDS } from '../../theme/variants';

const SESSION_ID = '0x7F33A';
const INVOICE_ID = 'FEDEX-INV-2026-Q1-7734';

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

function VariantPicker() {
  const { variant, setVariant } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="px-2 py-1 border uppercase tracking-widest text-[10px] cursor-pointer"
        style={{ borderColor: 'var(--border-2)', color: 'var(--text)' }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        SKIN: {VARIANTS[variant].name} ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-64 border z-50 p-1"
          style={{ borderColor: 'var(--border-2)', background: 'var(--panel)' }}
        >
          {VARIANT_IDS.map((id) => {
            const v = VARIANTS[id];
            const on = id === variant;
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => { setVariant(id); setOpen(false); }}
                className="w-full text-left p-2 text-[11px] block cursor-pointer"
                style={{ background: on ? 'var(--row-hov)' : 'transparent', color: 'var(--text)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold uppercase tracking-widest text-[10px]">{v.name}</span>
                  {on && <span className="text-[9px]" style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>ACTIVE</span>}
                </div>
                <div className="opacity-60 text-[10px] mt-0.5 leading-snug normal-case tracking-normal">{v.blurb}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="px-2 py-1 border uppercase tracking-widest text-[10px] flex items-center gap-1.5 cursor-pointer"
      style={{ borderColor: 'var(--border-2)', color: 'var(--text)' }}
      title="Toggle dark/light"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      <span style={{ opacity: theme === 'dark' ? 1 : 0.35 }}>◐</span>
      <span>{theme === 'dark' ? 'DARK' : 'LIGHT'}</span>
    </button>
  );
}

export default function OpsHeader() {
  const { variant } = useTheme();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="border-b px-6 py-2 flex items-center justify-between gap-6 font-jb"
      style={{ borderColor: 'var(--border)', background: 'var(--header)', color: 'var(--text)', fontSize: 11 }}
    >
      <div className="flex items-center gap-6 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-2 h-2" style={{ background: 'var(--accent)', boxShadow: 'var(--glow)' }} />
          <span className="tracking-widest font-semibold" style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>DRE</span>
          <span className="opacity-60">//</span>
          <span className="tracking-widest uppercase opacity-80">{VARIANTS[variant].name}</span>
        </div>
        <span className="opacity-60 hidden md:inline">SESS {SESSION_ID}</span>
        <span className="opacity-60 hidden md:inline">OP dim.reconcile</span>
        <span className="opacity-60 hidden lg:inline">UPLINK stable</span>
      </div>

      <div className="flex items-center gap-5 shrink-0">
        <span className="opacity-70 hidden md:inline">{INVOICE_ID}</span>
        <span className="opacity-70 hidden lg:inline tabular-nums">{formatTimestamp(now)}</span>
        <VariantPicker />
        <ThemeToggle />
      </div>
    </div>
  );
}
