/**
 * The markdown export names the provider and the model, and prints a cost by
 * its basis.
 *
 * Run with: npx vitest run src/utils/chatExport.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { ChatMessage } from '@/types'
import { messageBodyToMarkdown, messagesToMarkdown } from './chatExport'
import { historyEventsToMessages } from './chatAssembly'
import { activeTranslator, setActiveTranslator } from '@/i18n/active'
import { loadLocale } from '@/i18n/store'
import { createTranslator } from '@/i18n/translate'

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

describe('cancel notices in copied and exported markdown', () => {
  it('uses the displayed notice instead of the backend message, while preserving ordinary errors', () => {
    const msg = assistant({ blocks: [
      { id: 'n', type: 'error', content: 'Already stopped — nothing was running any more.', metadata: { cancel_notice: true, code: 'cancel_failed', reason: 'owner_unreachable' } },
      { id: 'e', type: 'error', content: 'boom' },
    ] })
    for (const md of [messageBodyToMarkdown(msg), messagesToMarkdown([msg])]) {
      expect(md).toContain('> **Notice:** Owner unreachable; no stop was confirmed. Check the session activity.')
      expect(md).toContain('> **Error:** boom')
      expect(md).not.toContain('Already stopped')
    }
  })

  it('uses the active language when copying and exporting', async () => {
    const original = activeTranslator()
    try {
      setActiveTranslator(createTranslator('fr', await loadLocale('fr')))
      const msg = assistant({ blocks: [{ id: 'n', type: 'error', content: 'raw', metadata: { cancel_notice: true, code: 'cancel_failed', reason: 'owner_unreachable' } }] })
      const notice = activeTranslator().t('chatA-activity.cancelAll.ownerUnreachable')
      expect(notice).not.toContain('Owner unreachable')
      expect(messageBodyToMarkdown(msg)).toContain(`> **Notice:** ${notice}`)
      expect(messagesToMarkdown([msg])).toContain(`> **Notice:** ${notice}`)
    } finally {
      setActiveTranslator(original)
    }
  })

  it.each([
    ['cancel_failed', 'owner_timeout', 'The stop got no answer in time'],
    ['cancel_failed', 'session_gone', 'The outcome of this stop request is unknown'],
    ['cancel_refused', 'tool_cancel', 'A refusal was received'],
    ['cancel_refused', 'background_tasks', 'A refusal was received'],
  ])('uses the notice from replay metadata for %s / %s', (code, reason, expected) => {
    const raw = 'backend claims stop succeeded'
    const messages = historyEventsToMessages([{ type: 'error', message: raw, code, reason }] as never[])
    expect(messages).toHaveLength(1)
    expect(messages[0].blocks[0].metadata).toMatchObject({ cancel_notice: true, code, reason })
    for (const md of [messageBodyToMarkdown(messages[0]), messagesToMarkdown(messages)]) {
      expect(md).toContain(`> **Notice:** ${expected}`)
      expect(md).not.toContain(raw)
    }
  })
})
