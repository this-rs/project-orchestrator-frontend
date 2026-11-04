import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TIER_BUDGETS,
  classifyDevice,
  currentDeviceBudget,
  readDeviceSignals,
  resetDeviceBudgetCache,
  type DeviceSignals,
} from './deviceTier'

import { DEFAULT_SYSTEM_BUDGET } from './linkSystem'
const sig = (over: Partial<DeviceSignals> = {}): DeviceSignals => ({ coarsePointer: false, ...over })

describe('classifyDevice', () => {
  it('desktop with nothing reported is high (today\'s behaviour)', () => {
    expect(classifyDevice(sig())).toBe('high')
    expect(classifyDevice(sig({ cores: 16, pixelRatio: 2 }))).toBe('high')
    expect(classifyDevice(sig({ deviceMemoryGb: 8, cores: 12, pixelRatio: 2 }))).toBe('high')
  })

  it('a high-end desktop stays high whatever its pixel ratio', () => {
    expect(classifyDevice(sig({ deviceMemoryGb: 8, cores: 8, pixelRatio: 3 }))).toBe('high')
  })

  it('a weak desktop drops to medium, a very weak one to low', () => {
    expect(classifyDevice(sig({ deviceMemoryGb: 4 }))).toBe('medium')
    expect(classifyDevice(sig({ cores: 4 }))).toBe('medium')
    expect(classifyDevice(sig({ deviceMemoryGb: 2 }))).toBe('low')
    expect(classifyDevice(sig({ cores: 2 }))).toBe('low')
  })

  it('a touch device is at most medium, unless it is a large tablet', () => {
    expect(classifyDevice(sig({ coarsePointer: true, deviceMemoryGb: 4, cores: 6, pixelRatio: 3 }))).toBe('medium')
    expect(classifyDevice(sig({ coarsePointer: true }))).toBe('medium')
    expect(classifyDevice(sig({ coarsePointer: true, deviceMemoryGb: 8, cores: 8 }))).toBe('high')
    expect(classifyDevice(sig({ coarsePointer: true, deviceMemoryGb: 8 }))).toBe('medium') // cores unknown: does not vote up
  })

  it('a touch device with low memory is low', () => {
    expect(classifyDevice(sig({ coarsePointer: true, deviceMemoryGb: 2, cores: 8 }))).toBe('low')
    expect(classifyDevice(sig({ coarsePointer: true, deviceMemoryGb: 0.5 }))).toBe('low')
  })

  it('a dense touch screen with unreported memory (Safari phone) is low', () => {
    expect(classifyDevice(sig({ coarsePointer: true, pixelRatio: 3, cores: 6 }))).toBe('low')
    expect(classifyDevice(sig({ coarsePointer: true, pixelRatio: 2 }))).toBe('medium')
  })

  it('absent or nonsensical signals never lower a desktop', () => {
    expect(classifyDevice(sig({ deviceMemoryGb: undefined, cores: undefined, pixelRatio: undefined }))).toBe('high')
    expect(classifyDevice(sig({ deviceMemoryGb: Number.NaN, cores: 0 }))).toBe('high')
  })
})

describe('TIER_BUDGETS', () => {
  it('high is exactly what the app did before tiers existed', () => {
    const h = TIER_BUDGETS.high
    expect(h.nodeBudget).toBe(20_000)
    expect(h.maxNodesForHulls).toBe(Infinity)
    expect(h.maxNodesForLabels).toBe(Infinity)
    expect(h.maxNodesForCommunityDetection).toBe(Infinity)
    expect(h.labelLimit).toBe(40) // SUPER_NODE_LABEL_LIMIT
    expect(h.maxPixelRatio).toBe(1.5) // MAX_PIXEL_RATIO
  })

  it('every threshold is monotone: low <= medium <= high', () => {
    const keys = ['nodeBudget', 'maxNodesForHulls', 'maxNodesForLabels', 'labelLimit', 'maxNodesForCommunityDetection', 'maxPixelRatio'] as const
    for (const k of keys) {
      expect(TIER_BUDGETS.low[k]).toBeLessThanOrEqual(TIER_BUDGETS.medium[k])
      expect(TIER_BUDGETS.medium[k]).toBeLessThanOrEqual(TIER_BUDGETS.high[k])
    }
  })

  it('low requests 4 000 nodes, switches halos and labels off past 2 000 and Louvain off past 4 000', () => {
    const l = TIER_BUDGETS.low
    expect(l.nodeBudget).toBe(4_000)
    expect(l.maxNodesForHulls).toBe(2_000)
    expect(l.maxNodesForLabels).toBe(2_000)
    expect(l.maxNodesForCommunityDetection).toBe(4_000)
    // the budget it requests never exceeds what it agrees to run community detection on
    expect(l.nodeBudget).toBeLessThanOrEqual(l.maxNodesForCommunityDetection)
  })

  it('medium requests 8 000 nodes and drops halos where the view aggregates (4 000)', () => {
    const m = TIER_BUDGETS.medium
    expect(m.nodeBudget).toBe(8_000)
    expect(m.maxNodesForHulls).toBe(4_000)
    expect(m.maxNodesForCommunityDetection).toBe(8_000)
  })

  it('a touch device never opens above one device pixel per CSS pixel', () => {
    expect(TIER_BUDGETS.low.maxPixelRatio).toBe(1)
    expect(TIER_BUDGETS.medium.maxPixelRatio).toBe(1)
  })
})

describe('readDeviceSignals / currentDeviceBudget', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    resetDeviceBudgetCache()
  })

  it('jsdom (no matchMedia, no deviceMemory) reads as desktop high', () => {
    // Explicit absence: another test file installs a global matchMedia, and
    // with vitest's file order it leaked into this one, so the suite passed
    // locally and failed in CI. Stub it out instead of assuming nothing set it.
    vi.stubGlobal('matchMedia', undefined)
    // Same for the core count: jsdom forwards the HOST's, and a 4-core CI runner
    // reads as medium (the gate failed on 04/11 with 5490 tests green). A desktop
    // that reports no core count is the case this test pins.
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(undefined as unknown as number)
    resetDeviceBudgetCache()
    expect(readDeviceSignals().coarsePointer).toBe(false)
    expect(currentDeviceBudget().tier).toBe('high')
    expect(currentDeviceBudget().budget).toBe(TIER_BUDGETS.high)
  })

  it('reads a phone: coarse pointer, deviceMemory, cores, pixel ratio', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' }))
    vi.stubGlobal('devicePixelRatio', 3)
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(6)
    Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true })
    resetDeviceBudgetCache()
    expect(readDeviceSignals()).toEqual({ coarsePointer: true, deviceMemoryGb: 2, cores: 6, pixelRatio: 3 })
    expect(currentDeviceBudget().tier).toBe('low')
    Reflect.deleteProperty(navigator, 'deviceMemory')
  })
})

describe('link budget per tier', () => {
  it('high keeps the link system defaults, lower tiers spend strictly less', () => {
    expect(TIER_BUDGETS.high.maxLinkTriangles).toBe(DEFAULT_SYSTEM_BUDGET.maxTriangles)
    expect(TIER_BUDGETS.high.maxLinkBundles).toBe(DEFAULT_SYSTEM_BUDGET.maxCorridors)
    expect(TIER_BUDGETS.medium.maxLinkTriangles).toBeLessThan(TIER_BUDGETS.high.maxLinkTriangles)
    expect(TIER_BUDGETS.low.maxLinkTriangles).toBeLessThan(TIER_BUDGETS.medium.maxLinkTriangles)
    expect(TIER_BUDGETS.medium.maxLinkBundles).toBeLessThan(TIER_BUDGETS.high.maxLinkBundles)
    expect(TIER_BUDGETS.low.maxLinkBundles).toBeLessThan(TIER_BUDGETS.medium.maxLinkBundles)
  })
})
