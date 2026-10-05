/**
 * A permission request is labelled from the category its provider adapter
 * supplied — and, for Claude Code (which supplies none), exactly as before.
 *
 * Run with: npx vitest run src/components/chat/PermissionRequestBlock.provider.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ContentBlock } from '@/types'
import { historyEventsToMessages } from '@/utils/chatAssembly'
import {
  CLAUDE_BASH_PERMISSION_REQUEST,
  CODEX_SHELL_PERMISSION_REQUEST,
} from '@/utils/__fixtures__/toolHintFrames'
import { PermissionRequestBlock } from './PermissionRequestBlock'

const blockOf = (event: unknown): ContentBlock =>
  historyEventsToMessages([event] as never[]).flatMap((m) => m.blocks).find((b) => b.type === 'permission_request')!

const mount = (block: ContentBlock) => render(<PermissionRequestBlock block={block} onRespond={() => true} />)

describe('PermissionRequestBlock — category from the provider', () => {
  it('a Codex `shell` request with category `command` is a "Command", its argv shown as one command', () => {
    const { container } = mount(blockOf(CODEX_SHELL_PERMISSION_REQUEST))
    expect(screen.getByText('Command: bash -lc cargo test')).toBeTruthy()
    expect(container.firstElementChild?.className).toContain('border-l-amber-500/40')
    fireEvent.click(screen.getByRole('button', { name: /Details/ }))
    const detail = container.querySelector('pre')
    expect(detail?.textContent).toBe('bash -lc cargo test')
    expect(detail?.className).toContain('text-amber-300/80')
  })

  it('a `shell` command sent as a string is formatted the same way', () => {
    mount({
      id: 'b1',
      type: 'permission_request',
      content: '',
      metadata: { tool_call_id: 'c1', tool_name: 'shell', tool_input: { command: 'ls -la' }, tool_category: 'command' },
    })
    expect(screen.getByText('Command: ls -la')).toBeTruthy()
  })

  it('without a category, `shell` is still a command when its canonical alias says so', () => {
    mount({
      id: 'b1',
      type: 'permission_request',
      content: '',
      metadata: { tool_call_id: 'c1', tool_name: 'shell', tool_input: { command: ['ls'] }, tool_canonical: 'Bash' },
    })
    expect(screen.getByText('Command: ls')).toBeTruthy()
  })

  it('a Claude `Bash` request without category is unchanged', () => {
    const { container } = mount(blockOf(CLAUDE_BASH_PERMISSION_REQUEST))
    // Description first, the command in the details: as before.
    expect(screen.getByText('Command: Run the tests')).toBeTruthy()
    expect(container.firstElementChild?.className).toContain('border-l-amber-500/40')
    fireEvent.click(screen.getByRole('button', { name: /Details/ }))
    expect(container.querySelector('pre')?.textContent).toBe('cargo test')
  })

  it.each([
    ['Grep', { pattern: 'TODO' }, 'Read: TODO'],
    ['Read', { file_path: '/repo/src/a.ts' }, 'Read: a.ts'],
    ['Write', { file_path: '/repo/src/b.ts' }, 'Edit: b.ts'],
    ['WebFetch', { url: 'https://example.com/x' }, 'Web: example.com'],
    ['mcp__project-orchestrator__create_note', { content: 'x' }, 'MCP: create note'],
    ['Task', { prompt: 'x' }, 'Tool: Task'],
  ])('a Claude `%s` request keeps its label', (tool, input, text) => {
    mount({ id: 'b1', type: 'permission_request', content: '', metadata: { tool_call_id: 'c1', tool_name: tool, tool_input: input } })
    expect(screen.getByText(text)).toBeTruthy()
  })

  it('an `agent` request of another provider is shown as a plain tool', () => {
    mount({
      id: 'b1',
      type: 'permission_request',
      content: '',
      metadata: { tool_call_id: 'c1', tool_name: 'spawn_agent', tool_input: { goal: 'x' }, tool_category: 'agent' },
    })
    expect(screen.getByText('Tool: spawn_agent')).toBeTruthy()
  })
})
