/**
 * "Models Auto may use" (AUTO-L): the person's own list, one section per provider,
 * all / none per section and for everything, the count said in words.
 *
 * Run with: npx vitest run src/components/settings/AutoModelsSettings
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'

const get = vi.hoisted(() => vi.fn())
const put = vi.hoisted(() => vi.fn())
vi.mock('@/services/routing', async (orig) => ({
  ...(await orig<typeof import('@/services/routing')>()),
  autoModelsApi: { get: () => get(), put: (...a: unknown[]) => put(...a) },
}))
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: { models: vi.fn().mockResolvedValue({ models: [{ id: 'flash' }, { id: 'pro' }] }), list: vi.fn() },
}))

import { modelCatalogAtom, modelCatalogLoadedAtom, providersAtom } from '@/atoms'
import { ApiError } from '@/services/api'
import { clearModelCatalogCache } from './useModelCatalog'
import type { ProvidersResponse } from '@/types/provider'
import { AutoModelsSettings } from './AutoModelsSettings'

vi.setConfig({ testTimeout: 20000 })

const PROVIDERS: ProvidersResponse = {
  providers: [
    { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, health: { status: 'healthy' }, models: [], default_model: 'claude-opus-5' },
    { id: 'deepseek', kind: 'openai_compatible', label: 'DeepSeek', health: { status: 'healthy' }, default_model: 'flash', models: [{ id: 'flash' }, { id: 'pro' }] },
  ],
  default: { provider: 'claude-code', model: 'claude-opus-5', routed_by: 'default' },
}

const CLAUDE = ['opus', 'sonnet'].map((family) => ({
  id: `claude-${family}-5`,
  family,
  version: '5',
  tier: 'current',
  shortLabel: `${family} 5`,
  fullLabel: `Claude ${family} 5`,
  description: '',
})) as never[]

function mount() {
  const store = createStore()
  store.set(providersAtom, PROVIDERS)
  store.set(modelCatalogAtom, CLAUDE)
  store.set(modelCatalogLoadedAtom, true)
  render(
    <Provider store={store}>
      <AutoModelsSettings />
    </Provider>,
  )
}

const summary = () => screen.getByTestId('auto-models-summary').textContent
const model = (provider: string, id: string) => screen.getByTestId(`auto-models-model-${provider}-${id}`)

beforeEach(() => {
  get.mockReset()
  put.mockReset()
  clearModelCatalogCache()
  put.mockImplementation(async (models: { provider: string; model: string }[]) => ({ models, all_available: models.length === 0 }))
})

describe('AutoModelsSettings', () => {
  it('unset: every available model is ticked and the label says so; nothing to save', async () => {
    get.mockResolvedValue({ models: [], all_available: true })
    mount()
    await screen.findByTestId('auto-models')
    expect(summary()).toBe('Auto picks from: every available model')
    expect(model('deepseek', 'flash').getAttribute('aria-checked')).toBe('true')
    expect(model('claude-code', 'claude-opus-5').getAttribute('aria-checked')).toBe('true')
    expect((screen.getByTestId('auto-models-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('unticking one model turns the rest into a list of N models, saved for this person', async () => {
    get.mockResolvedValue({ models: [], all_available: true })
    mount()
    await screen.findByTestId('auto-models')
    fireEvent.click(model('deepseek', 'pro'))
    expect(summary()).toBe('Auto picks from: 3 models')
    fireEvent.click(screen.getByTestId('auto-models-save'))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    const sent = put.mock.calls[0][0] as { provider: string; model: string }[]
    expect(sent).toHaveLength(3)
    expect(sent).not.toContainEqual({ provider: 'deepseek', model: 'pro' })
    expect(await screen.findByText('Saved.')).toBeTruthy()
  })

  it('all / none per section, and select all returns to every available model', async () => {
    get.mockResolvedValue({ models: [{ provider: 'deepseek', model: 'flash' }], all_available: false })
    mount()
    await screen.findByTestId('auto-models')
    expect(summary()).toBe('Auto picks from: 1 model')
    const section = screen.getByTestId('auto-models-provider-claude-code')
    fireEvent.click(within(section).getByRole('button', { name: 'Tick every model of Claude Code' }))
    expect(summary()).toBe('Auto picks from: 3 models')
    expect(screen.getByTestId('auto-models-provider-check-claude-code').getAttribute('aria-checked')).toBe('true')
    // DeepSeek: one of two, shown as mixed (a shape, not a colour).
    expect(screen.getByTestId('auto-models-provider-check-deepseek').getAttribute('aria-checked')).toBe('mixed')
    fireEvent.click(within(section).getByRole('button', { name: 'Untick every model of Claude Code' }))
    expect(summary()).toBe('Auto picks from: 1 model')
    fireEvent.click(screen.getByTestId('auto-models-all'))
    expect(summary()).toBe('Auto picks from: every available model')
    fireEvent.click(screen.getByTestId('auto-models-save'))
    await waitFor(() => expect(put).toHaveBeenCalledWith([]))
  })

  it('none at all cannot be saved: it says to tick one or select all', async () => {
    get.mockResolvedValue({ models: [], all_available: true })
    mount()
    await screen.findByTestId('auto-models')
    fireEvent.click(screen.getByTestId('auto-models-none'))
    expect(screen.getByTestId('auto-models-empty')).toBeTruthy()
    expect((screen.getByTestId('auto-models-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('a listed model that is gone is counted out loud, never an error', async () => {
    get.mockResolvedValue({ models: [{ provider: 'gone', model: 'x' }, { provider: 'deepseek', model: 'flash' }], all_available: false })
    mount()
    await screen.findByTestId('auto-models')
    expect(screen.getByTestId('auto-models-missing').textContent).toContain('1 model(s)')
  })

  it('a token that is not a person (403): explains, offers nothing to change', async () => {
    get.mockRejectedValue(new ApiError(403, 'forbidden'))
    mount()
    expect(await screen.findByText('Sign in to choose the models your Auto may use.')).toBeTruthy()
    expect(screen.queryByTestId('auto-models-save')).toBeNull()
  })

  it('every checkbox has a 24px target and a visible focus ring', async () => {
    get.mockResolvedValue({ models: [], all_available: true })
    mount()
    await screen.findByTestId('auto-models')
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box.className).toMatch(/min-h-6|size-6/)
      expect(box.className).toContain('focus-visible:ring-2')
    }
  })
})
