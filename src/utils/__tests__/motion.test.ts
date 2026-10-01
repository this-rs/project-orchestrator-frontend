import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { DIALOG_MOTION, dialogVariants, fadeInUp, stripMovement, useVariants } from '../motion'

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
    expect(dialog.visible.transition).toEqual({ duration: 0.2, ease: 'easeOut' })
    expect(dialog.exit.transition).toEqual({ duration: 0.15, ease: 'easeOut' })
  })

  it('is stable across calls (no new variants object per render)', () => {
    expect(stripMovement(dialogVariants)).toBe(stripMovement(dialogVariants))
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
})
