/**
 * The context window DECLARED by hand on an instance.
 *
 * Why it exists: an endpoint that publishes no window (`/v1/models` at NVIDIA
 * NIM answers `id`, `object`, `created`, `owned_by`) has its models rejected by
 * the router BEFORE any scoring, and its sessions lose automatic compaction. A
 * declared floor fixes both — but only if the human can see and edit it.
 *
 * The three things this file pins:
 *  - nothing declared reads as UNKNOWN on screen, never as `0`;
 *  - an untouched field sends nothing (the stored value stays), a touched empty
 *    field sends `null` (clear), a number sends the number;
 *  - the backend's own floor is enforced here first, so the form cannot save a
 *    value the server would refuse.
 *
 * Run with: npx vitest run src/components/settings/ProviderInstanceForm.contextWindow.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'

const update = vi.fn()
const get = vi.fn()
const limitsApi = vi.fn()
const models = vi.fn()
const overview = vi.fn()
const testApi = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    test: (...a: unknown[]) => testApi(...a),
    update: (...a: unknown[]) => update(...a),
    get: (...a: unknown[]) => get(...a),
    models: (...a: unknown[]) => models(...a),
    limits: (...a: unknown[]) => limitsApi(...a),
    create: vi.fn(),
    status: vi.fn(),
    list: vi.fn(),
  },
}))
vi.mock('@/services/vault', async (orig) => ({
  ...(await orig<typeof import('@/services/vault')>()),
  vaultApi: { overview: () => overview() },
}))

import { ProviderInstanceForm } from './ProviderInstanceForm'
import { clearModelCatalogCache } from './useModelCatalog'
import { DEEPSEEK, mountSettings } from './settingsTestKit'
import type { ProviderInstance } from '@/types/provider'

const onSaved = vi.fn()
const onCancel = vi.fn()

/** 131 072: the window of meta/muse-glimmer-30b, measured from its own config. */
const DECLARED = 131_072
let CURRENT: number | null = null

const storedOf = (i: ProviderInstance, contextWindow: number | null) => ({
  id: i.id,
  kind: i.kind,
  preset: i.preset ?? null,
  label: i.label,
  base_url: i.base_url ?? null,
  origin: i.origin ?? null,
  default_model: i.default_model ?? null,
  context_window: contextWindow,
  cost_source: i.cost_source ?? null,
  credential_ref: i.credential_ref ?? null,
  host: i.host ?? null,
  ssh_user: i.ssh_user ?? null,
  ssh_port: i.ssh_port ?? null,
  remote_cwd: i.remote_cwd ?? null,
  allow_trust: i.allow_trust ?? false,
  host_key_fingerprint: i.host_key_fingerprint ?? null,
  rate_limit: [],
})

async function mount() {
  const utils = mountSettings(
    <ProviderInstanceForm instance={DEEPSEEK} onSaved={onSaved} onCancel={onCancel} />,
  )
  await screen.findByRole('form')
  return utils
}

const windowField = () => screen.getByLabelText('Declared context window') as HTMLInputElement

const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  return update.mock.calls[0] as [string, Record<string, unknown>]
}

beforeEach(() => {
  for (const m of [update, get, limitsApi, models, overview, testApi, onSaved, onCancel]) m.mockReset()
  clearModelCatalogCache()
  CURRENT = null
  models.mockResolvedValue([])
  update.mockResolvedValue({})
  overview.mockResolvedValue({ secrets: [{ name: 'deepseek-key' }] })
  limitsApi.mockResolvedValue(null)
  get.mockImplementation(async () => storedOf(DEEPSEEK, CURRENT))
})

describe('an instance with no declared window', () => {
  it('says UNKNOWN on screen, never zero, and sends nothing when untouched', async () => {
    await mount()
    const field = windowField()
    // Unknown is a word, not a number: an empty field, and a placeholder that says so.
    expect(field.value).toBe('')
    expect(field.placeholder).toBe('Not declared (unknown)')
    // And the consequence is written, not left to be guessed.
    expect(screen.getByText(/the window stays UNKNOWN/)).toBeTruthy()

    const [, patch] = await save()
    // Untouched: the backend keeps whatever it holds (here: nothing).
    expect(patch).not.toHaveProperty('context_window')
  })
})

describe('a declared window', () => {
  it('loads it, and only sends it back once the human touches the field', async () => {
    CURRENT = DECLARED
    await mount()
    const field = windowField()
    expect(field.value).toBe(String(DECLARED))

    // Untouched: nothing travels, so a stale tab cannot rewrite it by accident.
    let [, patch] = await save()
    expect(patch).not.toHaveProperty('context_window')

    update.mockClear()
    fireEvent.change(field, { target: { value: '65536' } })
    ;[, patch] = await save()
    expect(patch.context_window).toBe(65_536)
  })

  it('is CLEARED by an empty field: null, never 0', async () => {
    CURRENT = DECLARED
    await mount()
    fireEvent.change(windowField(), { target: { value: '' } })
    const [, patch] = await save()
    // 0 would be a window of zero tokens — an assertion, not an absence.
    expect(patch.context_window).toBeNull()
  })
})

describe('a window the backend would refuse', () => {
  it('is refused here first, with the floor named, and nothing is saved', async () => {
    await mount()
    const field = windowField()
    fireEvent.change(field, { target: { value: '4096' } })

    expect(await screen.findByText(/At least 8000 tokens/)).toBeTruthy()
    expect(field.getAttribute('aria-invalid')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    // No round trip: the form refuses to send what the server would reject.
    await new Promise((r) => setTimeout(r, 20))
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses something that is not a number at all', async () => {
    await mount()
    fireEvent.change(windowField(), { target: { value: '128k' } })
    expect(await screen.findByText(/A whole number of tokens/)).toBeTruthy()
  })

  it('refuses an absurd value at the upper bound', async () => {
    await mount()
    fireEvent.change(windowField(), { target: { value: '100000001' } })
    expect(await screen.findByText(/At most 100000000 tokens/)).toBeTruthy()
  })
})

describe('the connection test result', () => {
  it('never shows a DECLARED window as if it had been measured', async () => {
    // nexus prefers the configured window over anything a probe could read, so
    // the number the probe reports here IS the one declared below: the screen
    // has to say so, otherwise a declaration passes for a measurement.
    CURRENT = DECLARED
    testApi.mockResolvedValue({
      ok: true,
      health: { status: 'healthy', version: null, checked_at: '2026-10-01T10:00:00Z' },
      probe: { tools: true, context_window: DECLARED },
    })
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    const line = await waitFor(() => screen.getByText(/\(declared\)/))
    // The number is locale-formatted (131,072) and it is a WORD that says where it
    // comes from: "(declared)", not the measured wording.
    expect(line.textContent).toMatch(/131.?072/)
  })
})
