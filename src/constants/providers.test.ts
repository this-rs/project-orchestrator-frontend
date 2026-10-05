/**
 * Provider-facing strings of the composer.
 *
 * Run with: npx vitest run src/constants/providers.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { ProviderInstance } from '@/types/provider'
import {
  PROVIDER_NOT_ALLOWED_TEXT,
  PROVIDER_SIGN_IN_REQUIRED_TEXT,
  PROVIDER_UNAVAILABLE_TEXT,
  aliasesForInstance,
  healthDotColor,
  providerModelLabel,
  providerUnavailableReason,
  routedByLabel,
} from './providers'
import { catalogDefaultModel, type ModelDefinition } from './models'

const instance = (patch: Partial<ProviderInstance> = {}): ProviderInstance => ({
  id: 'local-llama',
  kind: 'openai_compatible',
  label: 'Local llama-server',
  health: { status: 'healthy' },
  models: [],
  ...patch,
})

describe('routedByLabel', () => {
  it.each([
    ['project_rule', 'project default'],
    ['global_rule', 'global default'],
    ['configured_default', 'server default'],
    ['claude_code_fallback', 'fallback'],
  ])('%s → %s', (routedBy, label) => {
    expect(routedByLabel(routedBy)).toBe(label)
  })

  it('a rule this app does not know is still a default, never a raw identifier', () => {
    expect(routedByLabel('some_future_rule')).toBe('default')
    expect(routedByLabel(undefined)).toBe('default')
  })
})

describe('providerUnavailableReason', () => {
  it('is null for a healthy, degraded or unchecked instance', () => {
    expect(providerUnavailableReason(instance())).toBeNull()
    expect(providerUnavailableReason(instance({ health: { status: 'degraded' } }))).toBeNull()
    expect(providerUnavailableReason(instance({ health: { status: 'unknown' } }))).toBeNull()
    expect(providerUnavailableReason(instance({ allowed_for_project: null }))).toBeNull()
  })

  it('says sign-in is required', () => {
    expect(providerUnavailableReason(instance({ health: { status: 'auth_required' } }))).toBe(PROVIDER_SIGN_IN_REQUIRED_TEXT)
  })

  it('gives the last error of an unhealthy instance, or says it is unavailable', () => {
    const error = { code: 'endpoint_unreachable' as const, message: 'Connection refused (127.0.0.1:8080)' }
    expect(providerUnavailableReason(instance({ health: { status: 'unhealthy', error } }))).toBe(error.message)
    expect(providerUnavailableReason(instance({ health: { status: 'unhealthy' } }))).toBe(PROVIDER_UNAVAILABLE_TEXT)
  })

  it('puts the project consent before health', () => {
    expect(
      providerUnavailableReason(instance({ allowed_for_project: false, health: { status: 'auth_required' } })),
    ).toBe(PROVIDER_NOT_ALLOWED_TEXT)
  })
})

describe('aliasesForInstance', () => {
  it('merges the alias table (this instance only) with the aliases its models declare, logical names first', () => {
    const target = instance({
      models: [
        { id: 'qwen2.5-coder-32b', aliases: ['deep', 'coder'] },
        { id: 'qwen2.5-coder-7b', aliases: ['fast'] },
      ],
    })
    const table = [
      { alias: 'default', provider: 'local-llama', model: 'qwen2.5-coder-32b' },
      { alias: 'utility', provider: 'claude-code', model: 'claude-haiku-4-5' },
      // The table wins over what a model declares.
      { alias: 'fast', provider: 'local-llama', model: 'qwen2.5-coder-1b' },
    ]
    expect(aliasesForInstance(target, table)).toEqual([
      { alias: 'fast', model: 'qwen2.5-coder-1b' },
      { alias: 'default', model: 'qwen2.5-coder-32b' },
      { alias: 'deep', model: 'qwen2.5-coder-32b' },
      { alias: 'coder', model: 'qwen2.5-coder-32b' },
    ])
  })

  it('is empty without an instance', () => {
    expect(aliasesForInstance(null, [{ alias: 'fast', provider: 'x', model: 'y' }])).toEqual([])
  })
})

describe('providerModelLabel', () => {
  it('uses the label the provider gives, else the id untouched', () => {
    const target = instance({ models: [{ id: 'deepseek-chat', label: 'DeepSeek V3' }, { id: 'qwen2.5-coder-32b' }] })
    expect(providerModelLabel(target, 'deepseek-chat')).toBe('DeepSeek V3')
    expect(providerModelLabel(target, 'qwen2.5-coder-32b')).toBe('qwen2.5-coder-32b')
    expect(providerModelLabel(null, 'unknown-model')).toBe('unknown-model')
  })
})

describe('healthDotColor', () => {
  it('falls back to the "not checked" color for a status this app does not know', () => {
    expect(healthDotColor('exploded')).toBe(healthDotColor('unknown'))
    expect(healthDotColor(undefined)).toBe(healthDotColor('unknown'))
  })
})

describe('catalogDefaultModel', () => {
  const model = (id: string, tier: 'current' | 'legacy'): ModelDefinition => ({
    id, family: 'sonnet', version: '1', tier, shortLabel: id, fullLabel: id, description: '',
  })

  it('is the first model of the current lineup, in the catalog order', () => {
    expect(catalogDefaultModel([model('a', 'legacy'), model('b', 'current'), model('c', 'current')])?.id).toBe('b')
  })

  it('is the first model when none is current, and undefined for an empty catalog', () => {
    expect(catalogDefaultModel([model('a', 'legacy'), model('b', 'legacy')])?.id).toBe('a')
    expect(catalogDefaultModel([])).toBeUndefined()
  })
})
