import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ContentBlock } from '@/types'
import { SystemInitBlock } from './SystemInitBlock'

const PO_TOOLS = ['mcp__project-orchestrator__note', 'mcp__project-orchestrator__task', 'mcp__project-orchestrator__plan']
const DEEPSEEK_ALLOW = ['mcp__project-orchestrator__*', 'Bash(git *)', 'Bash(cargo *)', 'Bash(npm *)', 'Read', 'Edit', 'WebSearch']

const block = (metadata: Record<string, unknown>): ContentBlock => ({ id: 'si', type: 'system_init', content: '', metadata })

describe('SystemInitBlock — tools really offered', () => {
  it('the tools chip is a keyboard-reachable disclosure with a visible focus', () => {
    render(<SystemInitBlock block={block({ model: 'deepseek-chat', tools: PO_TOOLS, tool_allow: DEEPSEEK_ALLOW })} />)
    const toggle = screen.getByRole('button', { name: /Tools: 3/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.className).toContain('focus-visible:ring')
    expect((screen.getByTestId('tool-inventory') as HTMLElement).hidden).toBe(true)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const panel = screen.getByTestId('tool-inventory')
    expect(toggle.getAttribute('aria-controls')).toBe(panel.id)
  })

  it('groups the offered tools by MCP server', () => {
    render(<SystemInitBlock block={block({ tools: [...PO_TOOLS, 'mcp__nexus__Read'] })} />)
    fireEvent.click(screen.getByRole('button', { name: /Tools: 4/ }))
    const groups = screen.getAllByTestId('tool-group')
    expect(groups.map((g) => g.getAttribute('data-server'))).toEqual(['nexus', 'project-orchestrator'])
    expect(groups[1].textContent).toMatch(/MCP server project-orchestrator/)
    expect(within(groups[1]).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['note', 'plan', 'task'])
  })

  it('DeepSeek: allow patterns that match no offered tool say "Not available in this session", in words', () => {
    render(<SystemInitBlock block={block({ tools: PO_TOOLS, tool_allow: DEEPSEEK_ALLOW })} />)
    fireEvent.click(screen.getByRole('button', { name: /Tools: 3/ }))
    const rows = screen.getAllByTestId('allow-pattern')
    const status = Object.fromEntries(rows.map((r) => [r.querySelector('code')!.textContent, r.getAttribute('data-available')]))
    expect(status).toEqual({
      'mcp__project-orchestrator__*': 'true',
      'Bash(git *)': 'false',
      'Bash(cargo *)': 'false',
      'Bash(npm *)': 'false',
      Read: 'false',
      Edit: 'false',
      WebSearch: 'false',
    })
    for (const row of rows) {
      const text = row.textContent ?? ''
      if (row.getAttribute('data-available') === 'true') expect(text).toMatch(/Available — matching tools: 3/)
      else expect(text).toMatch(/Not available in this session/)
    }
  })

  it('Read and Bash(git *) are available when the nexus server offers them', () => {
    render(<SystemInitBlock block={block({ tools: ['mcp__nexus__Read', 'mcp__nexus__Bash'], tool_allow: ['Read', 'Bash(git *)', 'Edit'] })} />)
    fireEvent.click(screen.getByRole('button', { name: /Tools: 2/ }))
    expect(screen.getAllByTestId('allow-pattern').map((r) => r.getAttribute('data-available'))).toEqual(['true', 'true', 'false'])
  })

  it('an older block with only a count stays a plain chip', () => {
    render(<SystemInitBlock block={block({ tools_count: 12 })} />)
    expect(screen.getByText('Tools: 12')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('SystemInitBlock — permission mode badge', () => {
  const badge = () => screen.queryByTestId('init-permission-mode')

  it.each([
    ['bypassPermissions', "Rock'n roll"],
    ['acceptEdits', 'Accept edits'],
    ['default', 'Ask permissions'],
    ['plan', 'Plan mode'],
  ])('%s renders its renamed label, never the raw CLI value', (mode, label) => {
    const { container } = render(<SystemInitBlock block={block({ permission_mode: mode })} />)
    expect(badge()!.textContent).toBe(label)
    expect(container.textContent).not.toContain('bypassPermissions')
    expect(container.textContent).not.toContain('acceptEdits')
    // The raw value stays available for diagnostics, not as visible text.
    expect(badge()!.getAttribute('title')).toBe(mode)
    expect(badge()!.querySelector('span')!.className).toMatch(/bg-/)
  })

  it('a neutral provider gets the neutral wording', () => {
    render(<SystemInitBlock block={block({ permission_mode: 'bypassPermissions', provider_kind: 'openai_compatible' })} />)
    expect(badge()!.textContent).toBe("Rock'n roll")
  })

  it('an unknown mode is shown as is', () => {
    render(<SystemInitBlock block={block({ permission_mode: 'yolo' })} />)
    expect(badge()!.textContent).toBe('yolo')
  })

  it('no mode, no badge', () => {
    render(<SystemInitBlock block={block({ model: 'm' })} />)
    expect(badge()).toBeNull()
  })
})
