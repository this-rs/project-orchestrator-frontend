import { describe, it, expect } from 'vitest'
import { parseChatUrl, writeChatUrl, isStartupDefault } from './chatUrlState'

const SID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const qs = (s: string) => new URLSearchParams(s)

describe('parseChatUrl', () => {
  it('reads session and view', () => {
    expect(parseChatUrl(qs(`chat=${SID}&chatView=fullscreen`))).toEqual({ sessionId: SID, mode: 'fullscreen' })
  })

  it('keeps a session behind a closed panel — reopening shows the same conversation', () => {
    expect(parseChatUrl(qs(`chat=${SID}`))).toEqual({ sessionId: SID, mode: 'closed' })
  })

  it('ignores a session that is not a UUID rather than opening a socket for it', () => {
    expect(parseChatUrl(qs('chat=../../etc&chatView=open')).sessionId).toBeNull()
  })

  it('treats an unknown view as closed', () => {
    expect(parseChatUrl(qs('chatView=huge')).mode).toBe('closed')
  })

  it('normalises the UUID case so the restore guard in loadSession matches', () => {
    expect(parseChatUrl(qs(`chat=${SID.toUpperCase()}`)).sessionId).toBe(SID)
  })
})

describe('writeChatUrl', () => {
  it('sets both parameters and keeps unrelated ones', () => {
    const next = writeChatUrl(qs('project=abc&page=2'), { sessionId: SID, mode: 'open' })
    expect(next?.get('project')).toBe('abc')
    expect(next?.get('page')).toBe('2')
    expect(next?.get('chat')).toBe(SID)
    expect(next?.get('chatView')).toBe('open')
  })

  it('removes the view when the panel closes, but keeps the session', () => {
    const next = writeChatUrl(qs(`chat=${SID}&chatView=open`), { sessionId: SID, mode: 'closed' })
    expect(next?.has('chatView')).toBe(false)
    expect(next?.get('chat')).toBe(SID)
  })

  it('removes the session on a new conversation', () => {
    const next = writeChatUrl(qs(`chat=${SID}&chatView=open`), { sessionId: null, mode: 'open' })
    expect(next?.has('chat')).toBe(false)
  })

  it('returns null when the URL already matches — no navigation churn', () => {
    expect(writeChatUrl(qs(`chat=${SID}&chatView=fullscreen`), { sessionId: SID, mode: 'fullscreen' })).toBeNull()
    expect(writeChatUrl(qs('project=abc'), { sessionId: null, mode: 'closed' })).toBeNull()
  })

  it('round-trips through parse', () => {
    const state = { sessionId: SID, mode: 'fullscreen' as const }
    expect(parseChatUrl(writeChatUrl(qs(''), state)!)).toEqual(state)
  })
})

describe('isStartupDefault', () => {
  it('is only the closed, session-less boot state', () => {
    expect(isStartupDefault({ sessionId: null, mode: 'closed' })).toBe(true)
    expect(isStartupDefault({ sessionId: null, mode: 'open' })).toBe(false)
    expect(isStartupDefault({ sessionId: SID, mode: 'closed' })).toBe(false)
  })
})
