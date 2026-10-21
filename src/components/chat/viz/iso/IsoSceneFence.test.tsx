import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MarkdownText } from '../../MarkdownText'
import { IsoSceneFence } from './IsoSceneFence'
import { parseIsoSceneFence, fenceLang, hastText, isoSceneFallback, ISO_SCENE_MAX_CHARS } from './fence'

const FENCES = { 'iso-scene': IsoSceneFence }
const scene = JSON.stringify({
  title: 'Release',
  stations: [
    { mech: 'dependency-graph', tone: 'violet', label: 'Plan' },
    { mech: 'parallel-lanes', tone: 'sky', label: 'Build', after: [0] },
    { mech: 'stair-procedure', tone: 'green', label: 'Test', after: [1] },
  ],
})
const md = (body: string) => `Here is the pipeline:\n\n\`\`\`iso-scene\n${body}\n\`\`\`\n\nDone.`

describe('```iso-scene in the agent text', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
  })

  it('renders a checked 3D scene (lazy chunk), with its legend; no WebGL 2 in jsdom → the SVG of the same machine', async () => {
    render(<MarkdownText content={md(scene)} fences={FENCES} />)
    expect(await screen.findByTestId('iso-scene')).toBeTruthy()
    expect(screen.getByTestId('iso-scene-legend').textContent).toContain('Build')
    expect(await screen.findByTestId('iso-scene-svg')).toBeTruthy()
    expect(screen.getByText('Release')).toBeTruthy() // viz header
    expect(screen.getByText(/Here is the pipeline/)).toBeTruthy()
  })

  it('a refused scene: what to correct, and the text fallback — the rest of the message still renders', async () => {
    const bad = JSON.stringify({ title: 'Bad', stations: [{ mech: 'teleporter', label: 'Jump' }] })
    render(<MarkdownText content={md(bad)} fences={FENCES} />)
    const box = await screen.findByTestId('iso-scene-refused')
    expect(box.textContent).toMatch(/teleporter/)
    expect(box.textContent).toContain('Bad — Jump')
    expect(screen.getByText('Done.')).toBeTruthy()
  })

  it('while streaming, an unfinished block is a placeholder, not an error', () => {
    render(<MarkdownText content={'Voici :\n\n```iso-scene\n{"stations": [{"mech": "dra'} fences={FENCES} isStreaming />)
    expect(screen.getByTestId('iso-scene-loading').textContent).toMatch(/Composing/)
    expect(screen.queryByTestId('iso-scene-refused')).toBeNull()
  })

  it('once complete, invalid JSON is refused with its source', () => {
    render(<MarkdownText content={md('{"stations": [')} fences={FENCES} />)
    const box = screen.getByTestId('iso-scene-refused')
    expect(box.textContent).toMatch(/not valid JSON/)
    expect(box.textContent).toContain('{"stations": [')
  })

  it('other code blocks, and iso-scene without `fences` (notes, tool output), stay code', () => {
    const { container } = render(<MarkdownText content={'```ts\nconst a = 1\n```'} fences={FENCES} />)
    expect(container.querySelector('pre code')?.textContent).toContain('const a = 1')
    const plain = render(<MarkdownText content={md(scene)} />)
    expect(plain.container.querySelector('pre code')?.textContent).toContain('dependency-graph')
    expect(plain.queryByTestId('iso-scene')).toBeNull()
  })
})

describe('fence helpers', () => {
  it('parses, and refuses with a reason', () => {
    expect(parseIsoSceneFence('{"a":1}')).toEqual({ ok: true, data: { a: 1 } })
    expect(parseIsoSceneFence('[1]')).toMatchObject({ ok: false, reason: 'not_object' })
    expect(parseIsoSceneFence('nope')).toMatchObject({ ok: false, reason: 'not_json' })
    expect(parseIsoSceneFence(' '.repeat(ISO_SCENE_MAX_CHARS + 1))).toMatchObject({ ok: false, reason: 'too_large' })
  })

  it('reads the language and the text of a code node', () => {
    expect(fenceLang(['language-iso-scene', 'hljs'])).toBe('iso-scene')
    expect(fenceLang('hljs language-ts')).toBe('ts')
    expect(fenceLang(undefined)).toBeNull()
    expect(hastText({ type: 'element', children: [{ type: 'text', value: '{"a"' }, { type: 'element', children: [{ type: 'text', value: ':1}' }] }] })).toBe('{"a":1}')
  })

  it('falls back to the caption, then title and labels, then the source', () => {
    expect(isoSceneFallback({ caption: 'A pipeline' }, 'src')).toBe('A pipeline')
    expect(isoSceneFallback({ title: 'T', stations: [{ label: 'a' }, { label: 'b' }] }, 'src')).toBe('T — a → b')
    expect(isoSceneFallback({}, 'src')).toBe('src')
  })

  it('a too-large block is refused even while streaming', () => {
    render(<IsoSceneFence source={'x'.repeat(ISO_SCENE_MAX_CHARS + 1)} streaming />)
    expect(screen.getByTestId('iso-scene-refused').textContent).toMatch(/too large/)
  })
})

describe('initial chat weight', () => {
  // The engine is a separate chunk: nothing the chat imports eagerly may import it statically.
  const eager = ['../../MarkdownText.tsx', '../index.ts', '../registry.ts', './LazyIsoSceneViz.tsx', './IsoSceneFence.tsx', './fence.ts', '../../ChatMessageBubble.tsx']
  it.each(eager)('%s does not import the 3D engine', (file) => {
    const src = readFileSync(resolve(__dirname, file), 'utf8')
    expect(src).not.toMatch(/from ['"]@\/vendor\/three-iso/)
    expect(src).not.toMatch(/from ['"]\.\/(IsoSceneViz|compile)['"]/)
  })
})
