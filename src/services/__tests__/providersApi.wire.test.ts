/**
 * `GET /api/chat/providers` as the backend fixed it (`provider-additions.json`)
 * → the shape the interface reads. Also the typed error body (`action`, 403
 * with a prefixed code).
 *
 * Run with: npx vitest run src/services/__tests__/providersApi.wire.test.ts
 */
import { describe, it, expect } from 'vitest'
import { normalizeProviderHealth, normalizeProvidersResponse } from '../providers'
import { readProviderError } from '@/types/provider'

const WIRE = {
  default_provider: 'local-llama',
  providers: [
    {
      id: 'claude-code',
      kind: 'claude_code',
      label: 'Claude Code',
      builtin: true,
      is_default: false,
      allowed_for_project: null,
      endpoint_origin: null,
      credential: 'none',
      health: { state: 'auth_required', code: 'auth_required', action: 'claude login', checked_at: '2026-10-05T10:00:00Z' },
      models: [{ id: 'claude-sonnet-5', capabilities: { images: false } }],
    },
    {
      id: 'local-llama',
      kind: 'openai_compatible',
      label: 'Local llama-server',
      builtin: false,
      is_default: true,
      allowed_for_project: true,
      endpoint_origin: 'http://localhost:8080',
      credential: 'env:LLAMA_KEY',
      health: { state: 'ok' },
      models: [
        { id: 'qwen2.5-coder-32b', alias: 'default', capabilities: { tools: true } },
        { id: 'qwen2.5-coder-7b', alias: 'fast', capabilities: { tools: true } },
      ],
    },
    {
      id: 'deepseek',
      kind: 'openai_compatible',
      label: 'DeepSeek',
      builtin: false,
      is_default: false,
      allowed_for_project: false,
      endpoint_origin: 'https://api.deepseek.com',
      credential: 'vault:deepseek-key',
      health: { state: 'unreachable', code: 'endpoint_unreachable' },
      models: [],
    },
  ],
}

describe('normalizeProvidersResponse — backend wire', () => {
  const res = normalizeProvidersResponse(WIRE)

  it('keeps every instance with id, kind, label, builtin flag and project permission', () => {
    expect(res.providers.map((p) => [p.id, p.kind, p.builtin, p.allowed_for_project])).toEqual([
      ['claude-code', 'claude_code', true, null],
      ['local-llama', 'openai_compatible', false, true],
      ['deepseek', 'openai_compatible', false, false],
    ])
  })

  it('maps the wire health states and keeps the command to run', () => {
    const [claude, llama, deepseek] = res.providers
    expect(claude.health.status).toBe('auth_required')
    expect(claude.health.login_hint).toBe('claude login')
    expect(claude.health.error?.code).toBe('auth_required')
    expect(claude.health.checked_at).toBe('2026-10-05T10:00:00Z')
    expect(llama.health.status).toBe('healthy')
    expect(llama.health.error).toBeNull()
    expect(deepseek.health.status).toBe('unhealthy')
    expect(deepseek.health.error?.code).toBe('endpoint_unreachable')
  })

  it('reads the endpoint origin and the credential REFERENCE (never a value)', () => {
    expect(res.providers[1].origin).toBe('http://localhost:8080')
    expect(res.providers[1].credential_ref).toBe('env:LLAMA_KEY')
    expect(res.providers[2].credential_ref).toBe('vault:deepseek-key')
    expect(JSON.stringify(res)).not.toMatch(/api_key|secret_value/)
  })

  it('turns per-model aliases into the flat alias list and keeps them on the model', () => {
    expect(res.aliases).toEqual([
      { alias: 'default', provider: 'local-llama', model: 'qwen2.5-coder-32b' },
      { alias: 'fast', provider: 'local-llama', model: 'qwen2.5-coder-7b' },
    ])
    expect(res.providers[1].models[1].aliases).toEqual(['fast'])
  })

  it('resolves the default from default_provider', () => {
    expect(res.default).toEqual({ provider: 'local-llama', model: null, routed_by: 'default' })
    expect(res.providers[1].is_default).toBe(true)
  })

  it('answers "no usable provider" when default_provider is null', () => {
    expect(normalizeProvidersResponse({ default_provider: null, providers: [] }).default).toBeNull()
  })

  it('still reads the shape the interface was written against', () => {
    const internal = {
      providers: [{ id: 'x', kind: 'codex', label: 'X', health: { status: 'degraded' }, models: [{ id: 'm', aliases: ['deep'] }], credential_ref: 'none' }],
      default: { provider: 'x', routed_by: 'project_rule' },
    }
    const out = normalizeProvidersResponse(internal)
    expect(out.default?.routed_by).toBe('project_rule')
    expect(out.providers[0].health.status).toBe('degraded')
    expect(out.aliases).toEqual([{ alias: 'deep', provider: 'x', model: 'm' }])
  })

  it('returns a body without `providers` untouched, for the caller to reject', () => {
    expect(normalizeProvidersResponse({ hello: 1 })).toEqual({ hello: 1 })
  })

  it('reads a bare health object', () => {
    expect(normalizeProviderHealth({ state: 'cli_not_found' }, 'claude-code')).toMatchObject({
      status: 'unhealthy',
      error: { code: 'cli_not_found', provider_id: 'claude-code' },
    })
    expect(normalizeProviderHealth(undefined)).toEqual({ status: 'unknown' })
  })
})

describe('readProviderError — backend error body', () => {
  it('reads `action` as the command to run and the gateway codes', () => {
    const err = readProviderError({ error: 'Sign in to Claude first', code: 'auth_required', provider_id: 'claude-code', action: 'claude login', retryable: false }, 424)
    expect(err).toMatchObject({ code: 'auth_required', login_hint: 'claude login', provider_id: 'claude-code', retryable: false, status: 424 })
    expect(readProviderError({ error: 'x', code: 'provider_unavailable' })?.code).toBe('provider_unavailable')
    expect(readProviderError({ error: 'x', code: 'provider_unknown' })?.code).toBe('provider_unknown')
  })

  it('reads a 403 whose body is `{"error": "<code>: <message>"}`', () => {
    const err = readProviderError({ error: 'endpoint_not_allowed: project demo may not send content to https://api.deepseek.com' }, 403)
    expect(err?.code).toBe('endpoint_not_allowed')
    expect(err?.message).toBe('project demo may not send content to https://api.deepseek.com')
  })

  it.each([
    ['security_gate_closed: third-party providers need authentication enabled (bound session tokens)', 'security_gate_closed'],
    ['origin_mismatch: the instance no longer points at the origin you were shown', 'origin_mismatch'],
    ['endpoint_private_address: host resolves to a private address', 'endpoint_private_address'],
    ['envelope_depth_exceeded: too deep', 'envelope_depth_exceeded'],
    ['tool_not_in_profile: no', 'tool_not_in_profile'],
    ['engine_unavailable: the agent engine is switched off', 'engine_unavailable'],
    ['endpoint_unresolvable: host not found', 'endpoint_unresolvable'],
    ['endpoint_redirects_not_allowed: redirect', 'endpoint_redirects_not_allowed'],
  ])('reads the prefixed body "%s"', (body, code) => {
    expect(readProviderError({ error: body })?.code).toBe(code)
  })

  it('does not take an unrelated prefixed message for a code', () => {
    expect(readProviderError({ error: 'note: nothing to see' })).toBeNull()
    expect(readProviderError({ error: 'envelope_made_up: too deep' })).toBeNull()
  })
})
