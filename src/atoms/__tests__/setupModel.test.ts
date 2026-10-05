/**
 * The chat model the setup wizard writes: read from the catalog, never empty.
 *
 * Run with: npx vitest run src/atoms/__tests__/setupModel.test.ts
 */
import { describe, it, expect } from 'vitest'
import { SETUP_FALLBACK_CHAT_MODEL, withSetupModelFallback } from '@/atoms/setup'
import { catalogDefaultModel, type ModelDefinition } from '@/constants/models'

const model = (id: string, family: ModelDefinition['family'], tier: ModelDefinition['tier'] = 'current'): ModelDefinition => ({
  id,
  family,
  tier,
  version: '',
  shortLabel: id,
  fullLabel: id,
  description: '',
})

describe('catalogDefaultModel', () => {
  it('prefers the current Sonnet over the first (most capable) model of the catalog', () => {
    const catalog = [model('claude-opus-5', 'opus'), model('claude-sonnet-4', 'sonnet', 'legacy'), model('claude-sonnet-5', 'sonnet')]
    expect(catalogDefaultModel(catalog)?.id).toBe('claude-sonnet-5')
  })
  it('falls back to the first current model, then to the first model, then to nothing', () => {
    expect(catalogDefaultModel([model('old', 'haiku', 'legacy'), model('claude-opus-5', 'opus')])?.id).toBe('claude-opus-5')
    expect(catalogDefaultModel([model('old', 'haiku', 'legacy')])?.id).toBe('old')
    expect(catalogDefaultModel([])).toBeUndefined()
  })
})

describe('withSetupModelFallback', () => {
  it('never hands an empty chat model to generate_config', () => {
    expect(withSetupModelFallback({ chatModel: '', other: 1 })).toEqual({ chatModel: SETUP_FALLBACK_CHAT_MODEL, other: 1 })
  })
  it('leaves a chosen model alone', () => {
    const config = { chatModel: 'claude-opus-5' }
    expect(withSetupModelFallback(config)).toBe(config)
  })
})
