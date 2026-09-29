import { describe, it, expect } from 'vitest'
import { cohesionLevel, energyLevel, pct, ratioLevel, tagSummary, TRIGGER_TYPES } from '../metrics'
import { fetchAllPages, dedupeById } from '../fetchAll'

describe('metrics levels', () => {
  it('energy keeps the historical thresholds (0.7 / 0.3)', () => {
    expect(energyLevel(0.9)).toEqual({ label: 'High', tone: 'success' })
    expect(energyLevel(0.7).label).toBe('High')
    expect(energyLevel(0.5)).toEqual({ label: 'Medium', tone: 'warning' })
    expect(energyLevel(0.29)).toEqual({ label: 'Low', tone: 'danger' })
  })

  it('cohesion is strong from 0.5', () => {
    expect(cohesionLevel(0.5).label).toBe('Strong')
    expect(cohesionLevel(0.49).label).toBe('Weak')
  })

  it('ratio level: good / fair / poor', () => {
    expect(ratioLevel(0.7).label).toBe('Good')
    expect(ratioLevel(0.4).label).toBe('Fair')
    expect(ratioLevel(0.1).label).toBe('Poor')
  })

  it('pct rounds 0–1 to a percentage and tolerates null', () => {
    expect(pct(0.826)).toBe('83%')
    expect(pct(null)).toBe('0%')
    expect(pct(undefined)).toBe('0%')
  })

  it('tagSummary compacts tags for a meta line', () => {
    expect(tagSummary([])).toBeNull()
    expect(tagSummary(['a', 'b'])).toBe('#a #b')
    expect(tagSummary(['a', 'b', 'c', 'd', 'e'])).toBe('#a #b #c +2')
    expect(tagSummary(['a', 'b', 'c', 'd', 'e'], 4)).toBe('#a #b #c #d +1')
  })

  it('every trigger type has a label and a hint', () => {
    for (const key of ['regex', 'file_glob', 'semantic', 'mcp_action']) {
      expect(TRIGGER_TYPES[key].label).toBeTruthy()
      expect(TRIGGER_TYPES[key].hint).toBeTruthy()
    }
  })
})

describe('fetchAllPages', () => {
  it('walks every page until the total is reached', async () => {
    const calls: [number, number][] = []
    const items = Array.from({ length: 250 }, (_, i) => ({ id: String(i) }))
    const all = await fetchAllPages((limit, offset) => {
      calls.push([limit, offset])
      return Promise.resolve({ items: items.slice(offset, offset + limit), total: items.length, limit, offset })
    })
    expect(all).toHaveLength(250)
    expect(calls).toEqual([
      [100, 0],
      [100, 100],
      [100, 200],
    ])
  })

  it('stops after a short page', async () => {
    let n = 0
    const all = await fetchAllPages((limit, offset) => {
      n++
      return Promise.resolve({ items: [{ id: 'a' }, { id: 'b' }], total: 999, limit, offset })
    })
    expect(all).toHaveLength(2)
    expect(n).toBe(1)
  })

  it('accepts endpoints returning a bare array', async () => {
    const all = await fetchAllPages(() => Promise.resolve([{ id: 'x' }]))
    expect(all).toEqual([{ id: 'x' }])
  })

  it('dedupeById keeps the first occurrence', () => {
    expect(dedupeById([{ id: '1', v: 'a' }, { id: '2', v: 'b' }, { id: '1', v: 'c' }])).toEqual([
      { id: '1', v: 'a' },
      { id: '2', v: 'b' },
    ])
  })
})
