/**
 * The launcher of a plan run: provider/model choice (FC5), decided and
 * explained BEFORE launch — default, no USD budget without a price, a project
 * not allowed for an instance.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { providersAtom, providersLoadStateAtom } from '@/atoms'
import type { ProviderInstance, ProvidersResponse } from '@/types/provider'

const list = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: { list: (...a: unknown[]) => list(...a) },
}))

import { ImplementDialog } from '../ImplementDialog'

const CLAUDE: ProviderInstance = { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, health: { status: 'healthy' }, models: [] }
const DEEPSEEK: ProviderInstance = {
  id: 'deepseek',
  kind: 'openai_compatible',
  label: 'DeepSeek',
  cost_source: 'priced',
  health: { status: 'healthy' },
  models: [{ id: 'deepseek-chat' }],
}
const LOCAL: ProviderInstance = {
  id: 'local-llama',
  kind: 'openai_compatible',
  label: 'Local llama',
  cost_source: 'free',
  health: { status: 'healthy' },
  models: [{ id: 'qwen3' }],
}
const FOREIGN: ProviderInstance = { ...DEEPSEEK, id: 'other', label: 'Other corp', allowed_for_project: false }

function mount(providers: ProviderInstance[], state: 'ready' | 'unsupported' = 'ready') {
  const data: ProvidersResponse = {
    providers,
    default: { provider: 'claude-code', model: null, routed_by: 'default' },
    aliases: [{ alias: 'fast', provider: 'deepseek', model: 'deepseek-chat' }],
  }
  list.mockResolvedValue(data)
  const store = createStore()
  store.set(providersAtom, state === 'ready' ? data : null)
  store.set(providersLoadStateAtom, state)
  const onConfirm = vi.fn()
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ImplementDialog open onClose={vi.fn()} onConfirm={onConfirm} mode="plan" entityTitle="My plan" />
      </MemoryRouter>
    </Provider>,
  )
  return onConfirm
}

beforeEach(() => list.mockReset())

describe('ImplementDialog — provider / model', () => {
  it('launches on the server default, sending nothing about provider or model', () => {
    const onConfirm = mount([CLAUDE, DEEPSEEK])
    expect(screen.getByRole('radio', { name: /Server default \(Claude Code, server default\)/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /Launch/ }))
    expect(onConfirm).toHaveBeenCalledWith(10, {})
  })

  it('sends the chosen provider and alias, and says third-party runs never bypass permissions', () => {
    const onConfirm = mount([CLAUDE, DEEPSEEK])
    expect(screen.queryByTestId('run-target-third-party')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /DeepSeek/ }))
    expect(screen.getByTestId('run-target-third-party').textContent).toMatch(/never bypasses permissions/)
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'fast' } })
    fireEvent.click(screen.getByRole('button', { name: /Launch/ }))
    expect(onConfirm).toHaveBeenCalledWith(10, { provider: 'deepseek', model: 'fast' })
  })

  it('disables the USD budget with an explanation when the instance has no price, and offers a token budget', () => {
    const onConfirm = mount([CLAUDE, DEEPSEEK, LOCAL])
    expect(screen.getByLabelText('Budget limit in USD').hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('radio', { name: /Local llama/ }))
    const usd = screen.getByLabelText('Budget limit in USD')
    expect(usd.hasAttribute('disabled')).toBe(true)
    const help = document.getElementById(usd.getAttribute('aria-describedby')!)
    expect(help?.textContent).toMatch(/no known price/)
    fireEvent.change(screen.getByLabelText('Token budget'), { target: { value: '2000000' } })
    fireEvent.click(screen.getByRole('button', { name: /Launch/ }))
    expect(onConfirm).toHaveBeenCalledWith(undefined, { provider: 'local-llama', maxTokens: 2000000 })
  })

  it('does not let an instance the project has not allowed be picked, and links to the consent', () => {
    const onConfirm = mount([CLAUDE, DEEPSEEK, FOREIGN])
    const row = screen.getByRole('radio', { name: /Other corp/ })
    expect(row.getAttribute('aria-disabled')).toBe('true')
    expect(document.getElementById(row.getAttribute('aria-describedby')!)?.textContent).toBe('Not allowed for this project')
    fireEvent.click(row)
    expect(row.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('link', { name: /Allow this project/ }).getAttribute('href')).toBe('/providers#consent')
    fireEvent.click(screen.getByRole('button', { name: /Launch/ }))
    expect(onConfirm).toHaveBeenCalledWith(10, {})
  })

  it('shows no provider control on a backend without provider routes, nor with a single instance', () => {
    const { unmount } = render(<div />)
    unmount()
    mount([], 'unsupported')
    expect(screen.queryByTestId('run-target')).toBeNull()
  })

  it('shows no provider control with a single instance', () => {
    mount([CLAUDE])
    expect(screen.queryByTestId('run-target')).toBeNull()
  })
})
