/**
 * The run picker follows the routing mode of the plan's project.
 *
 * Run with: npx vitest run src/components/runner/RunTargetPicker
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
const routingGet = vi.fn()
const routingGetProject = vi.fn()
vi.mock('@/services/routing', async (orig) => ({
  ...(await orig<typeof import('@/services/routing')>()),
  routingApi: { get: () => routingGet(), getProject: (...a: unknown[]) => routingGetProject(...a) },
}))

import { useRunTarget } from '@/hooks/useRunTarget'
import { RunTargetPicker } from './RunTargetPicker'

const CLAUDE: ProviderInstance = { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, health: { status: 'healthy' }, models: [] }
const DEEPSEEK: ProviderInstance = { id: 'deepseek', kind: 'openai_compatible', label: 'DeepSeek', cost_source: 'priced', health: { status: 'healthy' }, models: [] }
const data: ProvidersResponse = { providers: [CLAUDE, DEEPSEEK], default: { provider: 'claude-code', model: null, routed_by: 'default' } }

const sent = () => JSON.parse(screen.getByTestId('options').textContent ?? 'null')
function Harness() {
  const target = useRunTarget('acme')
  return (
    <>
      <RunTargetPicker target={target} />
      <output data-testid="options">{JSON.stringify(target.options)}</output>
    </>
  )
}

function mount() {
  const store = createStore()
  store.set(providersAtom, data)
  store.set(providersLoadStateAtom, 'ready')
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </Provider>,
  )
}

const settings = (mode: string) => ({ mode, stage: 'shadow', primary: null, exploration_epsilon: 0, cost_weight: 0, latency_weight: 0, demote_after: 0, scope: 'project' })

beforeEach(() => {
  list.mockReset().mockResolvedValue(data)
  routingGet.mockReset()
  routingGetProject.mockReset()
})

describe('RunTargetPicker per routing mode', () => {
  it('primary: unchanged (server default row, provider choice)', async () => {
    routingGetProject.mockResolvedValue(settings('primary'))
    mount()
    expect(await screen.findByTestId('run-target')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Server default/ })).toBeTruthy()
    expect(screen.queryByText(/PO routes/)).toBeNull()
    expect(screen.queryByTestId('run-target-po-chooses')).toBeNull()
  })

  it('mixed: the default row reads "PO routes (recommended)" and an explicit choice still works and is sent', async () => {
    routingGetProject.mockResolvedValue(settings('mixed'))
    mount()
    expect(await screen.findByRole('radio', { name: 'PO routes (recommended)' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /DeepSeek/ }))
    await waitFor(() => expect(sent()).toEqual({ provider: 'deepseek' }))
  })

  it('full: the picker is hidden and a line says PO will choose; nothing is sent', async () => {
    routingGetProject.mockResolvedValue(settings('full'))
    mount()
    expect((await screen.findByTestId('run-target-po-chooses')).textContent).toBe('PO will choose (routing: full)')
    expect(screen.queryByTestId('run-target')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(sent()).toEqual({})
  })

  it('falls back to primary when the routing answer fails (404)', async () => {
    routingGetProject.mockRejectedValue(new Error('404'))
    mount()
    expect(await screen.findByTestId('run-target')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Server default/ })).toBeTruthy()
  })
})
