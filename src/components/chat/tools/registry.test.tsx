/**
 * The (provider kind, tool) renderer registry. The frozen Claude Code
 * rendering lives in `registry.snapshot.test.tsx`; this file covers what a
 * provider changes.
 *
 * Run with: npx vitest run src/components/chat/tools/registry.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BashToolRenderer } from './BashToolRenderer'
import { DefaultToolRenderer } from './DefaultToolRenderer'
import { EditToolRenderer } from './EditToolRenderer'
import { McpToolRenderer } from './McpToolRenderer'
import { ToolContent, commandText, getToolCategory, getToolIcon, getToolSummary, resolveToolRenderer } from './index'

describe('resolveToolRenderer', () => {
  it('a provider that is absent is Claude Code: tools resolve by name', () => {
    const r = resolveToolRenderer({ toolName: 'Bash', toolInput: { command: 'ls' } })
    expect(r.Renderer).toBe(BashToolRenderer)
    expect(r.via).toBe('provider')
    expect(resolveToolRenderer({ providerKind: 'claude_code', toolName: 'Edit' }).Renderer).toBe(EditToolRenderer)
  })

  it('an unknown tool of a codex provider gets the default renderer, without error', () => {
    const r = resolveToolRenderer({ providerKind: 'codex', toolName: 'web_run', toolInput: { q: 'x' } })
    expect(r.Renderer).toBe(DefaultToolRenderer)
    expect(r.via).toBe('default')
    render(<ToolContent providerKind="codex" toolName="web_run" toolInput={{ q: 'x' }} resultContent="ok" isLoading={false} />)
    expect(screen.getByText(/"q": "x"/)).toBeTruthy()
    expect(getToolSummary('web_run', { q: 'x' }, { providerKind: 'codex' })).toBeUndefined()
    expect(getToolIcon('web_run', { q: 'x' }, { providerKind: 'codex' })).toBeUndefined()
  })

  it('a Claude tool NAME means nothing for another provider unless its adapter says so', () => {
    expect(resolveToolRenderer({ providerKind: 'openai_compatible', toolName: 'Bash', toolInput: { command: 'ls' } }).via).toBe('default')
    expect(
      resolveToolRenderer({ providerKind: 'openai_compatible', toolName: 'Bash', canonical: 'Bash', toolInput: { command: 'ls' } }).Renderer,
    ).toBe(BashToolRenderer)
  })

  it('`shell` with canonical `Bash` renders as Bash, its argv joined into one command', () => {
    const toolInput = { command: ['bash', '-lc', 'cargo test'], workdir: '/repo' }
    const r = resolveToolRenderer({ providerKind: 'openai_compatible', toolName: 'shell', canonical: 'Bash', toolInput })
    expect(r.Renderer).toBe(BashToolRenderer)
    expect(r.via).toBe('canonical')
    expect(r.toolInput.command).toBe('bash -lc cargo test')

    render(<ToolContent providerKind="openai_compatible" canonical="Bash" toolName="shell" toolInput={toolInput} isLoading={false} resultContent="ok" />)
    expect(screen.getByText('bash -lc cargo test')).toBeTruthy()
    expect(getToolSummary('shell', toolInput, { canonical: 'Bash', providerKind: 'openai_compatible' })).toBe('bash -lc cargo test')
    expect(getToolIcon('shell', toolInput, { canonical: 'Bash', providerKind: 'openai_compatible' })).toBe('$')
  })

  it('falls back to the static alias table of the kind when the event carries no alias', () => {
    const r = resolveToolRenderer({ providerKind: 'codex', toolName: 'shell', toolInput: { command: 'ls' } })
    expect(r.Renderer).toBe(BashToolRenderer)
    expect(r.via).toBe('alias')
    // The table is per kind: `shell` of another provider is not aliased.
    expect(resolveToolRenderer({ providerKind: 'acp', toolName: 'shell', toolInput: { command: 'ls' } }).via).toBe('default')
  })

  it('does not lend a renderer to an input it cannot read (apply_patch is not an Edit diff)', () => {
    const r = resolveToolRenderer({ providerKind: 'codex', toolName: 'apply_patch', toolInput: { patch: '*** Begin Patch' } })
    expect(r.Renderer).toBe(DefaultToolRenderer)
    const fits = resolveToolRenderer({
      providerKind: 'codex',
      toolName: 'apply_patch',
      toolInput: { file_path: '/a.ts', old_string: 'a', new_string: 'b' },
    })
    expect(fits.Renderer).toBe(EditToolRenderer)
  })

  it('an unknown canonical alias or kind never throws', () => {
    expect(resolveToolRenderer({ providerKind: 'martian', toolName: 'x', canonical: 'NoSuchTool' }).via).toBe('default')
    expect(resolveToolRenderer({ providerKind: 'codex', toolName: 'constructor', canonical: 'toString' }).via).toBe('default')
  })

  it('MCP tools keep their renderer on every provider', () => {
    const toolInput = { action: 'create', content: 'x' }
    const r = resolveToolRenderer({ providerKind: 'openai_compatible', toolName: 'mcp__project-orchestrator__note', toolInput })
    expect(r.Renderer).toBe(McpToolRenderer)
    render(
      <MemoryRouter>
        <ToolContent providerKind="openai_compatible" toolName="mcp__project-orchestrator__note" toolInput={toolInput} isLoading />
      </MemoryRouter>,
    )
  })
})

describe('getToolCategory', () => {
  it('uses the category the adapter supplied, whatever the name says', () => {
    expect(getToolCategory('shell', { category: 'command' })).toBe('command')
    expect(getToolCategory('Bash', { category: 'read' })).toBe('read')
  })

  it('falls back to the canonical alias, then to the Claude tool table', () => {
    expect(getToolCategory('shell', { canonical: 'Bash' })).toBe('command')
    expect(getToolCategory('shell', { providerKind: 'codex' })).toBe('command')
    expect(getToolCategory('Bash')).toBe('command')
    expect(getToolCategory('Grep')).toBe('search')
    expect(getToolCategory('NotebookEdit')).toBe('edit')
    expect(getToolCategory('WebFetch')).toBe('web')
    expect(getToolCategory('mcp__project-orchestrator__note')).toBe('mcp')
    expect(getToolCategory('Task')).toBe('other')
  })

  it('ignores a category it does not know', () => {
    expect(getToolCategory('shell', { category: 'teleport' })).toBe('other')
  })
})

describe('commandText', () => {
  it('reads a string or an argv array, and nothing else', () => {
    expect(commandText({ command: 'ls -la' })).toBe('ls -la')
    expect(commandText({ command: ['git', 'status'] })).toBe('git status')
    expect(commandText({ command: [1, 2] })).toBeNull()
    expect(commandText({})).toBeNull()
    expect(commandText(undefined)).toBeNull()
  })
})

describe('MCP tool named differently by the provider', () => {
  it('uses the canonical `mcp__server__tool` alias the adapter stamps', () => {
    const resolved = resolveToolRenderer({
      providerKind: 'acp',
      toolName: 'project-orchestrator_note',
      canonical: 'mcp__project-orchestrator__note',
      toolInput: { query: 'x' },
    })
    expect(resolved.via).toBe('mcp')
    expect(resolved.toolName).toBe('mcp__project-orchestrator__note')
  })
})
