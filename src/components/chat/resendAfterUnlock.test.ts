import { describe, it, expect } from 'vitest'
import type { ChatMessage } from '@/types'
import { textToResendAfterUnlock } from './resendAfterUnlock'

const user = (text: string): ChatMessage => ({ id: text, role: 'user', blocks: [{ id: 'b', type: 'text', content: text }], timestamp: new Date() })
const assistant: ChatMessage = { id: 'a', role: 'assistant', blocks: [], timestamp: new Date() }

describe('textToResendAfterUnlock', () => {
  it('sends nothing while the turn runs: it is waiting for the unlock and resumes by itself', () => {
    expect(textToResendAfterUnlock([user('bonjour'), assistant], true)).toBeNull()
  })
  it('sends the LAST user message again once the turn has ended', () => {
    expect(textToResendAfterUnlock([user('premier'), assistant, user('second'), assistant], false)).toBe('second')
  })
  it('sends nothing without a user text', () => {
    expect(textToResendAfterUnlock([assistant], false)).toBeNull()
    expect(textToResendAfterUnlock([user('   '), assistant], false)).toBeNull()
  })
})
