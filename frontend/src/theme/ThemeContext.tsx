import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import type { VariantId, ThemeMode } from './variants';
import { VARIANTS, getPalette } from './variants';

interface ThemeContextValue {
  variant: VariantId;
  theme: ThemeMode;
  setVariant: (v: VariantId) => void;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch { /* noop */ }
  return fallback;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [variant, setVariant] = useState<VariantId>(() =>
    readStored<VariantId>('dre-variant', 'console', Object.keys(VARIANTS) as VariantId[]),
  );
  const [theme, setTheme] = useState<ThemeMode>(() =>
    readStored<ThemeMode>('dre-theme', 'dark', ['dark', 'light']),
  );

  useEffect(() => {
    try { localStorage.setItem('dre-variant', variant); } catch { /* noop */ }
  }, [variant]);

  useEffect(() => {
    try { localStorage.setItem('dre-theme', theme); } catch { /* noop */ }
  }, [theme]);

  // Also apply to body so scrollbars and <body> background pick up the palette
  useEffect(() => {
    const palette = getPalette(variant, theme);
    const root = document.body;
    for (const [k, v] of Object.entries(palette)) {
      root.style.setProperty(k, v);
    }
  }, [variant, theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    variant,
    theme,
    setVariant,
    setTheme,
    toggleTheme: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')),
  }), [variant, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

export function usePaletteStyle(): CSSProperties {
  const { variant, theme } = useTheme();
  return getPalette(variant, theme) as unknown as CSSProperties;
}
