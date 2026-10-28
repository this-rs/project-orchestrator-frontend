/**
 * The edit affordances of a queued row.
 *
 * What a queued message must let the user do, and what the first version got
 * wrong: the pencil stayed a pencil while editing, so the button that saves was
 * visually identical to the one that started the edit, the only way out was
 * Esc or clicking elsewhere, and the single-line `<input>` hid everything past
 * the first screenful of a long message.
 *
 * Here we pin:
 * - the pencil's slot BECOMES ✓ while editing, with ✕ beside it: committing and
 *   discarding are visible, notionally at the same place as the button that
 *   opened the box;
 * - ✓ saves, ✕ and Esc keep the message as it was, Enter saves, Shift+Enter
 *   breaks the line, and an untouched box is not an edit;
 * - leaving the box (blur) saves — which is exactly why ✓ and ✕ swallow their
 *   own mousedown, or the blur would commit before ✕ could discard;
 * - the box follows its text (up to the cap, then it scrolls) and focuses with
 *   the caret at the end;
 * - delete and the send button step aside while editing: they would act on the
 *   text being replaced ("send now" would ship the old wording).
 *
 * Run with: npx vitest run src/components/chat/MessageQueueBar.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MessageQueueBar } from './MessageQueueBar'
import type { QueuedMessage } from './messageQueue'

const row = (id: string, text: string, extra: Partial<QueuedMessage> = {}): QueuedMessage => ({
  id,
  text,
  queuedAt: 0,
  ...extra,
})

function mount(queue: QueuedMessage[]) {
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  const onPrioritize = vi.fn()
  const onSendNow = vi.fn()
  render(
    <MessageQueueBar
      queue={queue}
      onEdit={onEdit}
      onDelete={onDelete}
      onPrioritize={onPrioritize}
      onSendNow={onSendNow}
    />,
  )
  return { onEdit, onDelete, onPrioritize, onSendNow }
}

const startEdit = () => fireEvent.click(screen.getByLabelText('Edit message'))
const box = () => screen.getByLabelText('Edit queued message') as HTMLTextAreaElement
const iconClass = (el: HTMLElement) => el.querySelector('svg')?.getAttribute('class') ?? ''

describe('MessageQueueBar — editing a queued message', () => {
  it('turns the pencil into a check and shows a cancel beside it', () => {
    mount([row('1', 'held for later')])

    expect(screen.queryByLabelText('Save edit')).toBeNull()
    expect(screen.queryByLabelText('Cancel edit')).toBeNull()

    startEdit()

    const save = screen.getByLabelText('Save edit')
    const cancel = screen.getByLabelText('Cancel edit')
    // Same slot as the pencil: the glyph changed, the button did not move.
    expect(save.getAttribute('data-action')).toBe('save-edit')
    expect(save.parentElement?.firstElementChild).toBe(save)
    expect(iconClass(save)).toContain('lucide-check')
    expect(cancel.getAttribute('data-action')).toBe('cancel-edit')
    expect(iconClass(cancel)).toContain('lucide-x')
    // The pencil is gone: one button cannot mean "edit" and "save" at once.
    expect(screen.queryByLabelText('Edit message')).toBeNull()
  })

  it('saves the edited text on the check, and closes the box', () => {
    const { onEdit } = mount([row('1', 'held for later')])
    startEdit()
    fireEvent.change(box(), { target: { value: '  corrected  ' } })
    fireEvent.click(screen.getByLabelText('Save edit'))

    expect(onEdit).toHaveBeenCalledWith('1', '  corrected  ')
    expect(screen.queryByLabelText('Edit queued message')).toBeNull()
    expect(screen.getByLabelText('Edit message')).toBeTruthy()
  })

  it('keeps the message as it was on the cross, and sends no edit', () => {
    const { onEdit } = mount([row('1', 'held for later')])
    startEdit()
    fireEvent.change(box(), { target: { value: 'thrown away' } })
    fireEvent.click(screen.getByLabelText('Cancel edit'))

    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Edit queued message')).toBeNull()
    expect(screen.getByText('held for later')).toBeTruthy()
  })

  it('Enter saves, Shift+Enter breaks the line, Escape cancels', () => {
    const { onEdit } = mount([row('1', 'one')])
    startEdit()

    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true })
    expect(onEdit).not.toHaveBeenCalled()
    expect(box()).toBeTruthy()

    fireEvent.change(box(), { target: { value: 'two' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onEdit).toHaveBeenCalledWith('1', 'two')
    expect(screen.queryByLabelText('Edit queued message')).toBeNull()

    startEdit()
    fireEvent.change(box(), { target: { value: 'three' } })
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(screen.getByText('one')).toBeTruthy()
  })

  it('treats an untouched box as no edit at all', () => {
    const { onEdit } = mount([row('1', 'unchanged')])
    startEdit()
    fireEvent.click(screen.getByLabelText('Save edit'))

    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Edit queued message')).toBeNull()
  })

  it('saves on blur — which is why the check and the cross cancel their mousedown', () => {
    const { onEdit } = mount([row('1', 'one')])
    startEdit()
    fireEvent.change(box(), { target: { value: 'two' } })
    // Walking away from the box (a click on the transcript, another row…) saves.
    fireEvent.blur(box())
    expect(onEdit).toHaveBeenCalledWith('1', 'two')

    // The two buttons must not trigger that same blur before their own click:
    // ✕ would then discard an edit the save handler had already committed.
    startEdit()
    for (const label of ['Save edit', 'Cancel edit']) {
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      screen.getByLabelText(label).dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
  })

  it('hides delete and send while editing, and brings them back after', () => {
    mount([row('1', 'one')])

    expect(screen.getByLabelText('Delete message')).toBeTruthy()
    expect(document.querySelector('[data-stage="send-next"]')).toBeTruthy()

    startEdit()
    // "send now" on a row being rewritten would ship the OLD wording; delete
    // would throw the edit away — both sat one stray tap from ✕.
    expect(screen.queryByLabelText('Delete message')).toBeNull()
    expect(document.querySelector('[data-stage]')).toBeNull()

    fireEvent.click(screen.getByLabelText('Cancel edit'))
    expect(screen.getByLabelText('Delete message')).toBeTruthy()
    expect(document.querySelector('[data-stage="send-next"]')).toBeTruthy()
  })

  it('opens the whole text in a box that follows it, then scrolls past the cap', () => {
    mount([row('1', 'a message long enough to wrap several times')])
    startEdit()

    const el = box()
    // A textarea, not a one-line input: a long message is readable while edited.
    expect(el.tagName).toBe('TEXTAREA')
    expect(el.value).toBe('a message long enough to wrap several times')
    // The caret is at the end: a queued message is usually corrected, not rewritten.
    expect(document.activeElement).toBe(el)
    expect(el.selectionStart).toBe(el.value.length)
    // On a phone the return key says what it does — it saves. No soft keyboard
    // offers Shift+Enter, so "Return" would promise a line break we never give.
    expect(el.getAttribute('enterkeyhint')).toBe('done')

    // jsdom has no layout (scrollHeight = 0); the height comes from the content.
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 42 })
    fireEvent.change(el, { target: { value: 'two lines' } })
    expect(el.style.height).toBe('42px')

    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 400 })
    fireEvent.change(el, { target: { value: 'many lines' } })
    expect(el.style.height).toBe('96px')
  })
})
