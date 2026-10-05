import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { providersAtom, providersLoadStateAtom } from '@/atoms'
import type { ProvidersResponse } from '@/types/provider'

const list = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: { list: (...a: unknown[]) => list(...a) },
}))

import { TaskModelAlias } from './TaskModelAlias'

const DATA: ProvidersResponse = {
  providers: [
    { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', health: { status: 'healthy' }, models: [] },
    { id: 'deepseek', kind: 'openai_compatible', label: 'DeepSeek', health: { status: 'healthy' }, models: [{ id: 'deepseek-chat', aliases: ['fast'] }] },
  ],
  default: { provider: 'claude-code', routed_by: 'default' },
  aliases: [{ alias: 'deep', provider: 'claude-code', model: 'opus' }],
}

function mount(value: string | null | undefined, onChange = vi.fn().mockResolvedValue(undefined), state: 'ready' | 'unsupported' = 'ready') {
  list.mockResolvedValue(DATA)
  const store = createStore()
  store.set(providersAtom, state === 'ready' ? DATA : null)
  store.set(providersLoadStateAtom, state)
  render(
    <Provider store={store}>
      <TaskModelAlias value={value} onChange={onChange} />
    </Provider>,
  )
  return onChange
}

beforeEach(() => list.mockReset())

describe('TaskModelAlias', () => {
  it('lists the known aliases, empty meaning "inherit"', () => {
    mount(null)
    const options = [...screen.getByLabelText('Model alias').querySelectorAll('option')].map((o) => o.textContent)
    expect(options).toEqual(['Inherit (no override)', 'deep', 'fast'])
  })

  it('saves the chosen alias, and null when cleared', async () => {
    const onChange = mount('fast')
    const select = screen.getByLabelText('Model alias') as HTMLSelectElement
    expect(select.value).toBe('fast')
    fireEvent.change(select, { target: { value: 'deep' } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('deep'))
    fireEvent.change(select, { target: { value: '' } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null))
  })

  it('renders nothing on a backend without provider routes', () => {
    mount(null, undefined, 'unsupported')
    expect(screen.queryByTestId('task-model-alias')).toBeNull()
  })

  it('keeps showing an alias the task carries even when no instance lists it', () => {
    mount('legacy-alias', undefined, 'unsupported')
    expect((screen.getByLabelText('Model alias') as HTMLSelectElement).value).toBe('legacy-alias')
  })
})
