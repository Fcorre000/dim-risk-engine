export type VariantId = 'console' | 'bloomberg' | 'slate' | 'stripe';
export type ThemeMode = 'dark' | 'light';

export interface Palette {
  '--bg': string;
  '--panel': string;
  '--border': string;
  '--border-2': string;
  '--text': string;
  '--muted': string;
  '--accent': string;
  '--warn': string;
  '--crit': string;
  '--header': string;
  '--row-hov': string;
  '--glow': string;
}

export interface VariantDef {
  id: VariantId;
  name: string;
  blurb: string;
  dark: Palette;
  light: Palette;
}

export const VARIANTS: Record<VariantId, VariantDef> = {
  console: {
    id: 'console',
    name: 'Console',
    blurb: 'Green phosphor on near-black. Low chrome, high density.',
    dark: {
      '--bg':       '#050806',
      '--panel':    '#081109',
      '--border':   '#1a3024',
      '--border-2': '#24402e',
      '--text':     '#d8e6d4',
      '--muted':    '#7f9685',
      '--accent':   '#4ade80',
      '--warn':     '#fbbf24',
      '--crit':     '#f87171',
      '--header':   '#081109',
      '--row-hov':  '#0f2016',
      '--glow':     '0 0 6px rgba(74,222,128,0.35)',
    },
    light: {
      '--bg':       '#f4f6f1',
      '--panel':    '#ffffff',
      '--border':   '#d6dccf',
      '--border-2': '#c1c9b8',
      '--text':     '#13231a',
      '--muted':    '#5f7163',
      '--accent':   '#1f7a3b',
      '--warn':     '#a06500',
      '--crit':     '#b3261e',
      '--header':   '#edf0e7',
      '--row-hov':  '#eaefe2',
      '--glow':     'none',
    },
  },
  bloomberg: {
    id: 'bloomberg',
    name: 'Terminal',
    blurb: 'Amber-on-black. Finance-terminal density. Orange criticals.',
    dark: {
      '--bg':       '#0a0805',
      '--panel':    '#141008',
      '--border':   '#33261a',
      '--border-2': '#4a3822',
      '--text':     '#ead7b6',
      '--muted':    '#8a7859',
      '--accent':   '#ffb547',
      '--warn':     '#ff8a3c',
      '--crit':     '#ff4e4e',
      '--header':   '#141008',
      '--row-hov':  '#1e1710',
      '--glow':     'none',
    },
    light: {
      '--bg':       '#faf4e8',
      '--panel':    '#ffffff',
      '--border':   '#e0d6bf',
      '--border-2': '#c8b894',
      '--text':     '#231a0c',
      '--muted':    '#7a6b4f',
      '--accent':   '#a5681a',
      '--warn':     '#c54d17',
      '--crit':     '#b3261e',
      '--header':   '#f3ead6',
      '--row-hov':  '#efe5cf',
      '--glow':     'none',
    },
  },
  slate: {
    id: 'slate',
    name: 'Slate',
    blurb: 'Pragmatic SRE dashboard. Cyan accents, high-contrast slate.',
    dark: {
      '--bg':       '#0b1116',
      '--panel':    '#121a22',
      '--border':   '#22303c',
      '--border-2': '#344455',
      '--text':     '#dbe4ee',
      '--muted':    '#7d8a99',
      '--accent':   '#4cc2ff',
      '--warn':     '#f0b429',
      '--crit':     '#ef6060',
      '--header':   '#121a22',
      '--row-hov':  '#1a2430',
      '--glow':     'none',
    },
    light: {
      '--bg':       '#f0f3f7',
      '--panel':    '#ffffff',
      '--border':   '#d9dfe6',
      '--border-2': '#b8c2cd',
      '--text':     '#0f1821',
      '--muted':    '#56647a',
      '--accent':   '#0a72b8',
      '--warn':     '#9a6500',
      '--crit':     '#b3261e',
      '--header':   '#e8ecf2',
      '--row-hov':  '#e2e8ef',
      '--glow':     'none',
    },
  },
  stripe: {
    id: 'stripe',
    name: 'Graphite',
    blurb: 'Neutral graphite with muted accent. Most conventional.',
    dark: {
      '--bg':       '#0e0f12',
      '--panel':    '#16181c',
      '--border':   '#272a30',
      '--border-2': '#3a3e46',
      '--text':     '#e6e7ea',
      '--muted':    '#8a8d94',
      '--accent':   '#c3a9f7',
      '--warn':     '#f0b429',
      '--crit':     '#ef6060',
      '--header':   '#16181c',
      '--row-hov':  '#1c1f24',
      '--glow':     'none',
    },
    light: {
      '--bg':       '#f5f5f7',
      '--panel':    '#ffffff',
      '--border':   '#e1e2e6',
      '--border-2': '#c4c6cd',
      '--text':     '#15161a',
      '--muted':    '#6a6d76',
      '--accent':   '#6b3fc7',
      '--warn':     '#9a6500',
      '--crit':     '#b3261e',
      '--header':   '#edeef1',
      '--row-hov':  '#e6e7eb',
      '--glow':     'none',
    },
  },
};

export const VARIANT_IDS: VariantId[] = ['console', 'bloomberg', 'slate', 'stripe'];

export function getPalette(variant: VariantId, theme: ThemeMode): Palette {
  return VARIANTS[variant][theme];
}
