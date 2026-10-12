/**
 * A message sent to the read-only mirror of a Claude Code sub-agent (P18c) is
 * refused by the backend with the code `mirror_read_only` (HTTP 409 over REST,
 * a typed `error` frame over the socket). A stale composer can still try: the
 * refusal must read as what it is, not as a raw red line.
 *
 * Run with: npx vitest run src/utils/chatAssembly.mirrorReadOnly.test.ts
 */
import { describe, it, expect } from 'vitest'
import { historyEventsToMessages, refusedSendMetadata } from './chatAssembly'
import { providerErrorExplanation, providerErrorTitle } from '@/constants/providerErrors'
import { readProviderError } from '@/types/provider'

const REFUSAL = { type: 'error', code: 'mirror_read_only', message: 'this session is a read-only mirror' }

describe('mirror_read_only', () => {
  it('is a known typed error, read off a 409 body', () => {
    const info = readProviderError({ code: 'mirror_read_only', error: 'read-only mirror' }, 409)
    expect(info).toMatchObject({ code: 'mirror_read_only', status: 409 })
  })

  it('has a readable title and explanation', () => {
    const info = readProviderError(REFUSAL)!
    expect(providerErrorTitle(info)).toBe('This conversation is read-only')
    expect(providerErrorExplanation(info)).toMatch(/Claude Code sub-agent/)
    expect(providerErrorExplanation(info)).not.toMatch(/providerErrors\./)
  })

  it('an `error` frame carrying it keeps the typed error, so the card renders', () => {
    expect(refusedSendMetadata(REFUSAL)).toMatchObject({ code: 'mirror_read_only', provider_error: { code: 'mirror_read_only' } })
    const blocks = historyEventsToMessages([
      { type: 'user_message', content: 'hello', created_at: 1_700_000_000 },
      { ...REFUSAL, created_at: 1_700_000_001 },
    ]).flatMap((m) => m.blocks)
    const err = blocks.find((b) => b.type === 'error')
    expect(err?.metadata).toMatchObject({ code: 'mirror_read_only' })
    expect((err?.metadata?.provider_error as { code: string }).code).toBe('mirror_read_only')
  })

  it('any other `error` frame keeps the plain block it always had', () => {
    expect(refusedSendMetadata({ type: 'error', message: 'Invalid message format' })).toBeNull()
    expect(refusedSendMetadata({ type: 'error', code: 'turn_in_progress', message: 'busy' })).toBeNull()
  })
})
