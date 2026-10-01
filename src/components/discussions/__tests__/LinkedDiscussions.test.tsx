import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import type { SessionTreeNode, SessionWithLinks } from '@/types/chat'
import type { WaitingRequest } from '@/types/attention'

const chat = vi.hoisted(() => ({
  getPlanSessions: vi.fn(),
  getTaskSessions: vi.fn(),
  getRunSessions: vi.fn(),
  getSessionTree: vi.fn(),
  associateSession: vi.fn(),
}))
vi.mock('@/services/chat', () => ({ chatApi: chat }))

const attention = vi.hoisted(() => ({ sendMessage: vi.fn(), resumeRun: vi.fn() }))
vi.mock('@/services/attention', async () => {
  const actual = await vi.importActual<typeof import('@/services/attention')>('@/services/attention')
  return { ...actual, attentionApi: { ...actual.attentionApi, ...attention } }
})

const runner = vi.hoisted(() => ({ startRun: vi.fn(), retryTask: vi.fn() }))
vi.mock('@/services/runner', async () => {
  const actual = await vi.importActual<typeof import('@/services/runner')>('@/services/runner')
  return { ...actual, runnerApi: { ...actual.runnerApi, ...runner } }
})

const plansList = vi.hoisted(() => vi.fn())
const tasksList = vi.hoisted(() => vi.fn())
vi.mock('@/services/plans', () => ({ plansApi: { list: plansList } }))
vi.mock('@/services/tasks', () => ({ tasksApi: { list: tasksList } }))
vi.mock('@/services/projects', () => ({ projectsApi: { list: vi.fn(async () => ({ items: [{ id: 'proj1', slug: 'alpha' }] })) } }))

const wsProjects = vi.hoisted(() => vi.fn())
vi.mock('@/services/workspaces', async () => {
  const actual = await vi.importActual<typeof import('@/services/workspaces')>('@/services/workspaces')
  return { ...actual, workspacesApi: { ...actual.workspacesApi, listProjects: wsProjects } }
})

import { LinkedDiscussions } from '../LinkedDiscussions'
import { attentionDigestAtom, attentionRefreshRequestAtom, EMPTY_DIGEST, type AttentionDigest } from '@/atoms/attentionDigest'

const listed = (id: string, title: string, source = 'runner'): SessionWithLinks => ({
  session: { id, title, cwd: '/x', model: 'm', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', message_count: 3 },
  links: { linked_plans: [], linked_tasks: [], linked_rfcs: [] },
  source,
})
const row = (id: string, parent: string | null, extra: Partial<SessionTreeNode> = {}): SessionTreeNode => ({
  session_id: id,
  parent_session_id: parent,
  depth: parent ? 1 : 0,
  is_streaming: false,
  ...extra,
})

const TREES: Record<string, SessionTreeNode[]> = {
  'run-root': [row('run-root', null, { run_id: 'run1', task_id: 't1' }), row('run-kid', 'run-root', { run_id: 'run1', task_id: 't1' })],
  'by-hand': [row('by-hand', 'parent-elsewhere')],
  dead: [row('dead', null)],
}

const request = { request_id: 'r1', kind: 'permission', session_id: 'dead', text: 'Autoriser rm -rf ?', options: [], seq: 1 } as unknown as WaitingRequest

function setup(
  props: Partial<React.ComponentProps<typeof LinkedDiscussions>> = {},
  digest: Partial<AttentionDigest> = {},
) {
  const store = createStore()
  store.set(attentionDigestAtom, { ...EMPTY_DIGEST, status: 'ready', ...digest })
  const utils = render(
    <Provider store={store}>
      <MemoryRouter>
        <LinkedDiscussions entity={{ type: 'plan', id: 'plan1' }} projectId="proj1" {...props} />
      </MemoryRouter>
    </Provider>,
  )
  return { store, ...utils }
}

beforeEach(() => {
  for (const f of [...Object.values(chat), attention.sendMessage, attention.resumeRun, runner.startRun, runner.retryTask, plansList, tasksList]) f.mockReset()
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  chat.getPlanSessions.mockResolvedValue([listed('run-root', 'Agent runner'), listed('by-hand', 'Discussion manuelle', 'manual'), listed('dead', 'Session morte')])
  chat.getSessionTree.mockImplementation(async (id: string) => TREES[id] ?? [])
  chat.associateSession.mockResolvedValue({})
  plansList.mockResolvedValue({ items: [{ id: 'planB', title: 'Plan B' }], total: 1 })
  tasksList.mockResolvedValue({ items: [{ id: 'taskB', title: 'Tâche B', plan_title: 'Plan B' }], total: 1 })
  runner.startRun.mockResolvedValue({})
  runner.retryTask.mockResolvedValue(undefined)
  attention.sendMessage.mockResolvedValue(undefined)
})

const padding = (title: string) => (screen.getByText(title).closest('[style]') as HTMLElement).style.paddingLeft

describe('LinkedDiscussions — one forest', () => {
  it('shows every linked session; a session attached by hand with no parent is a root, a child sits under its parent', async () => {
    setup()
    await screen.findByText('Discussion manuelle')
    for (const t of ['Agent runner', 'Discussion manuelle', 'Session morte', 'Session run-kid']) expect(screen.getByText(t)).toBeTruthy()
    expect(padding('Discussion manuelle')).toBe('4px') // depth 0: a root
    expect(padding('Agent runner')).toBe('4px')
    expect(padding('Session run-kid')).toBe('18px') // depth 1 (14 px per level): under its parent
    // the former flat list's useful content survives (how it was linked)
    expect(screen.getByText('manual')).toBeTruthy()
  })

  it('a session whose subtree cannot be read still appears, and the failure is said', async () => {
    chat.getSessionTree.mockImplementation(async (id: string) => {
      if (id === 'by-hand') throw new Error('500')
      return TREES[id] ?? []
    })
    setup()
    await screen.findByText('Discussion manuelle')
    expect(screen.getByTestId('tree-errors').textContent).toContain('1 arbre')
  })

  it('reads the right route for a task and for a run', async () => {
    chat.getTaskSessions.mockResolvedValue([listed('dead', 'Session morte')])
    const t = setup({ entity: { type: 'task', id: 'task1' } })
    await screen.findByText('Session morte')
    expect(chat.getTaskSessions).toHaveBeenCalledWith('task1')
    t.unmount()
    chat.getRunSessions.mockResolvedValue([{ id: 'run-root', title: 'Racine du run', created_at: '2026-10-01T10:00:00Z', is_streaming: false }])
    setup({ entity: { type: 'run', id: 'run1' } })
    await screen.findByText('Racine du run')
    expect(chat.getRunSessions).toHaveBeenCalledWith('run1')
  })

  it('says what the server cannot do: attach = plan or task only, no detach', async () => {
    setup()
    await screen.findByText('Discussion manuelle')
    const limits = screen.getByTestId('linked-limits').textContent!
    expect(limits).toContain('un plan ou une tâche')
    expect(limits).toContain('un run se retrouve par son plan')
    expect(limits).toContain("pas de route de détachement")
  })

  it('an empty entity says how discussions get linked, and still lists the limits', async () => {
    chat.getPlanSessions.mockResolvedValue([])
    setup()
    await screen.findByText(/Aucune discussion liée/)
    expect(screen.getByTestId('linked-limits')).toBeTruthy()
  })
})

describe('LinkedDiscussions — Rattacher à…', () => {
  it('attaches a node to a plan of the same project (source manual), then refreshes the tree AND the attention count', async () => {
    const { store } = setup()
    await screen.findByText('Discussion manuelle')
    const node = screen.getByText('Discussion manuelle').closest('[style]')!.parentElement!
    expect(chat.getPlanSessions).toHaveBeenCalledTimes(1)
    expect(store.get(attentionRefreshRequestAtom)).toBe(0)

    fireEvent.click(within(node).getByRole('button', { name: /Rattacher à…/ }))
    const dialog = await screen.findByTestId('attach-dialog')
    // limits are shown IN the dialog
    expect(within(dialog).getByTestId('attach-no-detach').textContent).toContain("pas de détachement")
    expect(dialog.textContent).toContain('pas à un run')
    await waitFor(() => expect(plansList).toHaveBeenCalledWith({ project_id: 'proj1', limit: 100 }))
    expect(tasksList).toHaveBeenCalledWith({ project_id: 'proj1', limit: 100 })

    fireEvent.change(await within(dialog).findByLabelText(/Plan du même projet/), { target: { value: 'planB' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rattacher' }))

    await waitFor(() => expect(chat.associateSession).toHaveBeenCalledWith('by-hand', 'Plan', 'planB', 'manual'))
    await waitFor(() => expect(chat.getPlanSessions).toHaveBeenCalledTimes(2)) // tree refreshed
    expect(store.get(attentionRefreshRequestAtom)).toBe(1) // badge source asked to refetch
  })

  it('can target a task, and a failed link keeps the dialog open and says why', async () => {
    chat.associateSession.mockRejectedValue(new Error('Entity not found'))
    setup()
    await screen.findByText('Discussion manuelle')
    const node = screen.getByText('Discussion manuelle').closest('[style]')!.parentElement!
    fireEvent.click(within(node).getByRole('button', { name: /Rattacher à…/ }))
    const dialog = await screen.findByTestId('attach-dialog')
    fireEvent.click(await within(dialog).findByLabelText('Une tâche'))
    fireEvent.change(within(dialog).getByLabelText(/Tâche du même projet/), { target: { value: 'taskB' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rattacher' }))
    await waitFor(() => expect(chat.associateSession).toHaveBeenCalledWith('by-hand', 'Task', 'taskB', 'manual'))
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Entity not found')
    expect(chat.getPlanSessions).toHaveBeenCalledTimes(1)
  })

  it('without a known project it says so instead of offering plans from elsewhere', async () => {
    setup({ projectId: null, projectSlug: null })
    await screen.findByText('Discussion manuelle')
    const node = screen.getByText('Discussion manuelle').closest('[style]')!.parentElement!
    fireEvent.click(within(node).getByRole('button', { name: /Rattacher à…/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('projet de cette session est inconnu')
    expect(plansList).not.toHaveBeenCalled()
  })
})

describe('LinkedDiscussions — Rattacher à… when only the workspace is known', () => {
  it('offers the plans and tasks of EVERY project of the workspace', async () => {
    wsProjects.mockResolvedValue([{ id: 'pA' }, { id: 'pB' }])
    plansList.mockImplementation(async ({ project_id }: { project_id: string }) => ({ items: [{ id: `plan-${project_id}`, title: `Plan ${project_id}` }], total: 1 }))
    setup({ projectId: null, projectSlug: null, workspaceSlug: 'acme' })
    await screen.findByText('Discussion manuelle')
    const node = screen.getByText('Discussion manuelle').closest('[style]')!.parentElement!
    fireEvent.click(within(node).getByRole('button', { name: /Rattacher à…/ }))
    const dialog = await screen.findByTestId('attach-dialog')
    await waitFor(() => expect(wsProjects).toHaveBeenCalledWith('acme'))
    const select = await within(dialog).findByLabelText(/Plan du même espace de travail/)
    expect(within(select).getByRole('option', { name: 'Plan pA' })).toBeTruthy()
    expect(within(select).getByRole('option', { name: 'Plan pB' })).toBeTruthy()
  })
})

describe('LinkedDiscussions — resume buttons', () => {
  const nodeOf = (title: string) => screen.getByText(title).closest('[style]')!.parentElement!

  it('"Reprendre la session" only on a dead session with a pending request; sends a message, never an Autoriser', async () => {
    setup({}, { deadPending: { dead: request } })
    await screen.findByText('Session morte')
    expect(within(nodeOf('Session morte')).getByRole('button', { name: 'Reprendre la session' })).toBeTruthy()
    expect(within(nodeOf('Discussion manuelle')).queryByRole('button', { name: 'Reprendre la session' })).toBeNull()
    expect(within(nodeOf('Agent runner')).queryByRole('button', { name: 'Reprendre la session' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Autoriser/i })).toBeNull()

    fireEvent.click(within(nodeOf('Session morte')).getByRole('button', { name: 'Reprendre la session' }))
    const sheet = await screen.findByTestId('continue-sheet')
    expect(within(sheet).queryByRole('button', { name: /Autoriser/i })).toBeNull()
    fireEvent.click(within(sheet).getAllByRole('button', { name: 'Reprendre la session' })[0])
    await waitFor(() => expect(attention.sendMessage).toHaveBeenCalledWith('dead', 'Continue.'))
  })

  it('no resume button at all when nothing is unfinished', async () => {
    setup({ resume: { planId: 'plan1', run: { id: 'run1', status: 'completed' }, taskStatuses: { t1: 'completed' } } })
    await screen.findByText('Session morte')
    for (const name of ['Reprendre la session', 'Reprendre le run', 'Relancer la tâche']) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
  })

  it('"Reprendre le run" starts the plan in its project folder, once for the run, then refreshes', async () => {
    const { store } = setup({
      resume: { planId: 'plan1', project: { slug: 'alpha', root_path: '/p/alpha' }, run: { id: 'run1', status: 'failed' } },
    })
    await screen.findByText('Session morte')
    const buttons = screen.getAllByRole('button', { name: 'Reprendre le run' })
    expect(buttons).toHaveLength(1) // not on the child of the same run
    expect(within(nodeOf('Agent runner')).getByRole('button', { name: 'Reprendre le run' })).toBe(buttons[0])
    fireEvent.click(buttons[0])
    await waitFor(() => expect(runner.startRun).toHaveBeenCalledWith('plan1', '/p/alpha', 'alpha'))
    await waitFor(() => expect(chat.getPlanSessions).toHaveBeenCalledTimes(2))
    expect(store.get(attentionRefreshRequestAtom)).toBe(1)
  })

  it('"Relancer la tâche" uses the existing retry route, only for a failed/blocked task', async () => {
    setup({ resume: { planId: 'plan1', taskStatuses: { t1: 'failed' } } })
    await screen.findByText('Session morte')
    const btn = within(nodeOf('Agent runner')).getByRole('button', { name: 'Relancer la tâche' })
    expect(screen.getAllByRole('button', { name: 'Relancer la tâche' })).toHaveLength(1)
    fireEvent.click(btn)
    await waitFor(() => expect(runner.retryTask).toHaveBeenCalledWith('plan1', 't1'))
  })

  it('runner busy: run and task buttons are disabled, say why, link to the occupant, and do not call the server', async () => {
    setup(
      { resume: { planId: 'plan1', run: { id: 'run1', status: 'failed' }, taskStatuses: { t1: 'failed' } } },
      {
        runner: {
          status: 'busy',
          busy_with: { plan_id: 'other', plan_title: 'Autre plan', run_id: 'r9', workspace: 'studio', since: '2026-10-01T10:00:00Z' },
        },
      },
    )
    await screen.findByText('Session morte')
    const node = nodeOf('Agent runner')
    for (const name of ['Reprendre le run', 'Relancer la tâche']) {
      const b = within(node).getByRole('button', { name }) as HTMLButtonElement
      expect(b.disabled).toBe(true)
      fireEvent.click(b)
    }
    const reasons = within(node).getAllByTestId('busy-reason')
    expect(reasons[0].textContent).toContain('Runner occupé par le plan')
    const link = within(reasons[0]).getByRole('link', { name: 'Autre plan' })
    expect(link.getAttribute('href')).toContain('/plans/other')
    expect(runner.startRun).not.toHaveBeenCalled()
    expect(runner.retryTask).not.toHaveBeenCalled()
  })

  it('a busy runner does not block "Reprendre la session" (a message needs no runner)', async () => {
    setup(
      {},
      {
        deadPending: { dead: request },
        runner: { status: 'busy', busy_with: { plan_id: 'other', plan_title: 'Autre plan', run_id: 'r9', workspace: 'studio', since: 'x' } },
      },
    )
    await screen.findByText('Session morte')
    const b = within(nodeOf('Session morte')).getByRole('button', { name: 'Reprendre la session' }) as HTMLButtonElement
    expect(b.disabled).toBe(false)
  })
})
