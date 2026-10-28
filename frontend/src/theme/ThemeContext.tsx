import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem('dre-theme');
    if (v === 'dark' || v === 'light') return v;
  } catch { /* storage blocked — fall through to default */ }
  return 'dark';
}

// Tokens live in index.css under :root[data-theme=…]. The attribute is set
// before React re-renders so useCssVars reads the new palette, not the old one.
function applyTheme(t: ThemeMode) {
  document.documentElement.dataset.theme = t;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const t = readStoredTheme();
    applyTheme(t);
    return t;
  });

  useEffect(() => {
    try { localStorage.setItem('dre-theme', theme); } catch { /* noop */ }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => {
    const setTheme = (t: ThemeMode) => { applyTheme(t); setThemeState(t); };
    return {
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    };
  }, [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/**
 * Resolve CSS custom properties to their current values. Used where a colour
 * has to be computed in JS (the choropleth interpolates between two tokens).
 * Re-reads whenever the theme changes.
 */
export function useCssVars<T extends string>(names: readonly T[]): Record<T, string> {
  const { theme } = useTheme();
  const key = names.join('|');
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const out = {} as Record<T, string>;
    for (const n of names) out[n] = style.getPropertyValue(n).trim();
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, key]);
}
