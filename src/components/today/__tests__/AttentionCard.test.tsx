import { describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '@/services/api'
import { ORPHAN_NOTICE } from '@/hooks/useAttention'
import { provenanceText } from '@/components/ui/classes'
import { ROW_TEXT, questionAnswerMessage } from '../ThreadRow'
import { AttentionCard, linkLabel, provenanceLabels, type AttentionCardProps } from '../AttentionCard'
import type { WaitingRequest } from '@/types/attention'

/** The link to the conversation (not exported by the component). */
const OPEN = 'Open the conversation'
/** The label shown when the conversation belongs to no plan (what `provenanceLabels` says for no link). */
const FREE_PROVENANCE = 'Free conversation: attached to no plan'

const COMMAND = 'cd /srv/app && ' + 'find . -name "*.log" -mtime +30 -print0 | xargs -0 rm -f # '.repeat(6) + 'END'

const permission: WaitingRequest = {
  request_id: 'req-perm-1',
  kind: 'permission',
  session_id: '11111111-aaaa-bbbb-cccc-000000000001',
  thread_id: 'th-1',
  workspace: 'acme',
  tool_name: 'Bash',
  text: COMMAND,
  options: [],
  seq: 7,
  requested_at: new Date(Date.now() - 3 * 60_000).toISOString(),
  age_secs: 180,
}

const question: WaitingRequest = {
  ...permission,
  request_id: 'req-q-1',
  kind: 'question',
  tool_name: null,
  text: 'Quelle base de données utiliser ?',
  options: [
    { label: 'PostgreSQL', description: 'Robuste, déjà en prod' },
    { label: 'SQLite', description: null },
  ],
}

function setup(over: Partial<AttentionCardProps> = {}) {
  const onPermission = vi.fn().mockResolvedValue(true)
  const onReply = vi.fn().mockResolvedValue(true)
  const props: AttentionCardProps = {
    request: permission,
    lane: 'Acme',
    threadTitle: 'Refonte du billing',
    session: { title: 'Agent billing', state: 'live' },
    links: [{ via: 'runner_run', run_id: 'abcdef1234567890', task_id: null, plan_id: null }],
    onPermission,
    onReply,
    ...over,
  }
  render(
    <MemoryRouter>
      <AttentionCard {...props} />
    </MemoryRouter>,
  )
  return { onPermission, onReply }
}

describe('AttentionCard — permission', () => {
  it('is a named region for screen readers', () => {
    setup()
    expect(screen.getByRole('region', { name: 'Permission asked by Agent billing' })).toBeTruthy()
  })

  it('shows the whole command, never truncated, in a wrapping monospace block', () => {
    setup()
    const block = screen.getByTestId('attention-text')
    expect(block.textContent).toBe(COMMAND)
    expect(COMMAND.length).toBeGreaterThan(300)
    expect(block.className).toMatch(/font-mono/)
    expect(block.className).toMatch(/whitespace-pre-wrap/)
    expect(block.className).toMatch(/break-words/)
    expect(block.className).not.toMatch(/truncate|line-clamp|overflow-x|overflow-hidden|text-ellipsis/)
  })

  it('shows kind, thread, lane and age, in that order, on one header line above the command', () => {
    setup()
    const card = screen.getByTestId('attention-card')
    const t = card.textContent ?? ''
    expect(t.indexOf('Permission')).toBe(0)
    expect(t.indexOf('Permission')).toBeLessThan(t.indexOf('Refonte du billing'))
    expect(t.indexOf('Refonte du billing')).toBeLessThan(t.indexOf('Acme'))
    expect(t.indexOf('Acme')).toBeLessThan(t.indexOf('for '))
    expect(t.indexOf('for ')).toBeLessThan(t.indexOf(COMMAND.slice(0, 20)))
    const header = card.firstElementChild as HTMLElement
    for (const word of ['Permission', 'Refonte du billing', 'Acme', 'for '])
      expect(header.textContent).toContain(word)
  })

  it('a question says "Question" as its kind word', () => {
    setup({ request: question })
    expect((screen.getByTestId('attention-card').firstElementChild as HTMLElement).textContent).toMatch(/^Question/)
  })

  it('live: the indicator is announced ("live", sr-only) but is not visible text', () => {
    setup()
    const live = screen.getByText('live')
    expect(live.className).toBe('sr-only')
    expect(screen.queryByText('stopped')).toBeNull()
    expect(screen.queryByText('state unknown')).toBeNull()
  })

  it('not live: "stopped" (dead) / "state unknown" (unknown) is VISIBLE text, and never "live"', () => {
    setup({ session: { title: 'Agent billing', state: 'dead' } })
    const stopped = screen.getByText('stopped')
    expect(stopped.closest('.sr-only')).toBeNull()
    expect(screen.queryByText('vivant')).toBeNull()
    cleanup()
    setup({ session: null })
    expect(screen.getByText('state unknown').closest('.sr-only')).toBeNull()
    expect(screen.queryByText('vivant')).toBeNull()
    expect(screen.queryByText('stopped')).toBeNull()
  })

  it('introduces the command with the tool the assistant wants to run', () => {
    setup()
    const intro = screen.getByTestId('attention-text').previousElementSibling as HTMLElement
    expect(intro.textContent).toBe('The assistant wants to launch Bash:')
  })

  it('offers exactly one primary and one secondary, plus a link, and no dialog', () => {
    setup()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Allow', 'Deny'])
    const link = screen.getByRole('link', { name: OPEN })
    expect(link.getAttribute('href')).toBe('/workspace/acme/chat/11111111-aaaa-bbbb-cccc-000000000001')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sends Allow at once, with no confirmation', async () => {
    const { onPermission } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(onPermission).toHaveBeenCalledWith(permission, true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sends Deny as a deny', async () => {
    const { onPermission } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(onPermission).toHaveBeenCalledWith(permission, false)
  })

  it('cannot be double-tapped: locked while in flight and after success', async () => {
    let release!: (v: boolean) => void
    const onPermission = vi.fn(() => new Promise<boolean>((r) => (release = r)))
    setup({ onPermission })
    const allow = screen.getByRole('button', { name: 'Allow' })
    fireEvent.click(allow)
    fireEvent.click(allow)
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(onPermission).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: 'Deny' }) as HTMLButtonElement).disabled).toBe(true)
    release(true)
    await screen.findByText('Answer sent.')
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(onPermission).toHaveBeenCalledTimes(1)
  })

  it('treats a 409 as already decided, not as an error', async () => {
    const onPermission = vi.fn().mockRejectedValue(new ApiError(409, 'conflict'))
    setup({ onPermission })
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(await screen.findByText(/Already decided/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect((screen.getByRole('button', { name: 'Allow' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('treats the "already_decided" result like a 409', async () => {
    setup({ onPermission: vi.fn().mockResolvedValue('already_decided') })
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(await screen.findByText(/Already decided/)).toBeTruthy()
  })

  it('on failure shows an alert and re-enables the buttons', async () => {
    const onPermission = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    setup({ onPermission })
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not sent/)
    const allow = screen.getByRole('button', { name: 'Allow' }) as HTMLButtonElement
    expect(allow.disabled).toBe(false)
    fireEvent.click(allow)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(onPermission).toHaveBeenCalledTimes(2)
  })

  it('on a thrown network error shows an alert and allows a retry', async () => {
    setup({ onPermission: vi.fn().mockRejectedValue(new Error('boom')) })
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Allow' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('410 -> orphan: notice, no more Allow/Deny, conversation link kept', async () => {
    setup({ onPermission: vi.fn().mockRejectedValue(new ApiError(410, 'gone')) })
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect((await screen.findByRole('status')).textContent).toBe(ORPHAN_NOTICE)
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull()
    expect(screen.getByRole('link', { name: OPEN })).toBeTruthy()
  })

  it('a DEAD session never offers Allow/Deny and says to resume the conversation', () => {
    setup({ session: { title: 'Agent billing', state: 'dead' } })
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(ROW_TEXT.resumeSession)
    expect(screen.getByRole('link', { name: OPEN })).toBeTruthy()
  })

  it('a session of UNKNOWN state (session=null) is not actionable: no Autoriser, resume instead', () => {
    setup({ session: null })
    expect(screen.queryByRole('button', { name: /Autoriser/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Refuser/i })).toBeNull()
    expect(screen.getByRole('button', { name: ROW_TEXT.resumeSession })).toBeTruthy()
  })

  it('a DEAD session asking a question has no free answer field, no one-click answer, and a way back', () => {
    const { onReply } = setup({ request: question, session: { title: 'Agent billing', state: 'dead' } })
    expect(screen.queryByLabelText('Another answer')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Another answer…' })).toBeNull() // not even folded
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    // Options only pre-select (aria-pressed); nothing is sent by choosing one.
    fireEvent.click(screen.getByRole('button', { name: /PostgreSQL/ }))
    expect(onReply).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: ROW_TEXT.resumeSession })).toBeTruthy()
  })

  it('a DEAD permission card has "Resume the conversation": opens the sheet, sends a user_message via onReply, never onPermission', async () => {
    const { onReply, onPermission } = setup({ session: { title: 'Agent billing', state: 'dead' } })
    // The help is no longer printed under the button: it is said once the sheet is open.
    expect(screen.queryByText(ROW_TEXT.helpPermission)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resumeSession }))
    const sheet = await screen.findByTestId('continue-sheet')
    expect(within(sheet).getByText(ROW_TEXT.helpPermission)).toBeTruthy()
    const field = within(sheet).getByLabelText('Resume message') as HTMLTextAreaElement
    expect(field.value).toBe('Continue.') // permission: short editable message (spike 0.1)
    fireEvent.click(within(sheet).getByRole('button', { name: ROW_TEXT.resumeSession }))
    await waitFor(() => expect(onReply).toHaveBeenCalledWith(permission, 'Continue.'))
    expect(onPermission).not.toHaveBeenCalled()
  })

  it('inside a band-1 card, "Reprendre la conversation" IS the primary action', () => {
    setup({ session: { title: 'Agent billing', state: 'dead' } })
    expect(screen.getByRole('button', { name: ROW_TEXT.resumeSession }).className).toContain('btn-primary')
  })

  it('a DEAD question card pre-fills the chosen option as the answer to the previous question (spike 0.1)', async () => {
    const { onReply } = setup({ request: question, session: { title: 'Agent billing', state: 'dead' } })
    fireEvent.click(screen.getByRole('button', { name: /SQLite/ }))
    fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resumeSession }))
    const field = (await screen.findByLabelText('Resume message')) as HTMLTextAreaElement
    expect(field.value).toBe(questionAnswerMessage(question.text, 'SQLite'))
    fireEvent.click(within(screen.getByTestId('continue-sheet')).getByRole('button', { name: ROW_TEXT.resumeSession }))
    await waitFor(() => expect(onReply).toHaveBeenCalledWith(question, questionAnswerMessage(question.text, 'SQLite')))
  })

  it('a failed resume keeps the sheet open and says so', async () => {
    setup({ session: { title: 'A', state: 'dead' }, onReply: vi.fn().mockResolvedValue(false) })
    fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resumeSession }))
    const sheet = await screen.findByTestId('continue-sheet')
    fireEvent.click(within(sheet).getByRole('button', { name: ROW_TEXT.resumeSession }))
    expect((await within(sheet).findByRole('alert')).textContent).toMatch(/not sent/)
    expect(screen.getByTestId('continue-sheet')).toBeTruthy()
  })

  it('an orphan notice does not hide an unrelated failure of the answer', async () => {
    const onPermission = vi.fn().mockResolvedValue(false) // a real failure (toasted by the hook)
    const props: AttentionCardProps = {
      request: permission, lane: 'Acme', threadTitle: null, session: { title: 'A', state: 'live' },
      onPermission, onReply: vi.fn(),
    }
    const { rerender } = render(<MemoryRouter><AttentionCard {...props} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    rerender(<MemoryRouter><AttentionCard {...props} notice="L'agent n'est plus là." /></MemoryRouter>)
    expect(screen.getByRole('alert').textContent).toMatch(/Answer not sent/)
  })

  it('410 shows ONE coherent message: the orphan notice, not "Answer not sent" too', async () => {
    const onPermission = vi.fn().mockResolvedValue('orphaned') // the hook turned the 410 into a notice
    const props: AttentionCardProps = {
      request: permission, lane: 'Acme', threadTitle: null, session: { title: 'A', state: 'live' },
      onPermission, onReply: vi.fn(),
    }
    const { rerender } = render(<MemoryRouter><AttentionCard {...props} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(onPermission).toHaveBeenCalled())
    rerender(<MemoryRouter><AttentionCard {...props} notice="L'agent n'est plus là : reprendre la session." /></MemoryRouter>)
    expect(screen.getAllByRole('status').length).toBe(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/Answer not sent/)).toBeNull()
  })

  it('410 -> orphan also from the hook notice prop', () => {
    setup({ notice: "L'agent n'est plus là : son CLI s'est arrêté." })
    expect(screen.getByRole('status').textContent).toMatch(/CLI/)
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull()
  })

  it('keyboard: every action is a native focusable control in reading order, Enter/Space = click, focus ring classes present', () => {
    const { onPermission } = setup()
    const card = screen.getByTestId('attention-card')
    const tabbable = Array.from(card.querySelectorAll<HTMLElement>('button, a[href], textarea, [tabindex]'))
    expect(tabbable.map((e) => e.textContent)).toEqual(['Allow', 'Deny', OPEN])
    expect(tabbable.every((e) => e.getAttribute('tabindex') !== '-1')).toBe(true)
    expect(tabbable[0].tagName).toBe('BUTTON')
    expect((tabbable[0] as HTMLButtonElement).type).not.toBe('')
    const link = screen.getByRole('link', { name: OPEN })
    expect(link.className).toMatch(/focus-visible:ring/)
    // Native buttons turn Enter / Space into a click: that click is what triggers the answer.
    fireEvent.click(tabbable[0])
    expect(onPermission).toHaveBeenCalledWith(permission, true)
  })

  it('every action is at least 36px tall (min-h-9)', () => {
    setup()
    for (const el of [...screen.getAllByRole('button'), screen.getByRole('link', { name: OPEN })])
      expect(el.className).toMatch(/min-h-9/)
  })

  it('is an opaque surface: no glass, no animation', () => {
    setup()
    const cls = screen.getByTestId('attention-card').className
    expect(cls).not.toMatch(/glass|backdrop|animate|transition/)
  })
})

describe('AttentionCard — question', () => {
  it('is a named region for a question and shows the question whole', () => {
    setup({ request: question })
    expect(screen.getByRole('region', { name: 'Question asked by Agent billing' })).toBeTruthy()
    expect(screen.getByTestId('attention-text').textContent).toBe('Quelle base de données utiliser ?')
  })

  it('renders one button per option, with its description', () => {
    setup({ request: question })
    const list = screen.getByRole('list', { name: 'Suggested answers' })
    const buttons = within(list).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['PostgreSQLRobuste, déjà en prod', 'SQLite'])
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull()
  })

  it('sends the option label as the answer message', async () => {
    const { onReply, onPermission } = setup({ request: question })
    fireEvent.click(screen.getByRole('button', { name: /SQLite/ }))
    expect(onReply).toHaveBeenCalledWith(question, 'SQLite')
    expect(onPermission).not.toHaveBeenCalled()
  })

  it('locks every option after one is chosen (no double answer)', async () => {
    let release!: (v: boolean) => void
    const onReply = vi.fn(() => new Promise<boolean>((r) => (release = r)))
    setup({ request: question, onReply })
    fireEvent.click(screen.getByRole('button', { name: /PostgreSQL/ }))
    fireEvent.click(screen.getByRole('button', { name: /SQLite/ }))
    expect(onReply).toHaveBeenCalledTimes(1)
    release(true)
    await screen.findByText('Answer sent.')
  })

  it('with options, the free answer is folded behind a ghost "Another answer…" button', () => {
    const { onReply } = setup({ request: question })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    const more = screen.getByRole('button', { name: 'Another answer…' })
    expect(more.className).toMatch(/min-h-9/)
    expect(more.className).not.toContain('btn-primary') // never competes with the options
    expect(screen.getByRole('link', { name: OPEN })).toBeTruthy()
    fireEvent.click(more)
    expect(onReply).not.toHaveBeenCalled() // opening the field sends nothing
    expect(screen.getByRole('textbox', { name: 'Another answer' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Another answer…' })).toBeNull()
    // With options on the card, Envoyer stays secondary: no primary at all.
    expect(screen.getByRole('button', { name: 'Send' }).className).not.toContain('btn-primary')
    expect(screen.getByRole('link', { name: OPEN })).toBeTruthy()
  })

  it('without options, the answer field is shown at once and Send is THE primary', () => {
    const { onReply } = setup({ request: { ...question, options: [] } })
    expect(screen.queryByRole('button', { name: 'Another answer…' })).toBeNull()
    const box = screen.getByRole('textbox', { name: 'Another answer' }) as HTMLTextAreaElement
    expect(box.placeholder).toBe('Your answer…')
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Send'])
    expect(buttons[0].className).toContain('btn-primary')
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(box, { target: { value: ' Postgres ' } })
    fireEvent.click(buttons[0])
    expect(onReply).toHaveBeenCalledWith({ ...question, options: [] }, 'Postgres')
  })

  it('sends a free answer; Send is disabled while empty; Ctrl+Enter sends', async () => {
    const { onReply } = setup({ request: question })
    fireEvent.click(screen.getByRole('button', { name: 'Another answer…' }))
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    const box = screen.getByRole('textbox', { name: 'Another answer' })
    fireEvent.change(box, { target: { value: '  MariaDB  ' } })
    expect(send.disabled).toBe(false)
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
    expect(onReply).toHaveBeenCalledWith(question, 'MariaDB')
  })

  it('the free answer cannot be double-sent, and locks the options too', async () => {
    let release!: (v: boolean) => void
    const onReply = vi.fn(() => new Promise<boolean>((r) => (release = r)))
    setup({ request: question, onReply })
    fireEvent.click(screen.getByRole('button', { name: 'Another answer…' }))
    const box = screen.getByRole('textbox', { name: 'Another answer' })
    fireEvent.change(box, { target: { value: 'MariaDB' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: /SQLite/ }))
    expect(onReply).toHaveBeenCalledTimes(1)
    release(true)
    await screen.findByText('Answer sent.')
  })

  it('every action of a question is at least 36px tall, folded or open', () => {
    setup({ request: question })
    const all = () => [...screen.getAllByRole('button'), screen.getByRole('link', { name: OPEN })]
    for (const el of all()) expect(el.className).toMatch(/min-h-9/)
    fireEvent.click(screen.getByRole('button', { name: 'Another answer…' }))
    for (const el of all()) expect(el.className).toMatch(/min-h-9/)
  })

  it('uses the parent draft when provided (survives a refetch)', () => {
    const onDraftChange = vi.fn()
    setup({ request: question, draft: 'brouillon', onDraftChange })
    const box = screen.getByRole('textbox', { name: 'Another answer' }) as HTMLTextAreaElement
    expect(box.value).toBe('brouillon')
    fireEvent.change(box, { target: { value: 'x' } })
    expect(onDraftChange).toHaveBeenCalledWith('x')
  })

  it('a failed send shows an alert and keeps the options usable', async () => {
    setup({ request: question, onReply: vi.fn().mockResolvedValue(false) })
    fireEvent.click(screen.getByRole('button', { name: /SQLite/ }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((screen.getByRole('button', { name: /SQLite/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('a 409 on a question is "already decided"', async () => {
    setup({ request: question, onReply: vi.fn().mockRejectedValue(new ApiError(409, 'x')) })
    fireEvent.click(screen.getByRole('button', { name: /SQLite/ }))
    expect(await screen.findByText(/Already decided/)).toBeTruthy()
  })
})

describe('AttentionCard — provenance of the attachment (as given by the backend)', () => {
  it('the where line has no "·" separator that could dangle at the end of a wrapped line', () => {
    setup()
    const where = screen.getByTestId('attention-card').firstElementChild as HTMLElement
    expect(where.textContent).toContain('Acme')
    expect(where.textContent).toContain('live')
    expect(where.textContent).not.toContain('·')
  })

  it('a linked conversation keeps its provenance for assistive tech only (sr-only), still in the DOM', () => {
    setup()
    const p = screen.getByTestId('attention-provenance')
    expect(p.className).toBe('sr-only')
    expect(p.textContent).toBe('attached to execution abcdef12')
  })

  it('with no link the provenance is VISIBLE: 12px in a readable grey, not 11px dark grey', () => {
    setup({ links: null })
    const cls = screen.getByTestId('attention-provenance').className
    expect(cls).not.toContain('sr-only')
    expect(cls).toContain(provenanceText)
    expect(cls).toContain('text-xs')
    expect(cls).toContain('text-gray-400')
    expect(cls).not.toContain('text-[11px]')
    expect(cls).not.toContain('text-gray-500')
  })

  it('says "Free conversation: attached to no plan" when the conversation has no link (empty list too)', () => {
    setup({ links: null, threadTitle: null })
    expect(screen.getByTestId('attention-provenance').textContent).toBe(FREE_PROVENANCE)
    cleanup()
    setup({ links: [], threadTitle: null })
    const p = screen.getByTestId('attention-provenance')
    expect(p.textContent).toBe(FREE_PROVENANCE)
    expect(p.className).not.toContain('sr-only')
  })

  it('without a thread, the header names the conversation: its title, else "Conversation libre"', () => {
    setup({ links: null, threadTitle: null })
    const header = () => screen.getByTestId('attention-card').firstElementChild as HTMLElement
    expect(header().textContent).toContain('Agent billing')
    cleanup()
    setup({ links: null, threadTitle: null, session: null })
    expect(header().textContent).toContain(ROW_TEXT.noThread)
  })

  it('says which run / task / plan, one sentence per mechanism', () => {
    setup({
      links: [
        { via: 'runner_run', run_id: 'abcdef1234567890', task_id: null, plan_id: null },
        { via: 'task_association', run_id: null, task_id: 'task-0001-xxxx', plan_id: null },
      ],
      names: { tasks: { 'task-0001-xxxx': 'Migrer le schéma' } },
    })
    expect(screen.getByTestId('attention-provenance').textContent).toBe(
      'attached to execution abcdef12 · attached to task Migrer le schéma',
    )
  })

  it('labels every mechanism', () => {
    const l = (via: Parameters<typeof linkLabel>[0]['via'], f: object = {}) =>
      linkLabel({ via, run_id: null, task_id: null, plan_id: null, ...f })
    expect(l('spawned_by_json', { run_id: 'r1234567890' })).toBe('started by execution r1234567')
    expect(l('spawned_by_json', { plan_id: 'p1234567890' })).toBe('started by plan p1234567')
    expect(l('plan_association', { plan_id: 'p1234567890' })).toBe('attached to plan p1234567')
    expect(provenanceLabels([])).toEqual([FREE_PROVENANCE])
    expect(provenanceLabels(null)).toEqual([FREE_PROVENANCE])
  })
})
