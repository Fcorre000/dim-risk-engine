import { useEffect, useRef, useState } from 'react';

/**
 * Measure an element's content box so SVG charts draw at real pixel size
 * (text stays 12px instead of scaling with a viewBox).
 */
export function useElementWidth<T extends HTMLElement>(fallback = 600, fallbackHeight = 0) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: fallback, h: fallbackHeight });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setSize({ w: el.clientWidth || fallback, h: el.clientHeight || fallbackHeight });
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback, fallbackHeight]);

  return [ref, size.w, size.h] as const;
}
