import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import { useDocumentScrollGuard } from '../useDocumentScrollGuard'

function App() {
  useDocumentScrollGuard()
  return (
    <>
      <textarea data-testid="field" />
      <button data-testid="button">ok</button>
    </>
  )
}

function setDocumentScroll(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
  Object.defineProperty(window, 'scrollX', { value: 0, configurable: true })
}

describe('useDocumentScrollGuard', () => {
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    setDocumentScroll(0)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    setDocumentScroll(0)
  })

  it('puts a stray document scroll back at the top', () => {
    render(<App />)
    setDocumentScroll(180)
    fireEvent.scroll(window)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
  })

  it('never fights the OS pan while a field has the focus (keyboard up)', () => {
    const { getByTestId } = render(<App />)
    act(() => getByTestId('field').focus())
    setDocumentScroll(180)
    fireEvent.scroll(window)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('restores the document once the keyboard closes on a page the OS left shifted', () => {
    const { getByTestId } = render(<App />)
    act(() => getByTestId('field').focus())
    setDocumentScroll(180)
    act(() => getByTestId('field').blur())
    expect(scrollTo).not.toHaveBeenCalled() // decided a tick later: the focus may be moving to another field
    act(() => { vi.runAllTimers() })
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
  })

  it('leaves an unscrolled document alone', () => {
    const { getByTestId } = render(<App />)
    act(() => getByTestId('button').focus())
    fireEvent.scroll(window)
    act(() => { vi.runAllTimers() })
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
