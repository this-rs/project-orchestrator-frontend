/**
 * Tests for ModelFamilyPicker — one line per family, version chosen on that
 * line with a single stepped-track control (2 stops = toggle, 3+ = slider).
 *
 * Run with: npx vitest run src/components/chat/ModelFamilyPicker.test.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ModelFamilyPicker } from './ModelFamilyPicker'
import { groupModelsByFamily, type ModelDefinition } from '@/constants/models'

function model(id: string, family: ModelDefinition['family'], version: string, tier: ModelDefinition['tier']): ModelDefinition {
  const label = `${family[0].toUpperCase()}${family.slice(1)} ${version}`
  return { id, family, version, tier, shortLabel: label, fullLabel: `Claude ${label}`, description: '' }
}

// Mirrors the backend's curated catalog (backend/src/chat/model_catalog.rs).
const CATALOG: ModelDefinition[] = [
  model('claude-opus-5-5', 'opus', '5.5', 'current'),
  model('claude-fable-5-1', 'fable', '5.1', 'current'),
  model('claude-sonnet-5', 'sonnet', '5', 'current'),
  model('claude-haiku-4-5', 'haiku', '4.5', 'current'),
  model('claude-opus-5', 'opus', '5', 'legacy'),
  model('claude-fable-5', 'fable', '5', 'legacy'),
  model('claude-opus-4-8', 'opus', '4.8', 'legacy'),
  model('claude-opus-4-7', 'opus', '4.7', 'legacy'),
  model('claude-opus-4-6', 'opus', '4.6', 'legacy'),
  model('claude-sonnet-4-6', 'sonnet', '4.6', 'legacy'),
]

// jsdom has no layout and no PointerEvent. Give every rail a 100px width
// starting at x=0 so a pointer's clientX maps directly to a percentage.
beforeAll(() => {
  if (!('PointerEvent' in window)) {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
      }
    }
    Object.defineProperty(window, 'PointerEvent', { value: PointerEventPolyfill, configurable: true })
  }
})

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, right: 100, width: 100, top: 0, bottom: 24, height: 24, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderPicker(activeModelId = 'claude-sonnet-5') {
  const onSelect = vi.fn()
  const utils = render(
    <ModelFamilyPicker
      groups={groupModelsByFamily(CATALOG)}
      activeModelId={activeModelId}
      loaded
      onSelect={onSelect}
    />,
  )
  return { ...utils, onSelect }
}

const row = (family: string) => screen.getByTestId(`model-family-${family}`)
const track = (family: string) => within(row(family)).getByRole('slider')

describe('layout', () => {
  it('renders one line per family, not one per model', () => {
    renderPicker()
    expect(screen.queryAllByTestId(/^model-family-/)).toHaveLength(4)
  })

  it('shows a colored dot on every family line', () => {
    // Regression: the dots vanished when the payload stopped carrying
    // `dotColor`. Colors now come from the frontend's family map.
    renderPicker()
    for (const family of ['opus', 'fable', 'sonnet', 'haiku']) {
      const dot = row(family).querySelector('span[aria-hidden="true"]')
      expect(dot?.className).toMatch(/\bbg-[a-z]+-\d{3}\b/)
      expect(dot?.className).not.toContain('undefined')
    }
  })

  it('uses one control for toggle and slider: same element, same slot, same look', () => {
    renderPicker()
    const toggle = track('fable') // 2 versions
    const slider = track('opus') // 5 versions
    expect(toggle.getAttribute('aria-valuemax')).toBe('1')
    expect(slider.getAttribute('aria-valuemax')).toBe('4')
    // Coherence is structural, not a styling convention to keep in sync.
    expect(toggle.className).toBe(slider.className)
    expect(toggle.parentElement?.className).toBe(slider.parentElement?.className)
  })

  it('shows no control for a single-version family, but keeps its version aligned', () => {
    renderPicker()
    expect(within(row('haiku')).queryByRole('slider')).toBeNull()
    expect(within(row('haiku')).getByText('4.5')).toBeTruthy()
  })

  it('orders stops oldest to newest and opens on the recommended version', () => {
    renderPicker()
    expect(track('opus').getAttribute('aria-valuenow')).toBe('4')
    expect(track('opus').getAttribute('aria-valuetext')).toBe('5.5')
  })

  it('opens the active family on the active version', () => {
    renderPicker('claude-opus-4-7')
    expect(track('opus').getAttribute('aria-valuetext')).toBe('4.7')
  })

  it('shows loading, then empty, when there is nothing to list', () => {
    const { rerender } = render(<ModelFamilyPicker groups={[]} activeModelId="" loaded={false} onSelect={vi.fn()} />)
    expect(screen.getByText(/Loading models/)).toBeTruthy()
    rerender(<ModelFamilyPicker groups={[]} activeModelId="" loaded onSelect={vi.fn()} />)
    expect(screen.getByText('No models available')).toBeTruthy()
  })
})

// Every gesture is exercised on BOTH a toggle and a slider: identical usage
// is the point, so it is asserted rather than assumed.
describe.each([
  { kind: 'slider', family: 'opus', startText: '5.5', dragTo: 25, dragText: '4.7', dragId: 'claude-opus-4-7', stepId: 'claude-opus-5' },
  { kind: 'toggle', family: 'fable', startText: '5.1', dragTo: 10, dragText: '5', dragId: 'claude-fable-5', stepId: 'claude-fable-5' },
])('$kind — shared gestures', ({ family, startText, dragTo, dragText, dragId, stepId }) => {
  it('moving only previews; release commits exactly once', () => {
    const { onSelect } = renderPicker()
    const t = track(family)

    fireEvent.pointerDown(t, { clientX: 90, pointerId: 1 })
    fireEvent.pointerMove(t, { clientX: 60, pointerId: 1 })
    fireEvent.pointerMove(t, { clientX: dragTo, pointerId: 1 })

    // In an active session each selection is a mid-session model switch sent
    // over the socket; a drag must not fire one per stop crossed.
    expect(onSelect).not.toHaveBeenCalled()
    expect(t.getAttribute('aria-valuetext')).toBe(dragText)

    fireEvent.pointerUp(t, { clientX: dragTo, pointerId: 1 })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(dragId, { close: false })
  })

  it('tapping a stop selects it', () => {
    const { onSelect } = renderPicker()
    const t = track(family)
    fireEvent.pointerDown(t, { clientX: dragTo, pointerId: 1 })
    fireEvent.pointerUp(t, { clientX: dragTo, pointerId: 1 })
    expect(onSelect).toHaveBeenCalledWith(dragId, { close: false })
  })

  it('a gesture taken over by scrolling is discarded, not committed', () => {
    // On touch, a vertical swipe starting on the track becomes a scroll and
    // the browser sends pointercancel instead of pointerup.
    const { onSelect } = renderPicker()
    const t = track(family)
    fireEvent.pointerDown(t, { clientX: dragTo, pointerId: 1 })
    fireEvent.pointerCancel(t, { pointerId: 1 })
    expect(onSelect).not.toHaveBeenCalled()
    expect(t.getAttribute('aria-valuetext')).toBe(startText)
  })

  it('arrow keys preview on key-down and commit on key-up', () => {
    const { onSelect } = renderPicker()
    const t = track(family)
    fireEvent.keyDown(t, { key: 'ArrowLeft' })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.keyUp(t, { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenCalledWith(stepId, { close: false })
  })

  it('merely tabbing onto the control does not switch model', () => {
    // Tab's key-up lands on the newly focused control. If that committed,
    // tabbing through the picker would switch to another family's model.
    const { onSelect } = renderPicker()
    fireEvent.keyUp(track(family), { key: 'Tab' })
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('commit rules', () => {
  it('does not re-send the model that is already active', () => {
    const { onSelect } = renderPicker('claude-opus-5-5')
    const t = track('opus')
    fireEvent.pointerDown(t, { clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(t, { clientX: 100, pointerId: 1 })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('clicking a family name selects its shown version and closes', () => {
    const { onSelect } = renderPicker()
    fireEvent.click(within(row('opus')).getByRole('button', { name: /Opus/ }))
    expect(onSelect).toHaveBeenCalledWith('claude-opus-5-5', { close: true })
  })

  it('clicking the active family still closes the picker', () => {
    const { onSelect } = renderPicker('claude-sonnet-5')
    fireEvent.click(within(row('sonnet')).getByRole('button', { name: /Sonnet/ }))
    expect(onSelect).toHaveBeenCalledWith('claude-sonnet-5', { close: true })
  })
})
