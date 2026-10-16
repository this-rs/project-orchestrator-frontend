/**
 * RL8 — the optional "Limits" section of the instance edit form:
 *  - with no limit configured, the screen stays what it was and the PATCH
 *    carries no `rate_limit` at all;
 *  - with limits, they load, they say themselves in plain language, and only a
 *    touched list is sent back;
 *  - the live state (RL7) tells `limited` and `overloaded` apart by ICON AND
 *    TEXT, never by colour.
 *
 * Run with: npx vitest run src/components/settings/ProviderInstanceForm.rateLimit.test.tsx
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'

const update = vi.fn()
const get = vi.fn()
const limitsApi = vi.fn()
const models = vi.fn()
const overview = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    test: vi.fn(),
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
import type { RateLimit, RateLimitReport } from '@/types/rateLimit'

const FIXTURE_DIR = join(__dirname, '..', '..', 'services', '__fixtures__', 'rate_limit')
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8')) as Record<string, unknown>

const GOLDEN_LIMITS = fixture('limits').limits as RateLimit[]

const onSaved = vi.fn()
const onCancel = vi.fn()

const storedOf = (i: ProviderInstance, rateLimit: RateLimit[]) => ({
  id: i.id,
  kind: i.kind,
  preset: i.preset ?? null,
  label: i.label,
  base_url: i.base_url ?? null,
  origin: i.origin ?? null,
  default_model: i.default_model ?? null,
  cost_source: i.cost_source ?? null,
  credential_ref: i.credential_ref ?? null,
  host: i.host ?? null,
  ssh_user: i.ssh_user ?? null,
  ssh_port: i.ssh_port ?? null,
  remote_cwd: i.remote_cwd ?? null,
  allow_trust: i.allow_trust ?? false,
  host_key_fingerprint: i.host_key_fingerprint ?? null,
  rate_limit: rateLimit,
})

let CURRENT: RateLimit[] = []

async function mount() {
  const utils = mountSettings(
    <ProviderInstanceForm instance={DEEPSEEK} onSaved={onSaved} onCancel={onCancel} />,
  )
  await screen.findByRole('form')
  return utils
}

const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  return update.mock.calls[0] as [string, Record<string, unknown>]
}

beforeEach(() => {
  for (const m of [update, get, limitsApi, models, overview, onSaved, onCancel]) m.mockReset()
  clearModelCatalogCache()
  CURRENT = []
  models.mockResolvedValue([])
  update.mockResolvedValue({})
  overview.mockResolvedValue({ secrets: [{ name: 'deepseek-key' }] })
  limitsApi.mockResolvedValue(null)
  get.mockImplementation(async (id: string) => storedOf(DEEPSEEK, id === DEEPSEEK.id ? CURRENT : []))
})

describe('an instance with no limit configured', () => {
  it('leaves the screen as it is, and sends no rate_limit at all', async () => {
    await mount()
    // The section is there, closed: no row, no pill, nothing new on screen.
    expect(screen.getByTestId('rate-limits')).toBeTruthy()
    expect(screen.queryAllByTestId('rate-limit-row')).toHaveLength(0)
    expect(screen.queryByTestId('rate-limit-status')).toBeNull()

    const [, patch] = await save()
    expect(patch).not.toHaveProperty('rate_limit')
  })
})

describe('the limits of a stored instance', () => {
  it('loads them, shows them in plain language, and leaves them alone when untouched', async () => {
    CURRENT = GOLDEN_LIMITS
    await mount()
    // An instance that HAS limits opens its section: the rows are visible.
    const rows = await screen.findAllByTestId('rate-limit-row')
    expect(rows).toHaveLength(5)
    expect(screen.getAllByTestId('rate-limit-preview')[0].textContent).toContain(
      '40 requests per minute (This instance)',
    )
    // The credential scope names the REFERENCE, never a value.
    const text = screen.getByTestId('rate-limits').textContent ?? ''
    expect(text).toContain('vault:nvidia-nim')
    expect(text).not.toContain('sk-')

    // Untouched: the form sends no `rate_limit`, so the stored list is untouched too.
    const [, patch] = await save()
    expect(patch).not.toHaveProperty('rate_limit')
  })

  it('sends the list as soon as the human touches it', async () => {
    CURRENT = GOLDEN_LIMITS
    await mount()
    await screen.findAllByTestId('rate-limit-row')
    fireEvent.click(screen.getByTestId('rate-limit-add'))
    expect(await screen.findAllByTestId('rate-limit-row')).toHaveLength(6)

    const [, patch] = await save()
    expect(patch.rate_limit).toHaveLength(6)
  })
})

describe('the live state', () => {
  it('tells a quota apart from an overloaded provider, by icon and text', async () => {
    CURRENT = GOLDEN_LIMITS
    const report: RateLimitReport = {
      provider_id: 'deepseek',
      status: 'limited',
      limits: [
        {
          kind: 'requests',
          window: 'minute',
          calendar: null,
          max: 40,
          scope: 'instance',
          credential: null,
          used: 40,
          remaining: 0,
          resets_at: '2026-10-08T12:34:00Z',
          status: 'limited',
          since: '2026-10-08T12:30:00Z',
          next_retry_at: null,
        },
        {
          kind: 'tokens',
          window: 'hour',
          calendar: null,
          max: 200000,
          scope: 'instance',
          credential: null,
          used: 1000,
          remaining: 199000,
          resets_at: null,
          status: 'overloaded',
          since: null,
          next_retry_at: '2026-10-08T12:45:00Z',
        },
      ],
    }
    limitsApi.mockResolvedValue(report)
    await mount()

    const card = await screen.findByTestId('rate-limit-status')
    expect(card).toBeTruthy()
    // Two different sentences, each with its own icon — never a colour alone.
    expect(await screen.findByText(/^Limit reached until \d{2}:\d{2}$/)).toBeTruthy()
    expect(await screen.findByText(/^Provider overloaded, next attempt at \d{2}:\d{2}$/)).toBeTruthy()
    expect(card.querySelectorAll('svg')).toHaveLength(2)
    expect(screen.getAllByTestId('rate-limit-pill')).toHaveLength(2)
  })

  it('shows nothing at all for an instance without limits', async () => {
    limitsApi.mockResolvedValue({ provider_id: 'deepseek', status: 'ok', limits: [] })
    await mount()
    expect(screen.queryByTestId('rate-limit-status')).toBeNull()
  })

  it('survives a backend that has no such route', async () => {
    limitsApi.mockRejectedValue(new Error('404'))
    await mount()
    expect(screen.getByTestId('rate-limits')).toBeTruthy()
    expect(screen.queryByTestId('rate-limit-status')).toBeNull()
  })
})
