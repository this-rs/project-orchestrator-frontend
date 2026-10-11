/**
 * The markdown export names the provider and the model, and prints a cost by
 * its basis.
 *
 * Run with: npx vitest run src/utils/chatExport.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { ChatMessage } from '@/types'
import { messagesToMarkdown } from './chatExport'

const at = new Date('2026-10-05T10:00:00Z')
const assistant = (extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  role: 'assistant',
  blocks: [{ id: 'b1', type: 'text', content: 'done' }],
  timestamp: at,
  ...extra,
})

describe('messagesToMarkdown — provider and model', () => {
  it('writes a "Provider / Model" line in the header', () => {
    const md = messagesToMarkdown([], { exportedAt: at, provider: 'Local llama-server', model: 'qwen2.5-coder-32b' })
    expect(md).toContain('**Provider:** Local llama-server / **Model:** qwen2.5-coder-32b')
  })

  it('omits the line when neither is known (older callers)', () => {
    const md = messagesToMarkdown([], { exportedAt: at })
    expect(md).not.toContain('**Provider:**')
    expect(md).not.toContain('**Model:**')
  })

  it('names provider and model on the system_init block', () => {
    const md = messagesToMarkdown([
      assistant({
        blocks: [
          {
            id: 'b0',
            type: 'system_init',
            content: 'Session initialized',
            metadata: { model: 'qwen2.5-coder-32b', provider: 'local-llama', provider_label: 'Local llama-server' },
          },
        ],
      }),
    ])
    expect(md).toContain('> *System: Session initialized — Provider: Local llama-server / Model: qwen2.5-coder-32b*')
  })

  it('a system_init without provider is a Claude Code session', () => {
    const md = messagesToMarkdown([
      assistant({ blocks: [{ id: 'b0', type: 'system_init', content: 'Session initialized', metadata: { model: 'claude-sonnet-4-5' } }] }),
    ])
    expect(md).toContain('Provider: Claude Code / Model: claude-sonnet-4-5')
  })
})

describe('messagesToMarkdown — cost by basis', () => {
  it('a Claude turn prints the same cost as before', () => {
    expect(messagesToMarkdown([assistant({ cost_usd: 0.0123 })])).toContain('($0.0123)')
  })

  it('an estimate is flagged', () => {
    expect(messagesToMarkdown([assistant({ cost_usd: 0.042, cost_basis: 'priced' })])).toContain('($0.0420 est.)')
  })

  it('a free turn says local, never $0', () => {
    const md = messagesToMarkdown([assistant({ cost_basis: 'free' })])
    expect(md).toContain('(local)')
    expect(md).not.toContain('$0')
  })

  it('an unknown cost prints its tokens, or nothing', () => {
    const withTokens = messagesToMarkdown([
      assistant({ cost_basis: 'unknown', usage: { input_tokens: 1200, output_tokens: 300 } }),
    ])
    expect(withTokens).toContain('(1.2k in · 300 out)')
    const bare = messagesToMarkdown([assistant({ cost_basis: 'unknown' })])
    expect(bare).not.toContain('$')
    expect(bare).toMatch(/### 1\. Assistant — [^(]*\n/)
  })
})

describe('a cancel notice in the export', () => {
  it('is written as a notice, not an error; a real error keeps "Error:"', () => {
    const msg: ChatMessage = {
      id: 'a', role: 'assistant', timestamp: new Date('2026-10-10T12:00:00Z'),
      blocks: [
        { id: 'n', type: 'error', content: 'Error: unsupported', metadata: { cancel_notice: true, code: 'cancel_refused' } },
        { id: 'e', type: 'error', content: 'boom' },
      ],
    }
    const md = messagesToMarkdown([msg])
    expect(md).toContain('> **Notice:** Error: unsupported')
    expect(md).toContain('> **Error:** boom')
    expect(md).not.toContain('> **Error:** Error: unsupported')
  })
})
