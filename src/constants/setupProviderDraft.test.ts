import { describe, expect, it } from 'vitest'
import { PROVIDER_PRESETS } from '@/constants/providerPresets'
import {
  CODEX_PENDING,
  SETUP_OTHER_PRESETS,
  formFromPreset,
  pendingFromForm,
  pendingToDraft,
  validateOtherProviderForm,
} from './setupProviderDraft'

const deepseek = PROVIDER_PRESETS.find((p) => p.key === 'deepseek')!
const ollama = PROVIDER_PRESETS.find((p) => p.key === 'ollama')!

describe('setup provider choice', () => {
  it('offers only OpenAI-compatible presets to the wizard', () => {
    expect(SETUP_OTHER_PRESETS.every((p) => p.kind === 'openai_compatible')).toBe(true)
    expect(SETUP_OTHER_PRESETS.map((p) => p.key)).toContain('deepseek')
  })

  it('Codex is a process: no URL, no credential, its own id', () => {
    const draft = pendingToDraft(CODEX_PENDING)
    expect(draft).toMatchObject({ id: 'codex', kind: 'codex', base_url: '', credential_ref: 'none' })
    expect(draft.default_model).toBeNull()
  })

  it('a valid form becomes a pending provider with a vault reference, never a value', () => {
    const form = { ...formFromPreset(deepseek), vaultName: 'deepseek-key' }
    const pending = pendingFromForm(form)
    expect(pending).toMatchObject({
      id: 'deepseek',
      kind: 'openai_compatible',
      preset: 'deepseek',
      credential_ref: 'vault:deepseek-key',
      base_url: 'https://api.deepseek.com',
    })
    expect(JSON.stringify(pending)).not.toMatch(/sk-/)
  })

  it('a preset without a key stores no credential', () => {
    const pending = pendingFromForm(formFromPreset(ollama))
    expect(pending?.credential_ref).toBe('none')
  })

  it('refuses an id that the backend would refuse, and a reserved id', () => {
    expect(validateOtherProviderForm({ ...formFromPreset(deepseek), id: 'Bad Id' }, deepseek)).not.toBeNull()
    expect(validateOtherProviderForm({ ...formFromPreset(deepseek), id: 'claude-code' }, deepseek)).not.toBeNull()
    expect(pendingFromForm({ ...formFromPreset(deepseek), id: 'Bad Id' })).toBeNull()
  })

  it('refuses an address that is not http(s)', () => {
    expect(validateOtherProviderForm({ ...formFromPreset(deepseek), baseUrl: 'ftp://x' }, deepseek)).not.toBeNull()
    expect(validateOtherProviderForm({ ...formFromPreset(deepseek), baseUrl: '' }, deepseek)).not.toBeNull()
  })

  it('refuses a vault name with a forbidden character', () => {
    expect(validateOtherProviderForm({ ...formFromPreset(deepseek), vaultName: 'a b' }, deepseek)).not.toBeNull()
  })
})
