/**
 * The chat's diagram theme: Mermaid's `base` theme fed with the design system's colours
 * (src/index.css: surfaces, text, primary indigo, status colours), not Mermaid's defaults.
 *
 * Hex values, not `var(--…)`: Mermaid derives shades from them (khroma), which needs a
 * colour it can parse (the app's tokens may be `oklch`).
 *
 * The app is dark today; a light palette is ready for when `<html>` carries
 * `data-theme="light"` (or the `light` class).
 */
import type { MermaidConfig } from 'mermaid'

export type ThemeMode = 'dark' | 'light'

/** The chat's theme: light only when the document says so, the app's dark otherwise. */
export function themeMode(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): ThemeMode {
  const html = doc?.documentElement
  return html && (html.dataset.theme === 'light' || html.classList.contains('light')) ? 'light' : 'dark'
}

/** Categorical series (pie slices, git branches, mindmap levels): indigo first, then the status hues. */
const SERIES = ['#6366f1', '#38bdf8', '#34d399', '#f59e0b', '#f472b6', '#a78bfa', '#2dd4bf', '#fb923c']

const PALETTE = {
  dark: {
    surface: '#1a1d27', // --color-surface-raised
    node: '#232733', // --color-surface-overlay
    alt: '#2a2e3d', // --color-surface-highlight
    border: '#818cf8', // --color-primary-light
    line: '#94a3b8', // --text-secondary
    muted: '#64748b', // --text-tertiary
    text: '#f1f5f9', // --text-primary
    grid: '#2a2e3d',
    note: '#2a2a1f',
    noteBorder: '#f59e0b', // --color-warning
    crit: '#ef4444', // --color-error
    done: '#166534',
  },
  light: {
    surface: '#ffffff',
    node: '#eef2ff',
    alt: '#f1f5f9',
    border: '#6366f1',
    line: '#64748b',
    muted: '#94a3b8',
    text: '#0f172a',
    grid: '#e2e8f0',
    note: '#fef3c7',
    noteBorder: '#d97706',
    crit: '#dc2626',
    done: '#bbf7d0',
  },
} as const

export function themeVariables(mode: ThemeMode): Record<string, string | boolean> {
  const p = PALETTE[mode]
  const series: Record<string, string> = {}
  SERIES.forEach((c, i) => {
    series[`pie${i + 1}`] = c
    series[`git${i}`] = c
    series[`cScale${i}`] = c
    series[`fillType${i}`] = c
  })
  return {
    darkMode: mode === 'dark',
    background: p.surface,
    fontFamily: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
    fontSize: '13px',
    primaryColor: p.node,
    primaryTextColor: p.text,
    primaryBorderColor: p.border,
    secondaryColor: p.alt,
    secondaryTextColor: p.text,
    secondaryBorderColor: p.line,
    tertiaryColor: p.surface,
    tertiaryTextColor: p.text,
    tertiaryBorderColor: p.muted,
    mainBkg: p.node,
    nodeBorder: p.border,
    nodeTextColor: p.text,
    textColor: p.text,
    titleColor: p.text,
    lineColor: p.line,
    clusterBkg: p.surface,
    clusterBorder: p.muted,
    edgeLabelBackground: p.surface,
    noteBkgColor: p.note,
    noteTextColor: p.text,
    noteBorderColor: p.noteBorder,
    actorBkg: p.node,
    actorBorder: p.border,
    actorTextColor: p.text,
    actorLineColor: p.line,
    signalColor: p.line,
    signalTextColor: p.text,
    labelBoxBkgColor: p.alt,
    labelBoxBorderColor: p.border,
    labelTextColor: p.text,
    loopTextColor: p.text,
    activationBkgColor: p.alt,
    activationBorderColor: p.border,
    sectionBkgColor: p.alt,
    altSectionBkgColor: p.surface,
    sectionBkgColor2: p.node,
    taskBkgColor: SERIES[0]!,
    taskBorderColor: p.border,
    taskTextColor: '#ffffff',
    taskTextLightColor: p.text,
    taskTextOutsideColor: p.text,
    taskTextDarkColor: p.text,
    activeTaskBkgColor: SERIES[1]!,
    activeTaskBorderColor: p.border,
    doneTaskBkgColor: p.done,
    doneTaskBorderColor: p.line,
    critBkgColor: p.crit,
    critBorderColor: p.crit,
    gridColor: p.grid,
    todayLineColor: p.noteBorder,
    pieTitleTextColor: p.text,
    pieSectionTextColor: '#ffffff',
    pieLegendTextColor: p.text,
    pieStrokeColor: p.surface,
    pieOuterStrokeColor: p.muted,
    errorBkgColor: p.crit,
    errorTextColor: p.text,
    ...series,
  }
}

/**
 * Everything a diagram cannot change from inside (`%%{init}%%`, front matter `config:`):
 * the security settings, and the theme (no `themeCSS`, no foreign fonts, no HTML labels).
 */
const SECURE_KEYS = [
  'secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'suppressErrorRendering',
  'theme', 'themeVariables', 'themeCSS', 'darkMode', 'fontFamily', 'altFontFamily', 'htmlLabels',
  'dompurifyConfig', 'arrowMarkerAbsolute', 'deterministicIds', 'deterministicIDSeed', 'legacyMathML', 'forceLegacyMathML',
]

export function mermaidConfig(mode: ThemeMode, maxTextSize: number): MermaidConfig {
  return {
    startOnLoad: false,
    // No HTML in labels, no click handlers, no scripts: Mermaid's own sanitizing on top of ours.
    securityLevel: 'strict',
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    secure: SECURE_KEYS,
    maxTextSize,
    maxEdges: 500,
    // Errors come back to us (a refusal with Mermaid's reason), never an error SVG in the page.
    suppressErrorRendering: true,
    logLevel: 'fatal',
    theme: 'base',
    themeVariables: themeVariables(mode),
    fontFamily: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
  }
}
