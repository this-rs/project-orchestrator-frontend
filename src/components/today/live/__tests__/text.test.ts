import { describe, expect, it } from 'vitest'
import { LIVE_TEXT, agentTitle, formatSecs, originLabel, summaryLine } from '../text'
import type { LiveAgent } from '@/types/liveAgents'

describe('formatSecs', () => {
  it.each([
    [0, '0s'],
    [59, '59s'],
    [60, '1m'],
    [3599, '59m'],
    [3600, '1h 0m'],
    [3900, '1h 5m'],
    [90000, '1d 1h'],
    [-5, '0s'],
  ])('%i s → %s', (secs, out) => expect(formatSecs(secs)).toBe(out))
})

describe('originLabel', () => {
  it('names the known origins and shows an unknown one as it is', () => {
    expect(originLabel('user')).toBe('Chat')
    expect(originLabel('runner')).toBe('Plan')
    expect(originLabel('delegate')).toBe('Delegated task')
    expect(originLabel('protocol_runner')).toBe('Protocol')
    expect(originLabel('brand_new')).toBe('brand_new')
  })
})

describe('summaryLine', () => {
  it('says nobody runs when the list is empty', () => {
    expect(summaryLine({ total: 0, waiting_input: 0, streaming: 0, idle: 0 })).toBe(LIVE_TEXT.empty)
    expect(LIVE_TEXT.empty).toBe('No assistant is working right now')
  })
  it('counts who waits and who works, singular and plural, skipping the empty ones', () => {
    expect(summaryLine({ total: 1, waiting_input: 0, streaming: 1, idle: 0 })).toBe('1 working')
    expect(summaryLine({ total: 4, waiting_input: 1, streaming: 3, idle: 0 })).toBe('1 waiting for your answer · 3 working')
    expect(summaryLine({ total: 2, waiting_input: 2, streaming: 0, idle: 0 })).toBe('2 waiting for your answer')
  })
  it('does not start with a total and leaves the idle ones to their fold', () => {
    expect(summaryLine({ total: 5, waiting_input: 1, streaming: 3, idle: 1 })).toBe('1 waiting for your answer · 3 working')
    expect(summaryLine({ total: 3, waiting_input: 2, streaming: 0, idle: 1 })).toBe('2 waiting for your answer')
  })
  it('says how many are idle when nobody waits nor works', () => {
    expect(summaryLine({ total: 1, waiting_input: 0, streaming: 0, idle: 1 })).toBe(LIVE_TEXT.idle(1))
    expect(summaryLine({ total: 2, waiting_input: 0, streaming: 0, idle: 2 })).toBe(LIVE_TEXT.idle(2))
    expect(LIVE_TEXT.idle(1)).toBe('1 idle')
    expect(LIVE_TEXT.idle(2)).toBe('2 idle')
  })
})

describe('agentTitle', () => {
  it('falls back for a blank title', () => {
    expect(agentTitle({ title: '  ' } as LiveAgent)).toBe(LIVE_TEXT.untitled)
    expect(LIVE_TEXT.untitled).toBe('Untitled conversation')
    expect(agentTitle({ title: 'Task 1' } as LiveAgent)).toBe('Task 1')
  })
})
