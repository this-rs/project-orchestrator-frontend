import { activeTranslator } from '@/i18n'
import type { PendingSetupProvider } from '@/atoms/setupProvider'
import { PROVIDER_PRESETS, type ProviderPresetInfo } from '@/constants/providerPresets'
import type { ProviderDraft } from '@/types/providerSettings'

/** Codex: the `codex` program on the server's PATH, no URL, no credential. */
export const CODEX_PENDING: PendingSetupProvider = {
  id: 'codex',
  kind: 'codex',
  preset: null,
  label: 'Codex',
  base_url: '',
  default_model: '',
  cost_source: 'subscription',
  credential_ref: 'none',
}

/** The presets an OpenAI-compatible endpoint can be set up from in the wizard. */
export const SETUP_OTHER_PRESETS: readonly ProviderPresetInfo[] = PROVIDER_PRESETS.filter(
  (p) => p.kind === 'openai_compatible',
)

const INSTANCE_ID = /^[a-z0-9][a-z0-9-]*$/
const SECRET_NAME = /^[A-Za-z0-9_.-]+$/
const HTTP_URL = /^https?:\/\/\S+$/

export interface OtherProviderForm {
  presetKey: string
  id: string
  baseUrl: string
  model: string
  /** Vault secret name holding the key (never the key itself). Empty = no key. */
  vaultName: string
}

/** The form values a preset starts from. */
export function formFromPreset(preset: ProviderPresetInfo): OtherProviderForm {
  return {
    presetKey: preset.key,
    id: preset.id,
    baseUrl: preset.base_url,
    model: preset.default_model,
    vaultName: '',
  }
}

/** A message in English, or null when the form can be saved. Mirrors the backend's id and URL rules. */
export function validateOtherProviderForm(form: OtherProviderForm, preset: ProviderPresetInfo): string | null {
  if (!INSTANCE_ID.test(form.id) || form.id.length > 48) {
    return activeTranslator().t('siteSetup.wizardExtra.idRule')
  }
  if (form.id === 'claude-code') return activeTranslator().t('siteSetup.wizardExtra.idReserved')
  if (!HTTP_URL.test(form.baseUrl.trim())) return 'The address must start with http:// or https://.'
  if (preset.credential_kind === 'vault' && form.vaultName.trim() !== '') {
    if (!SECRET_NAME.test(form.vaultName.trim()) || form.vaultName.trim().length > 64) {
      return activeTranslator().t('siteSetup.wizardExtra.vaultRule')
    }
  }
  return null
}

/** The pending provider for a valid form, or null when the form is not savable. */
export function pendingFromForm(form: OtherProviderForm): PendingSetupProvider | null {
  const preset = PROVIDER_PRESETS.find((p) => p.key === form.presetKey)
  if (!preset || validateOtherProviderForm(form, preset) !== null) return null
  const vault = form.vaultName.trim()
  return {
    id: form.id,
    kind: 'openai_compatible',
    preset: preset.preset === null ? null : String(preset.preset),
    label: preset.label,
    base_url: form.baseUrl.trim(),
    default_model: form.model.trim(),
    cost_source: preset.cost_source,
    credential_ref: preset.credential_kind === 'none' || vault === '' ? 'none' : `vault:${vault}`,
  }
}

/** The body the API receives on `POST /api/chat/providers`. No secret is in it. */
export function pendingToDraft(p: PendingSetupProvider): ProviderDraft {
  return {
    id: p.id,
    kind: p.kind,
    preset: p.preset as ProviderDraft['preset'],
    label: p.label,
    base_url: p.base_url,
    default_model: p.default_model || null,
    cost_source: p.cost_source,
    credential_ref: p.credential_ref as ProviderDraft['credential_ref'],
  }
}
