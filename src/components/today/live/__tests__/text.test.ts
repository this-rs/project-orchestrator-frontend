import { describe, expect, it } from 'vitest'
import { agentTitle, formatSecs, originLabel, summaryLine } from '../text'
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
    expect(originLabel('delegate')).toBe('Tâche déléguée')
    expect(originLabel('protocol_runner')).toBe('Protocole')
    expect(originLabel('brand_new')).toBe('brand_new')
  })
})

describe('summaryLine', () => {
  it('says nobody runs when the list is empty', () => {
    expect(summaryLine({ total: 0, waiting_input: 0, streaming: 0, idle: 0 })).toBe('Aucun agent ne tourne en ce moment')
  })
  it('counts each state, singular and plural, skipping the empty ones', () => {
    expect(summaryLine({ total: 1, waiting_input: 0, streaming: 1, idle: 0 })).toBe('1 agent · 1 travaille')
    expect(summaryLine({ total: 5, waiting_input: 1, streaming: 3, idle: 1 })).toBe(
      '5 agents · 1 attend ta réponse · 3 travaillent · 1 inactif',
    )
    expect(summaryLine({ total: 3, waiting_input: 2, streaming: 0, idle: 1 })).toBe(
      '3 agents · 2 attendent ta réponse · 1 inactif',
    )
    expect(summaryLine({ total: 2, waiting_input: 0, streaming: 0, idle: 2 })).toBe('2 agents · 2 inactifs')
  })
})

describe('agentTitle', () => {
  it('falls back for a blank title', () => {
    expect(agentTitle({ title: '  ' } as LiveAgent)).toBe('Session sans titre')
    expect(agentTitle({ title: 'Task 1' } as LiveAgent)).toBe('Task 1')
  })
})
