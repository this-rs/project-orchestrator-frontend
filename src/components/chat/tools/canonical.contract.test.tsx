/**
 * Contract with nexus: the tools `nexus-tools` serves (class A of the N17
 * parity matrix) have ONE entry in the renderer tables, under their Claude
 * Code name; `mcp__nexus__<name>` is the same tool and renders the same.
 *
 * The list below is copied from nexus `docs/agent-tools-parity.md` (§2, class
 * **A**) and `docs/agent-contract.md` (« Noms canoniques »). A tool added there
 * is added here, and this test then says what the frontend lacks.
 *
 * Run with: npx vitest run src/components/chat/tools/canonical.contract.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  NEXUS_CANONICAL_TOOLS,
  ToolContent,
  canonicalToolName,
  getToolCategory,
  getToolIcon,
  getToolSummary,
  resolveToolRenderer,
} from './index'

/** N17, class A: what nexus-tools serves under a canonical name. */
const N17_CLASS_A = [
  'Read', 'Write', 'Edit', 'NotebookEdit', 'Glob', 'Grep',
  'Bash', 'Monitor', 'TaskStop', 'WebFetch', 'WebSearch',
]

/** A plausible input per tool, so the renderer has something to show. */
const INPUTS: Record<string, Record<string, unknown>> = {
  Read: { file_path: '/repo/src/main.rs' },
  Write: { file_path: '/repo/notes.md', content: 'hello' },
  Edit: { file_path: '/repo/src/lib.rs', old_string: 'a', new_string: 'b' },
  NotebookEdit: { notebook_path: '/repo/n.ipynb', new_source: 'x = 1' },
  Glob: { pattern: '**/*.rs' },
  Grep: { pattern: 'fn main' },
  Bash: { command: 'git status' },
  Monitor: { command: 'tail -f log' },
  TaskStop: { task_id: 'bg-1' },
  WebFetch: { url: 'https://docs.rs/serde', prompt: 'summary' },
  WebSearch: { query: 'serde derive' },
}

function rendered(toolName: string, toolInput: Record<string, unknown>, canonical?: string): string {
  const { container, unmount } = render(
    <MemoryRouter>
      <ToolContent providerKind="native" canonical={canonical} toolName={toolName} toolInput={toolInput} resultContent="ok" isLoading={false} />
    </MemoryRouter>,
  )
  const html = container.innerHTML
  unmount()
  return html
}

describe('N17 class A: the canonical names nexus serves', () => {
  it('the frontend knows every canonical name of the matrix, and no other', () => {
    expect([...NEXUS_CANONICAL_TOOLS].sort()).toEqual([...N17_CLASS_A].sort())
  })

  it.each(N17_CLASS_A)('mcp__nexus__%s and its canonical name are one tool: same entry, category, summary, icon and rendering', (name) => {
    const input = INPUTS[name]
    const namespaced = `mcp__nexus__${name}`
    expect(canonicalToolName(namespaced)).toBe(name)

    const bare = resolveToolRenderer({ providerKind: 'native', toolName: name, canonical: name, toolInput: input })
    const viaPrefix = resolveToolRenderer({ providerKind: 'native', toolName: namespaced, toolInput: input })
    expect(viaPrefix.Renderer).toBe(bare.Renderer)
    expect(viaPrefix.key).toBe(bare.key)
    expect(viaPrefix.toolName).toBe(bare.toolName)

    expect(getToolCategory(namespaced)).toBe(getToolCategory(name, { canonical: name }))
    expect(getToolCategory(namespaced)).not.toBe('mcp')
    expect(getToolSummary(namespaced, input, { providerKind: 'native' })).toBe(
      getToolSummary(name, input, { providerKind: 'native', canonical: name }),
    )
    expect(getToolIcon(namespaced, input, { providerKind: 'native' })).toBe(
      getToolIcon(name, input, { providerKind: 'native', canonical: name }),
    )
    expect(rendered(namespaced, input)).toBe(rendered(name, input, name))
  })

  it('a Claude Code Read and a nexus Read render alike', () => {
    const input = INPUTS.Read
    const claude = render(
      <MemoryRouter>
        <ToolContent toolName="Read" toolInput={input} resultContent="1\tfn main() {}" isLoading={false} />
      </MemoryRouter>,
    ).container.innerHTML
    const nexus = render(
      <MemoryRouter>
        <ToolContent providerKind="native" toolName="mcp__nexus__Read" toolInput={input} resultContent="1\tfn main() {}" isLoading={false} />
      </MemoryRouter>,
    ).container.innerHTML
    expect(nexus).toBe(claude)
  })

  it('only the nexus server gives a canonical name: another server’s Read inherits nothing', () => {
    expect(canonicalToolName('mcp__other__Read')).toBeNull()
    expect(canonicalToolName('mcp__nexus__Unknown')).toBeNull()
    expect(getToolCategory('mcp__other__Read')).toBe('mcp')
    expect(resolveToolRenderer({ providerKind: 'native', toolName: 'mcp__other__Read', toolInput: INPUTS.Read }).via).toBe('default')
  })

  it('the category stamped by the adapter still wins over the name', () => {
    expect(getToolCategory('mcp__nexus__Read', { category: 'edit' })).toBe('edit')
  })
})

describe('browser tools (N23)', () => {
  it('inspecting the loaded page is a read; moving to or acting on a page is a web call that needs an approval', () => {
    expect(getToolCategory('mcp__browser__browser_snapshot')).toBe('read')
    expect(getToolCategory('mcp__browser__browser_markdown')).toBe('read')
    expect(getToolCategory('mcp__browser__browser_navigate')).toBe('web')
    expect(getToolCategory('mcp__browser__browser_click')).toBe('web')
    expect(getToolCategory('mcp__browser__browser_fill')).toBe('web')
    // A tool nobody classified is not assumed harmless.
    expect(getToolCategory('mcp__browser__browser_something_new')).toBe('web')
  })
})
