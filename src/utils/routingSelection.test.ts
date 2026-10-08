import { describe, it, expect } from 'vitest'
import { distinctModels, isPicked, modeOf, providerState, setProviderPicks, togglePick, type RoutingPick } from './routingSelection'

const a: RoutingPick = { provider: 'claude-code', model: 'claude-opus-5' }
const b: RoutingPick = { provider: 'claude-code', model: 'claude-sonnet-5' }
const c: RoutingPick = { provider: 'local', model: 'qwen' }

describe('routingSelection', () => {
  it('toggles a pick on and off', () => {
    const on = togglePick([], a)
    expect(isPicked(on, a)).toBe(true)
    expect(togglePick(on, a)).toEqual([])
  })

  it('the mode is read from the state: Auto, one pick, several picks, nothing', () => {
    expect(modeOf(true, [a, b])).toBe('full')
    expect(modeOf(false, [a])).toBe('primary')
    expect(modeOf(false, [a, c])).toBe('mixed')
    expect(modeOf(null, [])).toBeNull()
    expect(modeOf(false, [])).toBe('primary')
  })

  it('selects and clears a whole provider without touching the others', () => {
    const all = setProviderPicks([c], 'claude-code', ['claude-opus-5', 'claude-sonnet-5'], true)
    expect(all).toHaveLength(3)
    expect(providerState(all, 'claude-code', ['claude-opus-5', 'claude-sonnet-5'])).toBe('all')
    const none = setProviderPicks(all, 'claude-code', ['claude-opus-5', 'claude-sonnet-5'], false)
    expect(none).toEqual([c])
    expect(providerState(none, 'claude-code', ['claude-opus-5'])).toBe('none')
    expect(providerState([a], 'claude-code', ['claude-opus-5', 'claude-sonnet-5'])).toBe('some')
  })

  it('an alias and its model count once', () => {
    const alias: RoutingPick = { provider: 'local', model: 'fast' }
    const out = distinctModels([c, alias], (p) => (p.model === 'fast' ? 'qwen' : p.model))
    expect(out).toEqual([c])
  })
})
