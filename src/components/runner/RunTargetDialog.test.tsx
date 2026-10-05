/**
 * One-click run launchers hold the launch for a provider choice when there are
 * several providers, and ask consent for the PLAN's project, not the chat's.
 *
 * Run with: npx vitest run src/components/runner/RunTargetDialog.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { providersAtom, providersLoadStateAtom } from '@/atoms'
import type { ProviderInstance, ProvidersResponse } from '@/types/provider'

const list = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: { list: (...a: unknown[]) => list(...a) },
}))

import { useRunTargetGate, type PendingRun } from '@/hooks/useRunTargetGate'
import { RunTargetDialog } from './RunTargetDialog'

const CLAUDE: ProviderInstance = { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, health: { status: 'healthy' }, models: [] }
const DEEPSEEK: ProviderInstance = { id: 'deepseek', kind: 'openai_compatible', label: 'DeepSeek', cost_source: 'priced', health: { status: 'healthy' }, models: [] }

function Harness({ request }: { request: PendingRun }) {
  const gate = useRunTargetGate()
  return (
    <>
      <button onClick={() => void gate.ask(request)}>go</button>
      <RunTargetDialog pending={gate.pending} onCancel={gate.cancel} />
    </>
  )
}

function mount(providers: ProviderInstance[], request: PendingRun, state: 'ready' | 'unsupported' = 'ready') {
  const data: ProvidersResponse = { providers, default: { provider: 'claude-code', model: null, routed_by: 'default' } }
  const store = createStore()
  store.set(providersAtom, state === 'ready' ? data : null)
  store.set(providersLoadStateAtom, state)
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Harness request={request} />
      </MemoryRouter>
    </Provider>,
  )
}

beforeEach(() => list.mockReset())

describe('run launch gate', () => {
  it('launches at once, with nothing chosen, when there is a single provider', async () => {
    list.mockResolvedValue({ providers: [CLAUDE] })
    const run = vi.fn()
    mount([CLAUDE], { title: 'Plan A', run })
    fireEvent.click(screen.getByText('go'))
    expect(run).toHaveBeenCalledWith({}, false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('launches at once on a backend without provider routes', () => {
    list.mockResolvedValue({ providers: [] })
    const run = vi.fn()
    mount([], { title: 'Plan A', run }, 'unsupported')
    fireEvent.click(screen.getByText('go'))
    expect(run).toHaveBeenCalledWith({}, false)
  })

  it('asks which provider first when there are several, then launches with the choice', async () => {
    list.mockResolvedValue({ providers: [CLAUDE, DEEPSEEK] })
    const run = vi.fn()
    mount([CLAUDE, DEEPSEEK], { title: 'Plan A', run })
    fireEvent.click(screen.getByText('go'))
    expect(run).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('radio', { name: /DeepSeek/ }))
    fireEvent.click(screen.getByRole('button', { name: /Launch/ }))
    await waitFor(() => expect(run).toHaveBeenCalledWith({ provider: 'deepseek' }, false))
  })

  it('cancelling launches nothing', async () => {
    list.mockResolvedValue({ providers: [CLAUDE, DEEPSEEK] })
    const run = vi.fn()
    mount([CLAUDE, DEEPSEEK], { title: 'Plan A', run })
    fireEvent.click(screen.getByText('go'))
    fireEvent.click(await screen.findByRole('button', { name: /Cancel/ }))
    expect(run).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Escape cancels the dialog and focus moves into it', async () => {
    list.mockResolvedValue({ providers: [CLAUDE, DEEPSEEK] })
    const run = vi.fn()
    mount([CLAUDE, DEEPSEEK], { title: 'Plan A', run })
    fireEvent.click(screen.getByText('go'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  it("takes consent from the plan's project, not from the chat's list", async () => {
    // The chat's list says deepseek is allowed; the plan's project says it is not.
    list.mockImplementation((params?: { project_slug?: string }) =>
      Promise.resolve({
        providers: [CLAUDE, { ...DEEPSEEK, allowed_for_project: params?.project_slug === 'plan-project' ? false : true }],
      }),
    )
    const run = vi.fn()
    mount([CLAUDE, { ...DEEPSEEK, allowed_for_project: true }], { title: 'Plan A', projectSlug: 'plan-project', run })
    fireEvent.click(screen.getByText('go'))
    await waitFor(() => expect(list).toHaveBeenCalledWith({ project_slug: 'plan-project' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: /DeepSeek/ }).getAttribute('aria-disabled')).toBe('true'))
  })
})
