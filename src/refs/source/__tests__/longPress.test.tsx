/**
 * Long press = "Add to chat" with one finger. Fake timers, synthetic pointer events:
 * it proves the decisions (what starts it, what cancels it, what is excluded), not how a real
 * touch screen scrolls (that is the browser check, and it is emulated, not a device).
 *
 * Run with: npx vitest run src/refs/source/__tests__/longPress.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatDraftInputAtom, chatServerFeaturesAtom } from '@/atoms'
import { LONG_PRESS_MS, ReferenceSourceHost } from '..'
import { PLAN_ID } from './testDnd'

const attr = `plan:${PLAN_ID}`
let store: ReturnType<typeof createStore>

function mount(inner = <span data-testid="t">Auth flow</span>, carrier: Record<string, string> = {}) {
  store = createStore()
  store.set(chatServerFeaturesAtom, ['refs_v1'])
  return render(
    <Provider store={store}>
      <ReferenceSourceHost />
      <div data-testid="card" data-po-ref={attr} data-po-ref-label="Auth flow" {...carrier}>
        {inner}
      </div>
    </Provider>,
  )
}
const down = (el: Element, init: Partial<PointerEventInit> = {}) =>
  fireEvent.pointerDown(el, { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 100, isPrimary: true, ...init })
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const draft = () => store.get(chatDraftInputAtom)

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('long press adds the reference', () => {
  it('adds it once the finger has stayed down for LONG_PRESS_MS', () => {
    const { getByTestId } = mount()
    down(getByTestId('t'))
    wait(LONG_PRESS_MS - 10)
    expect(draft()).toBe('')
    wait(20)
    expect(draft()).toBe(`#plan:${PLAN_ID} `)
  })

  it('is cancelled by lifting the finger early (a tap)', () => {
    const { getByTestId } = mount()
    down(getByTestId('t'))
    wait(100)
    fireEvent.pointerUp(getByTestId('t'), { pointerType: 'touch', pointerId: 1 })
    wait(LONG_PRESS_MS)
    expect(draft()).toBe('')
  })

  it('is cancelled by a movement past the slop (it is a scroll, not a press)', () => {
    const { getByTestId } = mount()
    down(getByTestId('t'))
    fireEvent.pointerMove(getByTestId('t'), { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 130 })
    wait(LONG_PRESS_MS)
    expect(draft()).toBe('')
  })

  it('survives a tremor under the slop', () => {
    const { getByTestId } = mount()
    down(getByTestId('t'))
    fireEvent.pointerMove(getByTestId('t'), { pointerType: 'touch', pointerId: 1, clientX: 103, clientY: 102 })
    wait(LONG_PRESS_MS)
    expect(draft()).toBe(`#plan:${PLAN_ID} `)
  })

  it('is cancelled when the browser takes the gesture (pointercancel: scroll started)', () => {
    const { getByTestId } = mount()
    down(getByTestId('t'))
    fireEvent.pointerCancel(getByTestId('t'), { pointerType: 'touch', pointerId: 1 })
    wait(LONG_PRESS_MS)
    expect(draft()).toBe('')
  })

  it('is cancelled when the page or an ancestor scrolls', () => {
    const { getByTestId } = mount()
    down(getByTestId('t'))
    fireEvent.scroll(document)
    wait(LONG_PRESS_MS)
    expect(draft()).toBe('')
  })

  it('is cancelled by a second finger (pinch)', () => {
    const { getByTestId } = mount()
    down(getByTestId('t'))
    down(getByTestId('t'), { pointerId: 2, isPrimary: false })
    wait(LONG_PRESS_MS)
    expect(draft()).toBe('')
  })

  it('ignores a mouse (it has the drag, the button and the shortcut)', () => {
    const { getByTestId } = mount()
    down(getByTestId('t'), { pointerType: 'mouse' })
    wait(LONG_PRESS_MS)
    expect(draft()).toBe('')
  })

  it('leaves a declared element that keeps its own drag alone (the kanban card: dnd-kit TouchSensor owns the long press)', () => {
    const { getByTestId } = mount(undefined, { 'data-po-ref-drag': 'off' })
    down(getByTestId('t'))
    wait(LONG_PRESS_MS)
    expect(draft()).toBe('')
  })

  it('does not start on a button or a field inside the carrier (they have their own gesture)', () => {
    const { getByTestId } = mount(
      <>
        <button data-testid="b">b</button>
        <input data-testid="i" />
      </>,
    )
    // One finger at a time: lift between the presses so the second is not read as a pinch.
    for (const id of ['b', 'i']) {
      down(getByTestId(id))
      fireEvent.pointerUp(getByTestId(id), { pointerType: 'touch', pointerId: 1 })
    }
    wait(LONG_PRESS_MS)
    expect(draft()).toBe('')
  })

  it('works on a row that is a stretched link (tap navigates, long press adds, and the click after it is swallowed)', () => {
    const { getByTestId } = mount(<a href="#x" data-testid="a">a</a>)
    const onClick = vi.fn()
    getByTestId('a').addEventListener('click', onClick)
    down(getByTestId('a'))
    wait(LONG_PRESS_MS + 10)
    expect(draft()).toBe(`#plan:${PLAN_ID} `)
    fireEvent.click(getByTestId('a'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does not swallow a normal tap on a link', () => {
    const { getByTestId } = mount(<a href="#x" data-testid="a">a</a>)
    const onClick = vi.fn()
    getByTestId('a').addEventListener('click', onClick)
    fireEvent.click(getByTestId('a'))
    expect(onClick).toHaveBeenCalled()
  })

  it('swallows the context menu / callout that follows the press, only after it fired', () => {
    const { getByTestId } = mount()
    const before = new Event('contextmenu', { bubbles: true, cancelable: true })
    getByTestId('t').dispatchEvent(before)
    expect(before.defaultPrevented).toBe(false)
    down(getByTestId('t'))
    wait(LONG_PRESS_MS + 10)
    const after = new Event('contextmenu', { bubbles: true, cancelable: true })
    getByTestId('t').dispatchEvent(after)
    expect(after.defaultPrevented).toBe(true)
  })

  it('gives a haptic tick where the platform has one', () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    const { getByTestId } = mount()
    down(getByTestId('t'))
    wait(LONG_PRESS_MS + 10)
    expect(vibrate).toHaveBeenCalled()
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
  })

  it('is off without refs_v1', () => {
    store = createStore()
    const { getByTestId } = render(
      <Provider store={store}>
        <ReferenceSourceHost />
        <div data-po-ref={attr}><span data-testid="t" /></div>
      </Provider>,
    )
    down(getByTestId('t'))
    wait(LONG_PRESS_MS)
    expect(draft()).toBe('')
  })
})
