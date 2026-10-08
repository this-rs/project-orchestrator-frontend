import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { parseAttentionResponse } from '@/services/attention'
import { STUCK_LABEL } from '../bands'
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
    expect(screen.getByText(STUCK_LABEL.task_blocked)).toBeTruthy()
    // one meta line: the cause, then since when
    expect(screen.getByText('depuis 4 h')).toBeTruthy()
    const box = screen.getByTestId('blocked-tasks')
    const link = within(box).getByRole('link', { name: 'Configurer le webhook de paiement' })
    expect(link.getAttribute('href')).toBe(`/workspace/${thread.workspace}/tasks/${thread.resume!.skipped_blocked[0].id}`)
    expect(box.textContent).toContain(ROW_TEXT.unblockFirst)
    expect(screen.getByTestId('resume-preview').textContent).toBe('Reprendre relance 1 tâche ; 2 déjà faites')
  })

  it('shows the preview from the backend numbers without computing anything', () => {
    const t: AttentionThread = {
      ...thread,
      resume: { done_count: 4, skipped_blocked: [{ id: 'a', title: 'A' }], rerun_count: 2 },
    }
    renderRow(<ThreadRow variant="stuck" thread={t} runner={blocked.runner} onResume={noResume} />)
    expect(screen.getByTestId('resume-preview').textContent).toBe('Reprendre relance 2 tâches ; 4 déjà faites')
  })

  // The button now sits at the right of the title, so it precedes the list in the DOM. What is
  // protected is unchanged: the constraint is stated BEFORE the click, without any interaction.
  it('states the blocked tasks BEFORE the click: the count is readable without opening anything, the names and links are in the row', () => {
    renderRow(<ThreadRow variant="stuck" thread={thread} runner={blocked.runner} onResume={noResume} />)
    const box = screen.getByTestId('blocked-tasks')
    expect(box.tagName).toBe('DETAILS')
    // The summary of a <details> is what stays shown while it is folded: it carries the count.
    const summary = box.querySelector(':scope > summary')!
    expect(summary.textContent).toBe(ROW_TEXT.blockedToggle(thread.blocked_tasks.length))
    expect(summary.textContent).toBe('1 tâche bloquée sera sautée')
    // Names and links are there before any click on Reprendre (inside the fold).
    for (const t of thread.blocked_tasks) {
      expect(within(box).getByRole('link', { name: t.title }).getAttribute('href')).toBe(
        `/workspace/${thread.workspace}/tasks/${t.id}`,
      )
    }
    // The button is described by the resume preview, which is in the row from the start.
    const button = screen.getByRole('button', { name: ROW_TEXT.resume })
    expect(button.getAttribute('aria-describedby')).toBe(screen.getByTestId('resume-preview').id)
  })

  it('agrees the blocked summary in the plural', () => {
    const two: AttentionThread = {
      ...thread,
      blocked_tasks: [
        { id: 'a', title: 'Tâche A' },
        { id: 'b', title: 'Tâche B' },
      ],
    }
    renderRow(<ThreadRow variant="stuck" thread={two} runner={blocked.runner} onResume={noResume} />)
    const box = screen.getByTestId('blocked-tasks')
    expect(box.querySelector(':scope > summary')!.textContent).toBe('2 tâches bloquées seront sautées')
    expect(within(box).getAllByRole('link').map((l) => l.textContent)).toEqual(['Tâche A', 'Tâche B'])
  })

  it('shows where the plan stands as ONE state bar, linked to the plan graph', () => {
    renderRow(<ThreadRow variant="stuck" thread={thread} runner={blocked.runner} onResume={noResume} />)
    const bar = screen.getByRole('progressbar', { name: 'Avancement' })
    expect(bar.getAttribute('aria-valuenow')).toBe('2')
    expect(bar.getAttribute('aria-valuemax')).toBe('5')
    expect(screen.getByTestId('state-words').textContent).toBe('1 bloquée')
    expect(bar.closest('a')!.getAttribute('href')).toBe(`/workspace/${thread.workspace}/plans/${thread.plan!.id}#graph`)
  })

  it('Reprendre is a secondary button: eight stuck threads must not stack eight primaries', () => {
    renderRow(<ThreadRow variant="stuck" thread={thread} runner={blocked.runner} onResume={noResume} />)
    expect(screen.getByRole('button', { name: ROW_TEXT.resume }).className).not.toContain('btn-primary')
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
      expect(ROW_TEXT.runnerBusy).not.toMatch(/runner/i)
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
    const cases = ['failed', 'budget_exceeded', 'session_error'] as const
    expect(STUCK_LABEL.failed).toBe('Arrêté sur une erreur')
    expect(STUCK_LABEL.session_error).toBe('Erreur de conversation')
    for (const reason of cases) {
      const text = STUCK_LABEL[reason]
      const { unmount } = renderRow(
        <ThreadRow
          variant="stuck"
          thread={{ ...thread, stuck_reason: reason, blocked_tasks: [], resume: { done_count: 0, skipped_blocked: [], rerun_count: 3 } }}
          runner={blocked.runner}
          onResume={noResume}
        />,
      )
      expect(screen.getByText(text)).toBeTruthy()
      expect(screen.queryByTestId('blocked-tasks')).toBeNull()
      expect(screen.getByTestId('resume-preview').textContent).toBe('Reprendre relance 3 tâches')
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
    // blocked tasks are no longer counted in this sentence: the fold under it names them
    [{ done_count: 4, skipped_blocked: [t('a')], rerun_count: 2 }, 'Reprendre relance 2 tâches ; 4 déjà faites'],
    [{ done_count: 1, skipped_blocked: [t('a'), t('b')], rerun_count: 1 }, 'Reprendre relance 1 tâche ; 1 déjà faite'],
    [{ done_count: 0, skipped_blocked: [t('a')], rerun_count: 0 }, 'Reprendre ne relance aucune tâche'],
    [{ done_count: 1, skipped_blocked: [], rerun_count: 2 }, 'Reprendre relance 2 tâches ; 1 déjà faite'],
    [{ done_count: 5, skipped_blocked: [], rerun_count: 0 }, 'Reprendre ne relance aucune tâche ; 5 déjà faites'],
    [{ done_count: 0, skipped_blocked: [], rerun_count: 4 }, 'Reprendre relance 4 tâches'],
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

  it('says what happened, since when the conversation stopped, keeps what was asked in full behind a fold, and the spike help text in the sheet', () => {
    send()
    expect(screen.getByText(STUCK_LABEL.orphan_request)).toBeTruthy()
    expect(screen.getByText(/^conversation arrêtée depuis /)).toBeTruthy()
    // The request, whole, inside a folded <details> whose summary names its kind and tool.
    const request = screen.getByTestId('request-text')
    expect(request.textContent).toBe(orphan.text)
    const fold = request.closest('details')!
    expect(fold.open).toBe(false)
    expect(fold.querySelector(':scope > summary')!.textContent).toBe(`${ROW_TEXT.showRequest} : autorisation (Bash)`)
    // The help is no longer printed in the row: it is the help of the sheet, once opened.
    expect(screen.queryByText(ROW_TEXT.helpPermission)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resumeSession }))
    expect(within(screen.getByRole('dialog')).getByText(ROW_TEXT.helpPermission)).toBeTruthy()
  })

  it('the row wording has no CLI / session jargon', () => {
    const { container } = renderRow(<ThreadRow variant="orphan" thread={thread} orphan={orphan} onSendMessage={noSend} />)
    const row = container.querySelector('li[data-variant="orphan"]')!
    const own = row.textContent!.replace(orphan.text, '').replace(thread.title, '')
    expect(own).not.toMatch(/\bCLI\b|session|sans fil/i)
  })

  it('says when the stop date is unknown', () => {
    renderRow(
      <ThreadRow variant="orphan" thread={thread} orphan={{ ...orphan, cli_stopped_at: null }} onSendMessage={noSend} />,
    )
    expect(screen.getByText('conversation arrêtée')).toBeTruthy()
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

  it('"Reprendre la conversation" opens the field with a short editable "Continue." and sends a message to THAT session', async () => {
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
      expect(screen.getByText(`${ROW_TEXT.showRequest} : question`)).toBeTruthy()
      // the help moved from the row into the sheet
      expect(screen.queryByText(ROW_TEXT.helpQuestion)).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: ROW_TEXT.resumeSession }))
      expect(within(screen.getByRole('dialog')).getByText(ROW_TEXT.helpQuestion)).toBeTruthy()
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Continue.')
    })

    it('with options, the options ARE the action: the resume button sits under the picker, once', () => {
      open()
      const picker = screen.getByRole('group', { name: 'Options de la question' })
      const buttons = screen.getAllByRole('button', { name: ROW_TEXT.resumeSession })
      expect(buttons).toHaveLength(1)
      expect(picker.compareDocumentPosition(buttons[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('a question without options keeps ONE resume button (at the right of the title, no picker)', () => {
      renderRow(<ThreadRow variant="orphan" thread={thread} orphan={{ ...question, options: [] }} onSendMessage={noSend} />)
      expect(screen.queryByRole('group', { name: 'Options de la question' })).toBeNull()
      expect(screen.getAllByRole('button', { name: ROW_TEXT.resumeSession })).toHaveLength(1)
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

  it('falls back to "Conversation libre" when the session is not among the thread sessions', () => {
    const stray = { ...orphan, session_id: 'ffffffff-0000-0000-0000-000000000000' }
    renderRow(<ThreadRow variant="orphan" thread={thread} orphan={stray} onSendMessage={vi.fn()} />)
    expect(screen.getByTestId('provenance').textContent).toBe(ROW_TEXT.noThread)
  })

  it('"Reprendre la conversation" of an orphan row is secondary (the page keeps one primary)', () => {
    send()
    expect(ROW_TEXT.resumeSession).toBe('Reprendre la conversation')
    expect(screen.getByRole('button', { name: ROW_TEXT.resumeSession }).className).not.toContain('btn-primary')
  })

  // Was: "12px in a readable grey, set apart from the request". The provenance is no longer
  // printed: it stays in the DOM for assistive tech only, still apart from the request text.
  it('the provenance of an orphan is kept for assistive tech (sr-only), set apart from the request', () => {
    send()
    const provenance = screen.getByTestId('provenance')
    expect(provenance.className).toBe('sr-only')
    expect(provenance.textContent).not.toBe('')
    expect(screen.getByTestId('request-text').contains(provenance)).toBe(false)
    expect(provenance.closest('details')).toBeNull()
  })

  it('states where the session is attached (provenance), never computing membership', () => {
    send()
    expect(screen.getByTestId('provenance').textContent).toBe(`rattachée à l’exécution ${thread.run!.id.slice(0, 8)}`)
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
    for (const x of texts) expect(x).toMatch(/^rattachée à l’exécution [0-9a-f]{8}$/)
  })

  it('words each mechanism', () => {
    const link = { run_id: null, task_id: 'abcdef123456', plan_id: null }
    expect(linkProvenance({ via: 'task_association', ...link }, thread)).toBe('rattachée à la tâche abcdef12')
    expect(linkProvenance({ via: 'plan_association', ...link }, thread)).toBe(`rattachée au plan ${thread.plan!.title}`)
    expect(linkProvenance({ via: 'spawned_by_json', ...link, run_id: 'r1234567890' }, undefined)).toBe('créée par l’exécution r1234567')
  })
})

describe('ThreadRow — unattached session (no thread)', () => {
  const data = fixture('unattached_waiting')
  const live = data.unattached.filter((u) => u.state === 'live')
  const question = live.find((u) => u.pending[0]?.kind === 'question')!
  const permission = live.find((u) => u.pending[0]?.kind === 'permission')!
  const dead = data.unattached.find((u) => u.state === 'dead')!

  it('is the same row, labelled "Conversation libre", in its lane, with since when', () => {
    const { container } = renderRow(
      <ThreadRow variant="unattached" session={question} onSendMessage={noSend} laneName="Lane X" attachSlot={<button type="button">Rattacher</button>} />,
    )
    expect(container.querySelector(`li[data-variant="unattached"][data-session="${question.id}"]`)).toBeTruthy()
    const label = screen.getByTestId('no-thread-label')
    expect(label.textContent).toBe(ROW_TEXT.noThread)
    expect(ROW_TEXT.noThread).toBe('Conversation libre')
    const lane = screen.getByText('Lane X')
    expect(label.compareDocumentPosition(lane) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(/^en cours depuis /)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rattacher' })).toBeTruthy()
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

  it('a DEAD session is resumed with "Reprendre la conversation" (user_message), never Autoriser', async () => {
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
    expect(screen.getByText(/^arrêtée depuis /)).toBeTruthy()
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
