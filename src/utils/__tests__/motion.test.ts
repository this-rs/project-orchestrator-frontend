import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { DIALOG_MOTION, DURATION, EASE, backdropVariants, dialogVariants, fadeInUp, stripMovement, useVariants } from '../motion'

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => vi.unstubAllGlobals())

describe('stripMovement (reduced motion: keep the fade, drop the movement)', () => {
  it('keeps opacity on every state of the dialog', () => {
    const r = stripMovement(dialogVariants) as Record<string, Record<string, unknown>>
    expect(r.hidden.opacity).toBe(0)
    expect(r.visible.opacity).toBe(1)
    expect(r.exit.opacity).toBe(0)
  })

  it('drops scale / y and replaces the spring by a short tween', () => {
    const dialog = stripMovement(dialogVariants) as Record<string, Record<string, unknown>>
    const up = stripMovement(fadeInUp) as Record<string, Record<string, unknown>>
    for (const v of [...Object.values(dialog), ...Object.values(up)]) {
      expect(v).not.toHaveProperty('scale')
      expect(v).not.toHaveProperty('y')
    }
    expect(dialog.visible.transition).toEqual({ duration: DURATION.transition, ease: EASE })
    expect(dialog.exit.transition).toEqual({ duration: DURATION.exit, ease: EASE })
  })

  it('replaces a caller-supplied spring by the short tween on the single curve', () => {
    const spring = { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 500 } } }
    const r = stripMovement(spring) as Record<string, Record<string, unknown>>
    expect(r.visible).toEqual({ opacity: 1, transition: { duration: DURATION.transition, ease: EASE } })
  })

  it('is stable across calls (no new variants object per render)', () => {
    expect(stripMovement(dialogVariants)).toBe(stripMovement(dialogVariants))
  })
})

describe('presets — one curve, named durations, no spring', () => {
  const states = (v: Record<string, unknown>) => Object.values(v) as Record<string, unknown>[]

  it('every preset state with a transition uses EASE and a named duration', () => {
    for (const v of [...states(fadeInUp), ...states(dialogVariants), ...states(backdropVariants)]) {
      const t = v.transition as Record<string, unknown> | undefined
      if (!t) continue
      expect(t.type).toBeUndefined()
      expect(t.ease).toBe(EASE)
      expect(Object.values(DURATION)).toContain(t.duration)
    }
  })

  it('exits are shorter than entrances', () => {
    const d = dialogVariants as Record<string, { transition: { duration: number } }>
    expect(d.exit.transition.duration).toBeLessThan(d.visible.transition.duration)
    expect(DURATION.exit).toBeLessThan(DURATION.transition)
  })

  it('EASE is the CSS token value', () => {
    expect(EASE).toEqual([0.22, 1, 0.36, 1])
  })
})

describe('useVariants', () => {
  it('returns the full variants when motion is allowed', () => {
    mockReducedMotion(false)
    const { result } = renderHook(() => useVariants(DIALOG_MOTION))
    expect(result.current).toBe(DIALOG_MOTION)
  })

  it('returns opacity-only variants — not empty ones — under reduced motion', () => {
    mockReducedMotion(true)
    const { result } = renderHook(() => useVariants(DIALOG_MOTION))
    const dialog = result.current.dialog as Record<string, Record<string, unknown>>
    expect(dialog.hidden).toEqual({ opacity: 0 })
    expect(dialog.visible.opacity).toBe(1)
    expect(result.current.backdrop).toEqual(stripMovement(DIALOG_MOTION.backdrop))
    expect((result.current.backdrop as Record<string, Record<string, unknown>>).hidden.opacity).toBe(0)
  })

  it('never hands a dialog undefined or empty variants under reduced motion', () => {
    mockReducedMotion(true)
    const { result } = renderHook(() => useVariants(DIALOG_MOTION))
    for (const key of Object.keys(DIALOG_MOTION) as (keyof typeof DIALOG_MOTION)[]) {
      const v = result.current[key] as Record<string, Record<string, unknown>>
      expect(v).toBeDefined()
      for (const state of ['hidden', 'visible', 'exit']) {
        expect(v[state]).toBeDefined()
        expect(v[state]).toHaveProperty('opacity')
      }
    }
  })
})
