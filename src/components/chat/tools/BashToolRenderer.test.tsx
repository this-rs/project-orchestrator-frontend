import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BashToolRenderer } from './BashToolRenderer'

type Props = Parameters<typeof BashToolRenderer>[0]

const renderBash = (over: Partial<Props> = {}) =>
  render(
    <BashToolRenderer
      toolName="Bash"
      toolInput={{ command: 'ls -la' }}
      isLoading={false}
      {...over}
    />,
  )

/** The element holding the command text (the one that carries the clamp). */
const commandBox = () => screen.getByText(/\$/).parentElement as HTMLElement

describe('BashToolRenderer — command cartouche', () => {
  it('shows a short command as plain text, not as a button', () => {
    renderBash()
    expect(screen.getByText('ls -la')).toBeTruthy()
    expect(commandBox().getAttribute('role')).toBeNull()
  })

  it('clamps a long command to a fixed height and opens it on click', () => {
    const long = 'echo ' + 'x'.repeat(200)
    renderBash({ toolInput: { command: long } })
    const box = commandBox()
    expect(box.getAttribute('role')).toBe('button')
    expect(box.className).toContain('max-h-[3.9rem]')
    fireEvent.click(box)
    expect(box.className).toContain('max-h-64')
    fireEvent.click(box)
    expect(box.className).toContain('max-h-[3.9rem]')
  })

  it('opens and closes a many-line command from the keyboard (Enter and Space)', () => {
    renderBash({ toolInput: { command: 'a\nb\nc\nd' } })
    const box = commandBox()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(box.className).toContain('max-h-64')
    fireEvent.keyDown(box, { key: ' ' })
    expect(box.className).toContain('max-h-[3.9rem]')
    fireEvent.keyDown(box, { key: 'a' })
    expect(box.className).toContain('max-h-[3.9rem]')
  })

  it('keeps the description as a tooltip instead of repeating it', () => {
    const { container } = renderBash({ toolInput: { command: 'ls', description: 'List files' } })
    expect(container.querySelector('[title="List files"]')).not.toBeNull()
    expect(screen.queryByText('List files')).toBeNull()
  })

  it('falls back to the description, then to a placeholder, when there is no command', () => {
    const first = renderBash({ toolInput: { description: 'Do the thing' } })
    expect(screen.getByText('Do the thing')).toBeTruthy()
    first.unmount()
    renderBash({ toolInput: {} })
    expect(screen.getByText('(empty command)')).toBeTruthy()
  })

  it('shows the timeout in seconds or milliseconds, and the background badge', () => {
    const a = renderBash({ toolInput: { command: 'x', timeout: 30000, run_in_background: true } })
    expect(screen.getByText('30s')).toBeTruthy()
    expect(screen.getByText('BG')).toBeTruthy()
    a.unmount()
    renderBash({ toolInput: { command: 'x', timeout: 500 } })
    expect(screen.getByText('500ms')).toBeTruthy()
  })
})

describe('BashToolRenderer — result', () => {
  it('shows a spinner while running and no exit badge', () => {
    renderBash({ isLoading: true })
    expect(screen.getByText('running...')).toBeTruthy()
    expect(screen.queryByText(/^exit /)).toBeNull()
  })

  it('reports exit 0 and the output of a successful command', () => {
    renderBash({ resultContent: 'hello world' })
    expect(screen.getByText('exit 0')).toBeTruthy()
    expect(screen.getByText('hello world')).toBeTruthy()
  })

  it('reads an explicit exit code from the output', () => {
    renderBash({ resultContent: 'boom\nExit code: 2\n' })
    expect(screen.getByText('exit 2')).toBeTruthy()
  })

  it('infers exit 1 from an error result without an explicit code', () => {
    renderBash({ resultContent: 'failed', isError: true })
    expect(screen.getByText('exit 1')).toBeTruthy()
  })

  it('says "no output" for an empty successful result', () => {
    renderBash({ resultContent: '' })
    expect(screen.getByText('no output')).toBeTruthy()
  })

  it('strips ANSI colour codes from the output', () => {
    renderBash({ resultContent: '\u001b[31mred\u001b[0m text' })
    expect(screen.getByText('red text')).toBeTruthy()
  })

  it('truncates a long output and expands it on demand', () => {
    const out = 'y'.repeat(2500)
    renderBash({ resultContent: out })
    const more = screen.getByRole('button', { name: /show 500 more characters/ })
    fireEvent.click(more)
    expect(screen.getByRole('button', { name: 'show less' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'show less' }))
    expect(screen.getByRole('button', { name: /show 500 more characters/ })).toBeTruthy()
  })
})
