import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '@/services/api'
import { AttentionCard, linkLabel, provenanceLabels, type AttentionCardProps } from '../AttentionCard'
import type { WaitingRequest } from '@/types/attention'

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
    expect(screen.getByRole('region', { name: 'Permission demandée par la session Agent billing' })).toBeTruthy()
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

  it('shows lane, thread, age and the live indicator, in that order', () => {
    setup()
    const card = screen.getByTestId('attention-card')
    const t = card.textContent ?? ''
    expect(t.indexOf('Acme')).toBeLessThan(t.indexOf('Refonte du billing'))
    expect(t.indexOf('Refonte du billing')).toBeLessThan(t.indexOf('depuis'))
    expect(t.indexOf('depuis')).toBeLessThan(t.indexOf('vivant'))
    expect(t.indexOf('vivant')).toBeLessThan(t.indexOf(COMMAND.slice(0, 20)))
  })

  it('offers exactly one primary and one secondary, plus a link, and no dialog', () => {
    setup()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Autoriser', 'Refuser'])
    const link = screen.getByRole('link', { name: 'Ouvrir la session' })
    expect(link.getAttribute('href')).toBe('/workspace/acme/chat/11111111-aaaa-bbbb-cccc-000000000001')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sends Autoriser at once, with no confirmation', async () => {
    const { onPermission } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Autoriser' }))
    expect(onPermission).toHaveBeenCalledWith(permission, true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sends Refuser as a deny', async () => {
    const { onPermission } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }))
    expect(onPermission).toHaveBeenCalledWith(permission, false)
  })

  it('cannot be double-tapped: locked while in flight and after success', async () => {
    let release!: (v: boolean) => void
    const onPermission = vi.fn(() => new Promise<boolean>((r) => (release = r)))
    setup({ onPermission })
    const allow = screen.getByRole('button', { name: 'Autoriser' })
    fireEvent.click(allow)
    fireEvent.click(allow)
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }))
    expect(onPermission).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: 'Refuser' }) as HTMLButtonElement).disabled).toBe(true)
    release(true)
    await screen.findByText('Réponse envoyée.')
    fireEvent.click(screen.getByRole('button', { name: 'Autoriser' }))
    expect(onPermission).toHaveBeenCalledTimes(1)
  })

  it('treats a 409 as already decided, not as an error', async () => {
    const onPermission = vi.fn().mockRejectedValue(new ApiError(409, 'conflict'))
    setup({ onPermission })
    fireEvent.click(screen.getByRole('button', { name: 'Autoriser' }))
    expect(await screen.findByText(/Déjà tranché/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect((screen.getByRole('button', { name: 'Autoriser' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('treats the "already_decided" result like a 409', async () => {
    setup({ onPermission: vi.fn().mockResolvedValue('already_decided') })
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }))
    expect(await screen.findByText(/Déjà tranché/)).toBeTruthy()
  })

  it('on failure shows an alert and re-enables the buttons', async () => {
    const onPermission = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    setup({ onPermission })
    fireEvent.click(screen.getByRole('button', { name: 'Autoriser' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/non envoyée/)
    const allow = screen.getByRole('button', { name: 'Autoriser' }) as HTMLButtonElement
    expect(allow.disabled).toBe(false)
    fireEvent.click(allow)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(onPermission).toHaveBeenCalledTimes(2)
  })

  it('on a thrown network error shows an alert and allows a retry', async () => {
    setup({ onPermission: vi.fn().mockRejectedValue(new Error('boom')) })
    fireEvent.click(screen.getByRole('button', { name: 'Autoriser' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Autoriser' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('410 -> orphan: notice, no more Autoriser/Refuser, session link kept', async () => {
    setup({ onPermission: vi.fn().mockRejectedValue(new ApiError(410, 'gone')) })
    fireEvent.click(screen.getByRole('button', { name: 'Autoriser' }))
    expect((await screen.findByRole('status')).textContent).toMatch(/n'est plus là/)
    expect(screen.queryByRole('button', { name: 'Autoriser' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refuser' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Ouvrir la session' })).toBeTruthy()
  })

  it('a DEAD session never offers Autoriser/Refuser and says to resume the session', () => {
    setup({ session: { title: 'Agent billing', state: 'dead' } })
    expect(screen.queryByRole('button', { name: 'Autoriser' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refuser' })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Reprendre la session')
    expect(screen.getByRole('link', { name: 'Ouvrir la session' })).toBeTruthy()
  })

  it('a DEAD session asking a question has no free answer field and disabled options', () => {
    setup({ request: question, session: { title: 'Agent billing', state: 'dead' } })
    expect(screen.queryByLabelText('Autre réponse')).toBeNull()
    expect((screen.getByRole('button', { name: /PostgreSQL/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('410 shows ONE coherent message: the orphan notice, not "Réponse non envoyée" too', async () => {
    const onPermission = vi.fn().mockResolvedValue(false) // the hook turned the 410 into a notice
    const props: AttentionCardProps = {
      request: permission, lane: 'Acme', threadTitle: null, session: { title: 'A', state: 'live' },
      onPermission, onReply: vi.fn(),
    }
    const { rerender } = render(<MemoryRouter><AttentionCard {...props} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Autoriser' }))
    await waitFor(() => expect(onPermission).toHaveBeenCalled())
    rerender(<MemoryRouter><AttentionCard {...props} notice="L'agent n'est plus là : reprendre la session." /></MemoryRouter>)
    expect(screen.getAllByRole('status').length).toBe(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/Réponse non envoyée/)).toBeNull()
  })

  it('410 -> orphan also from the hook notice prop', () => {
    setup({ notice: "L'agent n'est plus là : son CLI s'est arrêté." })
    expect(screen.getByRole('status').textContent).toMatch(/CLI/)
    expect(screen.queryByRole('button', { name: 'Autoriser' })).toBeNull()
  })

  it('keyboard: every action is a native focusable control in reading order, Enter/Space = click, focus ring classes present', () => {
    const { onPermission } = setup()
    const card = screen.getByTestId('attention-card')
    const tabbable = Array.from(card.querySelectorAll<HTMLElement>('button, a[href], textarea, [tabindex]'))
    expect(tabbable.map((e) => e.textContent)).toEqual(['Autoriser', 'Refuser', 'Ouvrir la session'])
    expect(tabbable.every((e) => e.getAttribute('tabindex') !== '-1')).toBe(true)
    expect(tabbable[0].tagName).toBe('BUTTON')
    expect((tabbable[0] as HTMLButtonElement).type).not.toBe('')
    const link = screen.getByRole('link', { name: 'Ouvrir la session' })
    expect(link.className).toMatch(/focus-visible:ring/)
    // Native buttons turn Enter / Space into a click: that click is what triggers the answer.
    fireEvent.click(tabbable[0])
    expect(onPermission).toHaveBeenCalledWith(permission, true)
  })

  it('every action is at least 36px tall (min-h-9)', () => {
    setup()
    for (const el of [...screen.getAllByRole('button'), screen.getByRole('link', { name: 'Ouvrir la session' })])
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
    expect(screen.getByRole('region', { name: 'Question posée par la session Agent billing' })).toBeTruthy()
    expect(screen.getByTestId('attention-text').textContent).toBe('Quelle base de données utiliser ?')
  })

  it('renders one button per option, with its description', () => {
    setup({ request: question })
    const list = screen.getByRole('list', { name: 'Réponses proposées' })
    const buttons = within(list).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['PostgreSQLRobuste, déjà en prod', 'SQLite'])
    expect(screen.queryByRole('button', { name: 'Autoriser' })).toBeNull()
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
    await screen.findByText('Réponse envoyée.')
  })

  it('sends a free answer; Envoyer is disabled while empty; Ctrl+Enter sends', async () => {
    const { onReply } = setup({ request: question })
    const send = screen.getByRole('button', { name: 'Envoyer' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    const box = screen.getByRole('textbox', { name: 'Autre réponse' })
    fireEvent.change(box, { target: { value: '  MariaDB  ' } })
    expect(send.disabled).toBe(false)
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
    expect(onReply).toHaveBeenCalledWith(question, 'MariaDB')
  })

  it('uses the parent draft when provided (survives a refetch)', () => {
    const onDraftChange = vi.fn()
    setup({ request: question, draft: 'brouillon', onDraftChange })
    const box = screen.getByRole('textbox', { name: 'Autre réponse' }) as HTMLTextAreaElement
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
    expect(await screen.findByText(/Déjà tranché/)).toBeTruthy()
  })
})

describe('AttentionCard — provenance of the attachment (as given by the backend)', () => {
  it('says "sans fil" when the session has no link', () => {
    setup({ links: null, threadTitle: null })
    expect(screen.getByTestId('attention-provenance').textContent).toBe('sans fil')
    expect(screen.getByTestId('attention-card').textContent).toContain('Sans fil')
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
      'rattaché au run abcdef12 · rattaché à la tâche Migrer le schéma',
    )
  })

  it('labels every mechanism', () => {
    const l = (via: Parameters<typeof linkLabel>[0]['via'], f: object = {}) =>
      linkLabel({ via, run_id: null, task_id: null, plan_id: null, ...f })
    expect(l('spawned_by_json', { run_id: 'r1234567890' })).toBe('lancé par le run r1234567')
    expect(l('spawned_by_json', { plan_id: 'p1234567890' })).toBe('lancé par le plan p1234567')
    expect(l('plan_association', { plan_id: 'p1234567890' })).toBe('rattaché au plan p1234567')
    expect(provenanceLabels([])).toEqual(['sans fil'])
  })
})
