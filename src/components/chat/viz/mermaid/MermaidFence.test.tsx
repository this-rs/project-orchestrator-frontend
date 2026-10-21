import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Mermaid needs a layout engine (getBBox) that jsdom does not have: the SVG it returns is
// stubbed here; what is tested is everything around it (checks, theme, sanitizing, refusals).
const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(async (src: string) => {
    if (src.includes('BROKEN')) throw new Error('Parse error on line 2: Expecting ARROW, got BROKEN')
    return { diagramType: 'flowchart-v2' }
  }),
  render: vi.fn(async (id: string, src: string) => ({
    svg: src.includes('EVIL')
      ? `<svg id="${id}" xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.example/x.css); #${id} .node{fill:url(https://evil.example/p.png)} #${id} .m{fill:url(#local)}</style>` +
        `<script>alert(1)</script><g onclick="alert(2)"><a href="javascript:alert(3)" transform="translate(5,5)"><text>link</text></a>` +
        `<image href="https://evil.example/track.png"/><foreignObject><div>html</div></foreignObject><use href="https://evil.example/s.svg#x"/>` +
        `<rect style="fill:url(https://evil.example/r.png)" width="10" height="10"/><path marker-end="url(#arrow)" d="M0 0"/></g></svg>`
      : src.includes('EMPTY')
        ? '<script>x</script>'
        : `<svg id="${id}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g class="node"><rect width="10" height="10"/><text>${src.length}</text></g></svg>`,
  })),
}))
vi.mock('mermaid', () => ({ default: mermaidMock }))

import { MarkdownText } from '../../MarkdownText'
import { MermaidFence } from './MermaidFence'
import { parseMermaidFence, mermaidTitle, MERMAID_MAX_CHARS } from './fence'
import { mermaidConfig, themeMode, themeVariables } from './theme'
import MermaidViz from './MermaidViz'
import { renderMermaid } from './render'

const FENCES = { mermaid: MermaidFence }
const md = (body: string) => `The flow:\n\n\`\`\`mermaid\n${body}\n\`\`\`\n\nDone.`

describe('```mermaid in the agent text', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
  })

  it('renders the diagram (lazy chunk) in a viz frame titled by the diagram, the rest of the message still renders', async () => {
    render(<MarkdownText content={md('---\ntitle: Release flow\n---\nflowchart TD\n  A --> B')} fences={FENCES} />)
    const svg = await screen.findByTestId('mermaid-diagram')
    expect(svg.querySelector('svg rect')).toBeTruthy()
    expect(screen.getByText('Release flow')).toBeTruthy()
    expect(screen.getByText('Done.')).toBeTruthy()
  })

  it('a diagram without title is titled "Diagram"', async () => {
    render(<MarkdownText content={md('sequenceDiagram\n  A->>B: hi')} fences={FENCES} />)
    await screen.findByTestId('mermaid-diagram')
    expect(screen.getByText('Diagram')).toBeTruthy()
  })

  it('a diagram Mermaid refuses: Mermaid’s reason and the text, never an error SVG', async () => {
    render(<MarkdownText content={md('flowchart TD\n  A BROKEN B')} fences={FENCES} />)
    const box = await screen.findByTestId('mermaid-refused')
    expect(box.textContent).toMatch(/refused/)
    expect(box.textContent).toMatch(/Expecting ARROW/)
    expect(box.textContent).toContain('A BROKEN B')
    expect(screen.queryByTestId('mermaid-diagram')).toBeNull()
  })

  it('while streaming, an unclosed block is "composing", never a parse error', () => {
    mermaidMock.parse.mockClear()
    render(<MarkdownText content={'Voici :\n\n```mermaid\nflowchart TD\n  A --> BRO'} fences={FENCES} isStreaming />)
    expect(screen.getByTestId('mermaid-loading').textContent).toMatch(/Composing the diagram/)
    expect(screen.queryByTestId('mermaid-refused')).toBeNull()
    expect(mermaidMock.parse).not.toHaveBeenCalled()
  })

  it('while streaming, a block whose closing fence arrived is already drawn', async () => {
    render(<MarkdownText content={md('flowchart LR\n  X --> Y').replace('\n\nDone.', '\n\nAnd now')} fences={FENCES} isStreaming />)
    expect(await screen.findByTestId('mermaid-diagram')).toBeTruthy()
  })

  it('empty and too large blocks are refused before Mermaid loads', () => {
    const big = render(<MermaidFence source={'x'.repeat(MERMAID_MAX_CHARS + 1)} streaming />)
    expect(within(big.container).getByTestId('mermaid-refused').textContent).toMatch(/too large/)
    const empty = render(<MermaidFence source={'   '} />)
    expect(within(empty.container).getByTestId('mermaid-refused').textContent).toMatch(/empty/)
  })

  it('other code blocks, and mermaid without `fences` (notes, tool output), stay code', () => {
    const plain = render(<MarkdownText content={md('flowchart TD\n A-->B')} />)
    expect(plain.container.querySelector('pre code')?.textContent).toContain('A-->B')
    expect(plain.queryByTestId('mermaid-diagram')).toBeNull()
  })
})

describe('Mermaid safety', () => {
  it('strict security, no HTML labels, the chat theme, and all of it locked against %%{init}%%', () => {
    const cfg = mermaidConfig('dark', MERMAID_MAX_CHARS)
    expect(cfg).toMatchObject({ securityLevel: 'strict', htmlLabels: false, flowchart: { htmlLabels: false }, theme: 'base', suppressErrorRendering: true, startOnLoad: false, maxTextSize: MERMAID_MAX_CHARS })
    for (const k of ['securityLevel', 'theme', 'themeVariables', 'themeCSS', 'htmlLabels', 'fontFamily', 'dompurifyConfig', 'maxTextSize']) expect(cfg.secure).toContain(k)
  })

  it('the SVG is sanitized: no script, handler, link, image, foreign HTML, <use>, nor network CSS', async () => {
    const r = await renderMermaid('flowchart TD\n EVIL', 'dark')
    expect(r.ok).toBe(true)
    const svg = r.ok ? r.svg : ''
    expect(svg).not.toMatch(/<script|onclick|<a\b|javascript:|<image|<foreignObject|<use\b|evil\.example|@import/i)
    expect(svg).toContain('url(#local)') // local references survive
    expect(svg).toContain('url(#arrow)')
    expect(svg).toContain('<g transform="translate(5,5)"><text>link</text></g>') // a link is a plain group: the node stays in place
  })

  it('an SVG that sanitizes to nothing is a refusal', async () => {
    const r = await renderMermaid('flowchart TD\n EMPTY', 'dark')
    expect(r).toEqual({ ok: false, error: 'empty SVG' })
  })

  it('renders once per source and theme; the theme is (re)applied when it changes', async () => {
    mermaidMock.render.mockClear()
    mermaidMock.initialize.mockClear()
    const a = renderMermaid('flowchart TD\n Q1 --> Q2', 'light')
    expect(renderMermaid('flowchart TD\n Q1 --> Q2', 'light')).toBe(a)
    await a
    expect(mermaidMock.render).toHaveBeenCalledTimes(1)
    expect(mermaidMock.initialize).toHaveBeenCalledWith(expect.objectContaining({ themeVariables: expect.objectContaining({ darkMode: false, primaryTextColor: '#0f172a' }) }))
    await renderMermaid('flowchart TD\n Q1 --> Q2', 'dark')
    expect(mermaidMock.render).toHaveBeenCalledTimes(2)
  })

  it('MermaidViz without source (a viz block from elsewhere) refuses with its fallback', () => {
    render(<MermaidViz data={{}} fallbackText="the fallback" />)
    expect(screen.getByTestId('mermaid-refused').textContent).toContain('the fallback')
  })

  it('a non-Error rejection still gives a reason', async () => {
    mermaidMock.parse.mockRejectedValueOnce({ str: 'Lexical error' })
    expect(await renderMermaid('flowchart TD\n LEX', 'dark')).toEqual({ ok: false, error: 'Lexical error' })
    mermaidMock.parse.mockRejectedValueOnce('plain')
    expect(await renderMermaid('flowchart TD\n LEX2', 'dark')).toEqual({ ok: false, error: 'plain' })
  })
})

describe('diagram theme and helpers', () => {
  it('the design system’s colours, dark by default, light when the document says so', () => {
    expect(themeMode()).toBe('dark')
    document.documentElement.dataset.theme = 'light'
    expect(themeMode()).toBe('light')
    document.documentElement.removeAttribute('data-theme')
    expect(themeMode(undefined)).toBe('dark')
    const dark = themeVariables('dark')
    expect(dark).toMatchObject({ darkMode: true, primaryBorderColor: '#818cf8', textColor: '#f1f5f9', pie1: '#6366f1', git0: '#6366f1' })
    expect(Object.values(dark).every((v) => typeof v === 'boolean' || /^#[0-9a-f]{6}$/i.test(v) || v.includes('Inter') || v.endsWith('px'))).toBe(true)
  })

  it('title from front matter or a title line, and fence checks', () => {
    expect(mermaidTitle('---\ntitle: "Build"\n---\nflowchart TD')).toBe('Build')
    expect(mermaidTitle('pie title Pets\n "Dogs": 3')).toBe('Pets')
    expect(mermaidTitle('gantt\n  title Plan\n  section A')).toBe('Plan')
    expect(mermaidTitle('flowchart TD\n A-->B')).toBeUndefined()
    expect(parseMermaidFence('  flowchart TD\n A  ')).toEqual({ ok: true, source: 'flowchart TD\n A', title: undefined })
  })

  it('a re-mounted diagram reuses the rendered SVG', async () => {
    const { unmount } = render(<MermaidViz data={{ source: 'flowchart TD\n R1' }} fallbackText="" />)
    await screen.findByTestId('mermaid-diagram')
    unmount()
    mermaidMock.render.mockClear()
    render(<MermaidViz data={{ source: 'flowchart TD\n R1' }} fallbackText="" />)
    await waitFor(() => expect(screen.getByTestId('mermaid-diagram')).toBeTruthy())
    expect(mermaidMock.render).not.toHaveBeenCalled()
  })
})

describe('initial chat weight', () => {
  // Mermaid, KaTeX and DOMPurify are lazy chunks: nothing the chat imports eagerly may import them.
  const eager = [
    '../../MarkdownText.tsx', '../index.ts', '../registry.ts', '../ReprRefusal.tsx', '../VizBlockRenderer.tsx', '../../ChatMessageBubble.tsx',
    './fence.ts', './MermaidFence.tsx', './LazyMermaidViz.tsx', '../math/fence.ts', '../math/MathFence.tsx', '../math/LazyMathViz.tsx',
  ]
  it.each(eager)('%s does not import Mermaid, KaTeX or the sanitizer', (file) => {
    const src = readFileSync(resolve(__dirname, file), 'utf8')
    expect(src).not.toMatch(/from ['"](mermaid|katex|dompurify)/)
    expect(src).not.toMatch(/import ['"]katex/)
    expect(src).not.toMatch(/from ['"]\.\.?\/(sanitize|theme|render|MermaidViz|MathViz|katex)['"]/)
    expect(src).not.toMatch(/from ['"]\.\.?\/(viz\/)?(sanitize|mermaid\/(MermaidViz|render|theme)|math\/(MathViz|katex))['"]/)
  })
})
