/**
 * Provider hints of a tool call (`category`, `canonical`), as the HISTORY
 * reducer puts them on the block. The live reducer is tested on the same
 * frames in `hooks/__tests__/useChat.toolPolicy.test.tsx`.
 *
 * Run with: npx vitest run src/utils/chatAssembly.toolHints.test.ts
 */
import { describe, it, expect } from 'vitest'
import { historyEventsToMessages, toolHintMetadata } from './chatAssembly'
import {
  CLAUDE_BASH_PERMISSION_REQUEST,
  CLAUDE_BASH_TOOL_USE,
  CODEX_SHELL_PERMISSION_REQUEST,
  CODEX_SHELL_TOOL_USE,
} from './__fixtures__/toolHintFrames'

const blockOf = (event: unknown, type: string) =>
  historyEventsToMessages([event] as never[]).flatMap((m) => m.blocks).find((b) => b.type === type)

describe('tool hints on history blocks', () => {
  it('copies category and canonical of a tool_use onto the block', () => {
    expect(blockOf(CODEX_SHELL_TOOL_USE, 'tool_use')?.metadata).toMatchObject({
      tool_name: 'shell',
      tool_category: 'command',
      tool_canonical: 'Bash',
    })
  })

  it('copies category and canonical of a permission_request onto the block', () => {
    expect(blockOf(CODEX_SHELL_PERMISSION_REQUEST, 'permission_request')?.metadata).toEqual({
      tool_call_id: 'call_shell_1',
      tool_name: 'shell',
      tool_input: CODEX_SHELL_PERMISSION_REQUEST.input,
      tool_category: 'command',
      tool_canonical: 'Bash',
    })
  })

  it('leaves a Claude Code block exactly as before: no hint keys at all', () => {
    const toolUse = blockOf(CLAUDE_BASH_TOOL_USE, 'tool_use')?.metadata ?? {}
    expect(Object.keys(toolUse).sort()).toEqual(['created_at', 'tool_call_id', 'tool_input', 'tool_name'])
    expect(blockOf(CLAUDE_BASH_PERMISSION_REQUEST, 'permission_request')?.metadata).toEqual({
      tool_call_id: 'toolu_bash_1',
      tool_name: 'Bash',
      tool_input: CLAUDE_BASH_PERMISSION_REQUEST.input,
    })
  })

  it('ignores hints that are not strings', () => {
    expect(toolHintMetadata({ category: 3, canonical: null })).toEqual({})
    expect(toolHintMetadata({ category: '', canonical: 'Read' })).toEqual({ tool_canonical: 'Read' })
    expect(toolHintMetadata(null)).toEqual({})
  })
})
