/**
 * Contract of the provider settings routes: method, path and body of each.
 * The backend routes did not exist when these were written — this file is
 * the one place that states what the interface assumes of them.
 *
 * Run with: npx vitest run src/services/__tests__/providersApi.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const post = vi.fn()
const get = vi.fn()
const patch = vi.fn()
const put = vi.fn()
const del = vi.fn()
vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  api: {
    post: (...a: unknown[]) => post(...a),
    get: (...a: unknown[]) => get(...a),
    patch: (...a: unknown[]) => patch(...a),
    put: (...a: unknown[]) => put(...a),
    delete: (...a: unknown[]) => del(...a),
  },
}))

import { providersApi } from '../providers'
import type { ProviderDraft } from '@/types/providerSettings'

const draft: ProviderDraft = {
  id: 'deepseek',
  kind: 'openai_compatible',
  preset: 'deepseek',
  label: 'DeepSeek',
  base_url: 'https://api.deepseek.com',
  default_model: 'deepseek-chat',
  cost_source: 'priced',
  credential_ref: 'vault:deepseek-key',
}

beforeEach(() => {
  for (const m of [post, get, patch, put, del]) m.mockReset().mockResolvedValue({})
})

describe('providersApi settings routes', () => {
  it('status — GET /chat/providers/{id}/status', async () => {
    await providersApi.status('a b')
    expect(get).toHaveBeenCalledWith('/chat/providers/a%20b/status')
  })

  it('test — POST /chat/providers/test with the draft', async () => {
    await providersApi.test(draft)
    expect(post).toHaveBeenCalledWith('/chat/providers/test', draft)
  })

  it('create — POST /chat/providers', async () => {
    await providersApi.create(draft)
    expect(post).toHaveBeenCalledWith('/chat/providers', draft)
  })

  it('update — PATCH /chat/providers/{id}', async () => {
    await providersApi.update('deepseek', { label: 'DS' })
    expect(patch).toHaveBeenCalledWith('/chat/providers/deepseek', { label: 'DS' })
  })

  it('remove — DELETE /chat/providers/{id}', async () => {
    await providersApi.remove('deepseek')
    expect(del).toHaveBeenCalledWith('/chat/providers/deepseek')
  })

  it('consents — GET, PUT { origin } and DELETE under /projects/{slug}/llm-consents', async () => {
    await providersApi.consents('po')
    expect(get).toHaveBeenCalledWith('/projects/po/llm-consents')
    await providersApi.allow('po', 'deepseek', 'https://api.deepseek.com')
    expect(put).toHaveBeenCalledWith('/projects/po/llm-consents/deepseek', { origin: 'https://api.deepseek.com' })
    await providersApi.revoke('po', 'deepseek')
    expect(del).toHaveBeenCalledWith('/projects/po/llm-consents/deepseek')
  })

  it('roles — GET/PUT /chat/roles and /projects/{slug}/llm-roles', async () => {
    const roles = { pilot: { provider: 'deepseek', alias: 'deep' } }
    await providersApi.roles()
    expect(get).toHaveBeenCalledWith('/chat/roles')
    await providersApi.setRoles(roles)
    expect(put).toHaveBeenCalledWith('/chat/roles', roles)
    await providersApi.projectRoles('po')
    expect(get).toHaveBeenCalledWith('/projects/po/llm-roles')
    await providersApi.setProjectRoles('po', roles)
    expect(put).toHaveBeenCalledWith('/projects/po/llm-roles', roles)
  })

  it('aliases and policy — GET/PUT /chat/model-aliases and /chat/model-policy', async () => {
    const aliases = [{ alias: 'fast', provider: 'deepseek', model: 'deepseek-chat' }]
    const policy = { mode: 'shadow' as const, rules: { chat: 'fast' }, fallback: ['fast'], caps: { per_run_tokens: 1000 } }
    await providersApi.aliases()
    expect(get).toHaveBeenCalledWith('/chat/model-aliases')
    await providersApi.setAliases(aliases)
    expect(put).toHaveBeenCalledWith('/chat/model-aliases', aliases)
    await providersApi.policy()
    expect(get).toHaveBeenCalledWith('/chat/model-policy')
    await providersApi.setPolicy(policy)
    expect(put).toHaveBeenCalledWith('/chat/model-policy', policy)
  })
})
