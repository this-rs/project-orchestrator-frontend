// ============================================================================
// PROVIDER PRESETS — what the "add instance" form pre-fills
// ============================================================================
//
// Every preset is the OpenAI-compatible kind; it only saves typing a URL and
// picks the cost basis that is usually true (a hosted endpoint is priced, a
// local one is free). The user can change both.

import type { CostBasis, ProviderPreset } from '@/types/provider'

export type CredentialKind = 'vault' | 'env' | 'none'

export interface ProviderPresetInfo {
  preset: ProviderPreset | 'custom'
  label: string
  base_url: string
  /** Which kind of credential reference is suggested. */
  credential_kind: CredentialKind
  cost_source: CostBasis
}

export const PROVIDER_PRESETS: readonly ProviderPresetInfo[] = [
  { preset: 'deepseek', label: 'DeepSeek', base_url: 'https://api.deepseek.com', credential_kind: 'vault', cost_source: 'priced' },
  { preset: 'nim', label: 'NVIDIA NIM', base_url: 'https://integrate.api.nvidia.com/v1', credential_kind: 'vault', cost_source: 'priced' },
  { preset: 'ollama', label: 'Ollama', base_url: 'http://localhost:11434/v1', credential_kind: 'none', cost_source: 'free' },
  { preset: 'vllm', label: 'vLLM', base_url: 'http://localhost:8000/v1', credential_kind: 'none', cost_source: 'free' },
  { preset: 'llama_server', label: 'llama-server', base_url: 'http://localhost:8080/v1', credential_kind: 'none', cost_source: 'free' },
  { preset: 'custom', label: 'Custom OpenAI-compatible', base_url: '', credential_kind: 'vault', cost_source: 'unknown' },
]

export function presetInfo(preset: string | null | undefined): ProviderPresetInfo {
  return PROVIDER_PRESETS.find((p) => p.preset === preset) ?? PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1]
}
