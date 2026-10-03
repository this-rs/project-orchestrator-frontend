import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { parseAttentionResponse } from '@/services/attention'
import type { AttentionResponse, AttentionThread } from '@/types/attention'
import {
  ThreadRow,
  ThreadRowList,
  linkProvenance,
  questionAnswerMessage,
  resumePreviewText,
  ROW_TEXT,
} from '../ThreadRow'

const fixture = (name: string): AttentionResponse =>
  parseAttentionResponse(
    JSON.parse(readFileSync(join(__dirname, '../../../services/__fixtures__/attention', `${name}.json`), 'utf8')),
  )

const renderRow = (ui: React.ReactNode) =>
  render(
    <MemoryRouter>
      <ThreadRowList label="Fils">{ui}</ThreadRowList>
    </MemoryRouter>,
  )

const noResume = async () => {}
const noSend = async () => {}

const ALLOW = /autoriser|allow|approuver|approve/i

describe('ThreadRow — stuck (À reprendre)', () => {
  const blocked = fixture('blocked_task')
  const thread = blocked.threads.find((t) => t.band === 'stuck')!

  it('says the cause, names the blocked task with a link to unblock it, and shows the backend preview as is', () => {
    renderRow(<ThreadRow variant="stuck" thread={thread} runner={blocked.runner} onResume={noResume} />)
    expect(screen.getByText('Tâche bloquée')).toBeTruthy()
    const box = screen.getByTestId('blocked-tasks')
    const link = within(box).getByRole('link', { name: 'Configurer le webhook de paiement' })
    expect(link.getAttribute('href')).toBe(`/workspace/${thread.workspace}/tasks/${thread.resume!.skipped_blocked[0].id}`)
    expect(box.textContent).toContain(ROW_TEXT.unblockFirst)
    expect(screen.getByTestId('resume-preview').textContent).toBe('2 faites et 1 bloquée seront sautées, 1 relancée')
  })

  it('shows the preview from the backend numbers without computing anything', () => {
    const t: AttentionThread = {
      ...thread,
      resume: { done_count: 4, skipped_blocked: [{ id: 'a', title: 'A' }], rerun_count: 2 },
    }
    renderRow(<ThreadRow variant="stuck" thread={t} runner={blocked.runner} onResume={noResume} />)
    expect(screen.getByTestId('resume-preview').textContent).toBe('4 faites et 1 bloquée seront sautées, 2 relancées')
  })

  it('names the blocked tasks BEFORE the click: the list precedes the Reprendre button in the DOM', () => {
    renderRow(<ThreadRow variant="stuck" thread={thread} runner={blocked.runner} onResume={noResume} />)
    const names = screen.getByTestId('blocked-tasks')
    const button = screen.getByRole('button', { name: ROW_TEXT.resume })
    expect(names.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Reprendre is a secondary button: eight stuck threads must not stack eight primaries', () => {
    renderRow(<ThreadRow variant="stuck" thread={thread} runner={blocked.runner} onResume={noResume} />)
    expect(screen.getByRole('button', { name: ROW_TEXT.resume }).className).not.toContain('bg-indigo-600')
  })

  it('Reprendre calls onResume once with the thread (the page does POST /run)', async () => {
    const onResume = vi.fn().mockResolvedValue(undefined)
    renderRow(<ThreadRow variant="stuck" thread={thread} runner={blocked.runner} onResume={onResume} />)
    fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resume }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(ROW_TEXT.resumeStarted))
    expect(onResume).toHaveBeenCalledTimes(1)
    expect(onResume).toHaveBeenCalledWith(thread)
    // the dead end is gone: the row points at the run it just started
    expect(screen.getByRole('link', { name: ROW_TEXT.followRun }).getAttribute('href')).toContain('#runner')
    // No double start.
    expect((screen.getByRole('button', { name: ROW_TEXT.resume }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('a failed resume says why and stays retryable', async () => {
    const onResume = vi.fn().mockRejectedValue(new Error('boom'))
    renderRow(<ThreadRow variant="stuck" thread={thread} runner={blocked.runner} onResume={onResume} />)
    fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resume }))
    expect((await screen.findByRole('alert')).textContent).toBe('boom')
    expect((screen.getByRole('button', { name: ROW_TEXT.resume }) as HTMLButtonElement).disabled).toBe(false)
  })

  describe('runner busy', () => {
    const busy = fixture('runner_busy')
    const stuck = busy.threads.find((t) => t.band === 'stuck')!

    it('disables the button, says who holds the runner, links to that plan, and never calls onResume', () => {
      const onResume = vi.fn()
      renderRow(<ThreadRow variant="stuck" thread={stuck} runner={busy.runner} onResume={onResume} />)
      const button = screen.getByRole('button', { name: ROW_TEXT.resume }) as HTMLButtonElement
      expect(button.disabled).toBe(true)
      const reason = screen.getByTestId('resume-disabled-reason')
      expect(reason.textContent).toBe(`${ROW_TEXT.runnerBusy} ${busy.runner.busy_with!.plan_title}`)
      expect(within(reason).getByRole('link').getAttribute('href')).toBe(
        `/workspace/${busy.runner.busy_with!.workspace}/plans/${busy.runner.busy_with!.plan_id}`,
      )
      fireEvent.click(button)
      expect(onResume).not.toHaveBeenCalled()
    })

    it('the disabled Reprendre is visibly disabled: no indigo, dashed, grey text (not a dimmed primary)', () => {
      renderRow(<ThreadRow variant="stuck" thread={stuck} runner={busy.runner} onResume={vi.fn()} />)
      const cls = screen.getByRole('button', { name: ROW_TEXT.resume }).className
      expect(cls).not.toContain('bg-indigo')
      // It goes through <Button>, whose disabled state dims: the row overrides that to stay at full opacity.
      expect(cls).toContain('disabled:opacity-100!')
      expect(cls).toContain('disabled:border-dashed')
      expect(cls).toContain('disabled:text-gray-400')
    })

    it('stays enabled when the runner is free', () => {
      renderRow(<ThreadRow variant="stuck" thread={stuck} runner={{ status: 'free', busy_with: null }} onResume={noResume} />)
      expect((screen.getByRole('button', { name: ROW_TEXT.resume }) as HTMLButtonElement).disabled).toBe(false)
      expect(screen.queryByTestId('resume-disabled-reason')).toBeNull()
    })
  })

  it('disables with a reason when there is no plan or no preview', () => {
    const noPlan: AttentionThread = { ...thread, plan: null }
    const { unmount } = renderRow(<ThreadRow variant="stuck" thread={noPlan} runner={blocked.runner} onResume={noResume} />)
    expect((screen.getByRole('button', { name: ROW_TEXT.resume }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('resume-disabled-reason').textContent).toBe(ROW_TEXT.noPlan)
    unmount()
    renderRow(<ThreadRow variant="stuck" thread={{ ...thread, resume: null }} runner={blocked.runner} onResume={noResume} />)
    expect(screen.getByTestId('resume-disabled-reason').textContent).toBe(ROW_TEXT.noPreview)
    expect(screen.queryByTestId('resume-preview')).toBeNull()
  })

  it('says each stuck cause in clear', () => {
    const cases = { failed: 'Run échoué', budget_exceeded: 'Budget dépassé', session_error: 'Erreur de session' } as const
    for (const [reason, text] of Object.entries(cases)) {
      const { unmount } = renderRow(
        <ThreadRow
          variant="stuck"
          thread={{ ...thread, stuck_reason: reason as keyof typeof cases, blocked_tasks: [], resume: { done_count: 0, skipped_blocked: [], rerun_count: 3 } }}
          runner={blocked.runner}
          onResume={noResume}
        />,
      )
      expect(screen.getByText(text)).toBeTruthy()
      expect(screen.queryByTestId('blocked-tasks')).toBeNull()
      expect(screen.getByTestId('resume-preview').textContent).toBe('3 relancées')
      unmount()
    }
  })

  it('has no Allow button', () => {
    renderRow(<ThreadRow variant="stuck" thread={thread} runner={blocked.runner} onResume={noResume} />)
    expect(screen.queryByRole('button', { name: ALLOW })).toBeNull()
  })
})

describe('resumePreviewText (wording of the backend fields, singular and plural)', () => {
  const t = (id: string) => ({ id, title: id })
  it.each([
    [{ done_count: 4, skipped_blocked: [t('a')], rerun_count: 2 }, '4 faites et 1 bloquée seront sautées, 2 relancées'],
    [{ done_count: 1, skipped_blocked: [t('a'), t('b')], rerun_count: 1 }, '1 faite et 2 bloquées seront sautées, 1 relancée'],
    [{ done_count: 0, skipped_blocked: [t('a')], rerun_count: 0 }, '1 bloquée sera sautée, aucune relancée'],
    [{ done_count: 1, skipped_blocked: [], rerun_count: 2 }, '1 faite sera sautée, 2 relancées'],
    [{ done_count: 5, skipped_blocked: [], rerun_count: 0 }, '5 faites seront sautées, aucune relancée'],
    [{ done_count: 0, skipped_blocked: [], rerun_count: 4 }, '4 relancées'],
  ])('%j', (preview, text) => {
    expect(resumePreviewText(preview)).toBe(text)
  })
})

describe('ThreadRow — orphan (À reprendre)', () => {
  const data = fixture('orphan')
  const thread = data.threads[0]
  const orphan = data.orphans[0]
  const send = (onSendMessage = vi.fn().mockResolvedValue(undefined)) => {
    renderRow(<ThreadRow variant="orphan" thread={thread} orphan={orphan} onSendMessage={onSendMessage} />)
    return onSendMessage
  }

  it('shows what was asked in full, since when the CLI stopped, and the spike help text', () => {
    send()
    expect(screen.getByTestId('request-text').textContent).toBe(orphan.text)
    expect(screen.getByText(/Permission demandée \(Bash\)/)).toBeTruthy()
    expect(screen.getByText(/CLI arrêté depuis/)).toBeTruthy()
    expect(screen.getByText(ROW_TEXT.helpPermission)).toBeTruthy()
  })

  it('says when the stop date is unknown', () => {
    renderRow(
      <ThreadRow variant="orphan" thread={thread} orphan={{ ...orphan, cli_stopped_at: null }} onSendMessage={noSend} />,
    )
    expect(screen.getByText('CLI arrêté (date inconnue)')).toBeTruthy()
  })

  it('NEVER offers an Allow / Autoriser button — row, permission or question, sheet open or closed', () => {
    for (const o of [orphan, { ...orphan, kind: 'question' as const, tool_name: null, options: [{ label: 'Oui', description: null }] }]) {
      const { unmount } = renderRow(<ThreadRow variant="orphan" thread={thread} orphan={o} onSendMessage={noSend} />)
      expect(screen.queryByRole('button', { name: ALLOW })).toBeNull()
      expect(screen.queryByText(ALLOW)).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resumeSession }))
      expect(screen.queryByRole('button', { name: ALLOW })).toBeNull()
      unmount()
    }
  })

  it('"Reprendre la session" opens the field with a short editable "Continue." and sends a message to THAT session', async () => {
    const onSendMessage = send()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resumeSession }))
    const field = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(field.value).toBe(ROW_TEXT.defaultMessage)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: ROW_TEXT.resumeSession }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onSendMessage).toHaveBeenCalledTimes(1)
    expect(onSendMessage).toHaveBeenCalledWith(orphan.session_id, 'Continue.')
  })

  it('a permission never pre-fills an answer (no option picker either)', () => {
    send()
    expect(screen.queryByRole('group', { name: 'Options de la question' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resumeSession }))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Continue.')
  })

  it('even a permission carrying options (should not happen) offers no picker and no answer pre-fill', () => {
    const odd = { ...orphan, options: [{ label: 'Oui', description: null }] }
    renderRow(<ThreadRow variant="orphan" thread={thread} orphan={odd} onSendMessage={noSend} />)
    expect(screen.queryByRole('button', { name: 'Oui' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resumeSession }))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Continue.')
  })

  describe('orphan question', () => {
    const question = {
      ...orphan,
      kind: 'question' as const,
      tool_name: null,
      text: 'Quelle couleur ?',
      options: [
        { label: 'Bleu', description: 'le froid' },
        { label: 'Rouge', description: null },
      ],
    }
    const open = () => {
      const onSendMessage = vi.fn().mockResolvedValue(undefined)
      renderRow(<ThreadRow variant="orphan" thread={thread} orphan={question} onSendMessage={onSendMessage} />)
      return onSendMessage
    }

    it('without a chosen option the field opens with the plain "Continue."', () => {
      open()
      expect(screen.getByText(ROW_TEXT.helpQuestion)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resumeSession }))
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Continue.')
    })

    it('a chosen option pre-fills the answer message (spike wording) and is sent as a message', async () => {
      const onSendMessage = open()
      const blue = screen.getByRole('button', { name: 'Bleu' })
      expect(blue.getAttribute('aria-pressed')).toBe('false')
      fireEvent.click(blue)
      expect(blue.getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resumeSession }))
      const expected = questionAnswerMessage('Quelle couleur ?', 'Bleu')
      expect(expected).toBe('Ma réponse à ta question précédente (« Quelle couleur ? ») : Bleu. Ne la repose pas, continue.')
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(expected)
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: ROW_TEXT.resumeSession }))
      await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith(orphan.session_id, expected))
    })

    it('un-choosing the option goes back to "Continue."', () => {
      open()
      fireEvent.click(screen.getByRole('button', { name: 'Bleu' }))
      fireEvent.click(screen.getByRole('button', { name: 'Bleu' }))
      fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resumeSession }))
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Continue.')
    })
  })

  it('falls back to "sans fil" when the session is not among the thread sessions', () => {
    const stray = { ...orphan, session_id: 'ffffffff-0000-0000-0000-000000000000' }
    renderRow(<ThreadRow variant="orphan" thread={thread} orphan={stray} onSendMessage={vi.fn()} />)
    expect(screen.getByTestId('provenance').textContent).toBe('sans fil')
  })

  it('"Reprendre la session" of an orphan row is secondary (the page keeps one primary)', () => {
    send()
    expect(screen.getByRole('button', { name: 'Reprendre la session' }).className).not.toContain('bg-indigo-600')
  })

  it('the provenance of an orphan is 12px in a readable grey, set apart from the request', () => {
    send()
    const cls = screen.getByTestId('provenance').className
    expect(cls).toContain('text-xs')
    expect(cls).toContain('text-gray-400')
    expect(cls).toContain('mt-2')
  })

  it('states where the session is attached (provenance), never computing membership', () => {
    send()
    expect(screen.getByTestId('provenance').textContent).toBe(`rattachée au run ${thread.run!.id.slice(0, 8)}`)
  })

  it('gives the resume button a ≥ 36px target', () => {
    send()
    expect(screen.getByRole('button', { name: ROW_TEXT.resumeSession }).className).toContain('min-h-9')
  })
})

describe('StuckThreadRow — blocked tasks without a resume preview', () => {
  const blocked = fixture('blocked_task')
  const thread = blocked.threads.find((t) => t.stuck_reason === 'task_blocked')!

  it('names the thread blocked_tasks even when resume is absent', () => {
    renderRow(
      <ThreadRow variant="stuck" thread={{ ...thread, resume: null }} runner={blocked.runner} onResume={noResume} />,
    )
    expect(screen.getByTestId('blocked-tasks').textContent).toContain(thread.blocked_tasks[0].title)
  })
})

describe('linkProvenance', () => {
  const thread = fixture('resumed_run').threads[0]
  const links = thread.sessions.flatMap((s) => s.links)

  it('never infers "précédent": every run link reads the same, via + id only', () => {
    const texts = links.filter((l) => l.via === 'runner_run').map((l) => linkProvenance(l, thread))
    expect(texts.length).toBeGreaterThan(1)
    for (const x of texts) expect(x).toMatch(/^rattachée au run [0-9a-f]{8}$/)
  })

  it('words each mechanism', () => {
    const link = { run_id: null, task_id: 'abcdef123456', plan_id: null }
    expect(linkProvenance({ via: 'task_association', ...link }, thread)).toBe('rattachée à la tâche abcdef12')
    expect(linkProvenance({ via: 'plan_association', ...link }, thread)).toBe(`rattachée au plan ${thread.plan!.title}`)
    expect(linkProvenance({ via: 'spawned_by_json', ...link, run_id: 'r1234567890' }, undefined)).toBe('créée par le run r1234567')
  })
})

describe('ThreadRow — unattached session (no thread)', () => {
  const data = fixture('unattached_waiting')
  const live = data.unattached.filter((u) => u.state === 'live')
  const question = live.find((u) => u.pending[0]?.kind === 'question')!
  const permission = live.find((u) => u.pending[0]?.kind === 'permission')!
  const dead = data.unattached.find((u) => u.state === 'dead')!

  it('is the same row, labelled "sans fil", in its lane', () => {
    renderRow(<ThreadRow variant="unattached" session={question} onSendMessage={noSend} laneName="Lane X" />)
    expect(screen.getByTestId('no-thread-label').textContent).toBe('sans fil')
    expect(screen.getByText('Lane X')).toBeTruthy()
    expect(screen.getByText(question.title)).toBeTruthy()
    expect(screen.getByTestId('request-text').textContent).toBe(question.pending[0].text)
  })

  it('a LIVE question is answered by a message (Répondre…), pre-filled with the chosen option', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined)
    renderRow(<ThreadRow variant="unattached" session={question} onSendMessage={onSendMessage} />)
    const opt = question.pending[0].options[0]
    fireEvent.click(screen.getByRole('button', { name: opt.label }))
    fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.reply }))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(opt.label)
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith(question.id, opt.label))
  })

  it('a LIVE permission has no Autoriser here (that is band 1) and no message button', () => {
    renderRow(<ThreadRow variant="unattached" session={permission} onSendMessage={noSend} />)
    expect(screen.queryByRole('button', { name: ALLOW })).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(ROW_TEXT.livePermissionElsewhere)).toBeTruthy()
  })

  it('a DEAD session is resumed with "Reprendre la session" (user_message), never Autoriser', async () => {
    const withPending = {
      ...dead,
      pending: [{ ...permission.pending[0], session_id: dead.id }],
    }
    const onSendMessage = vi.fn().mockResolvedValue(undefined)
    renderRow(<ThreadRow variant="unattached" session={withPending} onSendMessage={onSendMessage} />)
    expect(screen.queryByRole('button', { name: ALLOW })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resumeSession }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: ROW_TEXT.resumeSession }))
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith(dead.id, 'Continue.'))
  })

  it('a session without pending request still renders its row', () => {
    renderRow(<ThreadRow variant="unattached" session={dead} onSendMessage={noSend} />)
    expect(screen.getByTestId('no-thread-label')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('layout (360 px, no horizontal scroll)', () => {
  it('wraps and shrinks: min-w-0 everywhere, no fixed width, titles break', () => {
    const blocked = fixture('blocked_task')
    const stuck = blocked.threads.find((t) => t.band === 'stuck')!
    const { container } = renderRow(<ThreadRow variant="stuck" thread={stuck} runner={blocked.runner} onResume={noResume} />)
    expect(container.innerHTML).not.toMatch(/\bw-\[\d+px\]|\bmin-w-\[\d+px\]|whitespace-nowrap(?!.*tabular)/)
    expect(container.querySelector('li[data-variant]')!.className).toContain('min-w-0')
    expect(container.querySelector('.break-words')).toBeTruthy()
  })
})
