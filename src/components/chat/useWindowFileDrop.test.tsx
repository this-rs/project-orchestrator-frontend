/**
 * The guard's whole job is to stop the browser from navigating to a dropped
 * file, while not stealing drops that belong to another page's drop zone.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { CHAT_PANEL_ATTR, useWindowFileDrop } from './useWindowFileDrop'

/** jsdom has no DataTransfer; a drag only exposes `types` and `files` to us. */
function dropOn(target: Element, files: File[] = []): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], files, dropEffect: 'none' },
  })
  target.dispatchEvent(event)
  return event
}

function dragOver(target: Element): Event {
  const event = new Event('dragover', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], files: [], dropEffect: 'none' },
  })
  target.dispatchEvent(event)
  return event
}

const mounted: Element[] = []
function panel(): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute(CHAT_PANEL_ATTR, '')
  document.body.appendChild(el)
  mounted.push(el)
  return el
}
function elsewhere(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  mounted.push(el)
  return el
}

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove()
})

describe('useWindowFileDrop', () => {
  it('refuses the drag, so the drop event happens at all', () => {
    renderHook(() => useWindowFileDrop(vi.fn()))
    expect(dragOver(elsewhere()).defaultPrevented).toBe(true)
  })

  it('stops the browser from opening a file dropped outside the chat panel', () => {
    const onFiles = vi.fn()
    renderHook(() => useWindowFileDrop(onFiles))

    const event = dropOn(elsewhere(), [new File(['x'], 'shot.png', { type: 'image/png' })])

    expect(event.defaultPrevented).toBe(true)
    // …but it does not attach itself to a chat the user was not looking at.
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('hands a file dropped in the chat panel to the composer', () => {
    const onFiles = vi.fn()
    renderHook(() => useWindowFileDrop(onFiles))
    const file = new File(['x'], 'shot.png', { type: 'image/png' })

    const event = dropOn(panel(), [file])

    expect(event.defaultPrevented).toBe(true)
    expect(onFiles).toHaveBeenCalledWith([file])
  })

  it('works from a child of the panel', () => {
    const onFiles = vi.fn()
    renderHook(() => useWindowFileDrop(onFiles))
    const child = document.createElement('span')
    panel().appendChild(child)

    dropOn(child, [new File(['x'], 'notes.txt', { type: 'text/plain' })])

    expect(onFiles).toHaveBeenCalledTimes(1)
  })

  it('ignores a drag that carries no file (selected text, a reference)', () => {
    const onFiles = vi.fn()
    renderHook(() => useWindowFileDrop(onFiles))
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['text/plain'], files: [] } })

    panel().dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('does nothing while inactive, and unregisters on unmount', () => {
    const onFiles = vi.fn()
    const { unmount, rerender } = renderHook(({ active }) => useWindowFileDrop(onFiles, active), {
      initialProps: { active: false },
    })

    expect(dragOver(panel()).defaultPrevented).toBe(false)

    rerender({ active: true })
    expect(dragOver(panel()).defaultPrevented).toBe(true)

    unmount()
    expect(dragOver(panel()).defaultPrevented).toBe(false)
  })
})
