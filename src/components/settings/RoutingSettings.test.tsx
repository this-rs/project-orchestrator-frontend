/**
 * Routing settings: mode cards, learning stage (with confirmation), bounded tuning,
 * project override, and the backend's 400 codes as readable errors.
 *
 * Run with: npx vitest run src/components/settings/RoutingSettings
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const get = vi.fn()
const put = vi.fn()
const getProject = vi.fn()
const putProject = vi.fn()
const deleteProject = vi.fn()
vi.mock('@/services/routing', async (orig) => ({
  ...(await orig<typeof import('@/services/routing')>()),
  routingApi: {
    get: () => get(),
    put: (...a: unknown[]) => put(...a),
    getProject: (...a: unknown[]) => getProject(...a),
    putProject: (...a: unknown[]) => putProject(...a),
    deleteProject: (...a: unknown[]) => deleteProject(...a),
    decisions: vi.fn().mockResolvedValue([]),
    report: vi.fn().mockResolvedValue({ decisions: 0, applied: 0, agreement_rate: null, estimated_cost_delta_usd: null, by_class: [], by_arm: [] }),
  },
}))
vi.mock('@/services/projects', () => ({
  projectsApi: { list: vi.fn().mockResolvedValue({ items: [{ slug: 'acme', name: 'Acme' }] }) },
}))

import { ApiError } from '@/services/api'
import type { RoutingSettingsResponse } from '@/types/routing'
import { RoutingSettings } from './RoutingSettings'

const base: RoutingSettingsResponse = {
  mode: 'primary',
  stage: 'shadow',
  primary: null,
  exploration_epsilon: 0.05,
  cost_weight: 0.3,
  latency_weight: 0.2,
  demote_after: 20,
  scope: 'global',
}

// The first test pays for importing the whole settings tree.
vi.setConfig({ testTimeout: 20000 })

const mount = () => render(<RoutingSettings />)
const global = async () => within(await screen.findByTestId('routing-global'))

beforeEach(() => {
  for (const m of [get, put, getProject, putProject, deleteProject]) m.mockReset()
  get.mockResolvedValue(base)
  put.mockImplementation(async (s) => ({ ...s, scope: 'global' }))
  getProject.mockResolvedValue({ ...base, scope: 'global' })
  putProject.mockImplementation(async (_slug, s) => ({ ...s, scope: 'project' }))
  deleteProject.mockResolvedValue(undefined)
})

describe('RoutingSettings', () => {
  it('shows the three modes and sends the chosen mode in the PUT body', async () => {
    mount()
    const g = await global()
    expect(g.getAllByRole('radio', { name: /Strict|Mixed|^Auto(?!matic)/ })).toHaveLength(3)
    fireEvent.click(g.getByRole('radio', { name: /Mixed/ }))
    fireEvent.click(g.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0][0]).toEqual({
      mode: 'mixed',
      stage: 'shadow',
      primary: null,
      exploration_epsilon: 0.05,
      cost_weight: 0.3,
      latency_weight: 0.2,
      demote_after: 20,
    })
    expect(await g.findByText('Saved.')).toBeTruthy()
  })

  it('asks for confirmation before leaving shadow for auto, and sends nothing until confirmed', async () => {
    mount()
    const g = await global()
    fireEvent.click(g.getByRole('radio', { name: /Automatic/ }))
    fireEvent.click(g.getByRole('button', { name: 'Save' }))
    const dialog = await g.findByRole('alertdialog')
    expect(dialog.textContent).toContain('PO will now apply its own choices')
    expect(put).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(put).not.toHaveBeenCalled()
    fireEvent.click(g.getByRole('button', { name: 'Save' }))
    fireEvent.click(within(await g.findByRole('alertdialog')).getByRole('button', { name: 'Yes, continue' }))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0][0].stage).toBe('auto')
  })

  it('asks too for advisory, but not when the stage does not leave shadow', async () => {
    mount()
    const g = await global()
    fireEvent.click(g.getByRole('radio', { name: /Advisory/ }))
    fireEvent.click(g.getByRole('button', { name: 'Save' }))
    expect((await g.findByRole('alertdialog')).textContent).toContain('suggest its own choices')
    expect(put).not.toHaveBeenCalled()
  })

  it('does not ask when already past shadow', async () => {
    get.mockResolvedValue({ ...base, stage: 'advisory' })
    mount()
    const g = await global()
    fireEvent.click(g.getByRole('radio', { name: /Automatic/ }))
    fireEvent.click(g.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(g.queryByRole('alertdialog')).toBeNull()
  })

  it('enforces the bounds client-side: out-of-range values disable Save and name the bounds', async () => {
    mount()
    const g = await global()
    const eps = g.getByLabelText('Exploration rate')
    fireEvent.change(eps, { target: { value: '0.5' } })
    expect(g.getByText('Exploration rate must be between 0 and 0.25.')).toBeTruthy()
    expect((g.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(eps, { target: { value: '0.1' } })
    fireEvent.change(g.getByLabelText('Cost weight'), { target: { value: '1.5' } })
    expect(g.getByText('Cost weight must be between 0 and 1.')).toBeTruthy()
    fireEvent.change(g.getByLabelText('Cost weight'), { target: { value: '-0.1' } })
    expect((g.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(g.getByLabelText('Cost weight'), { target: { value: '1' } })
    fireEvent.click(g.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(put.mock.calls[0][0]).toMatchObject({ exploration_epsilon: 0.1, cost_weight: 1 })
  })

  it.each([
    ['invalid_routing_mode', 'does not know this routing mode'],
    ['invalid_learning_stage', 'does not know this learning stage'],
    ['invalid_routing_weight', 'out of bounds'],
  ])('renders the 400 code %s as a readable error', async (code, text) => {
    put.mockRejectedValue(new ApiError(400, JSON.stringify({ code, error: `${code}: nope` })))
    mount()
    const g = await global()
    fireEvent.click(g.getByRole('radio', { name: /^Auto(?!matic)/ }))
    fireEvent.click(g.getByRole('button', { name: 'Save' }))
    const alert = await g.findByRole('alert')
    expect(alert.textContent).toContain(text)
    expect(alert.textContent).not.toContain(code)
  })

  it('says so when the server forbids the change (agent token)', async () => {
    put.mockRejectedValue(new ApiError(403, 'forbidden'))
    mount()
    const g = await global()
    fireEvent.click(g.getByRole('radio', { name: /^Auto(?!matic)/ }))
    fireEvent.click(g.getByRole('button', { name: 'Save' }))
    expect((await g.findByRole('alert')).textContent).toContain('Only a signed-in person')
  })

  it('on a server without the router (404): explains and offers no form', async () => {
    get.mockRejectedValue(new ApiError(404, 'not found'))
    mount()
    expect(await screen.findByText(/no cognitive router/)).toBeTruthy()
    expect(screen.queryByTestId('routing-global')).toBeNull()
  })

  it('project override: shows the scope, PUTs to the project, then DELETE goes back to global', async () => {
    mount()
    await global()
    fireEvent.change(await screen.findByLabelText('Project', { selector: '#routing-project' }), { target: { value: 'acme' } })
    const p = within(await screen.findByTestId('routing-project'))
    expect(getProject).toHaveBeenCalledWith('acme')
    expect(screen.getAllByTestId('routing-scope').map((e) => e.textContent).join()).toContain('Global')

    fireEvent.click(p.getByRole('radio', { name: /^Auto(?!matic)/ }))
    fireEvent.click(p.getByRole('button', { name: 'Override for this project' }))
    await waitFor(() => expect(putProject).toHaveBeenCalledTimes(1))
    expect(putProject.mock.calls[0][0]).toBe('acme')
    expect(putProject.mock.calls[0][1]).toMatchObject({ mode: 'full', stage: 'shadow' })
    expect(await screen.findByText('Project override', { selector: '[data-testid="routing-scope"] *' })).toBeTruthy()

    getProject.mockResolvedValue({ ...base, scope: 'global' })
    fireEvent.click(await screen.findByRole('button', { name: 'Back to global' }))
    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith('acme'))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Back to global' })).toBeNull())
  })
})
