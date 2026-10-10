// ============================================================================
// PROVIDER PRESETS — what step 1 of the "add a provider" wizard pre-fills
// ============================================================================
//
// Only kinds and presets the backend really accepts (`record_from_draft` in
// `src/chat/provider/settings.rs`, docs/guides/providers.md):
// - `openai_compatible` with the presets deepseek, nim, ollama, vllm,
//   llama_server (informational) or none (custom);
// - `codex`: the `codex` program on the server's PATH, no URL;
// - `acp`: an agent DECLARED on the server in `CHAT_PROVIDER_ACP_COMMANDS`,
//   named by `preset` (here `opencode`), no URL and no credential.
// - `claude_code_remote`: the Claude Code CLI on ANOTHER machine, over SSH; the key
//   is a vault reference, the host key is pinned by a human.
// Every value is a suggestion the user can change.

import type { MessageKey } from '@/i18n/catalog'
import type { CostBasis, ProviderPreset } from '@/types/provider'

export type CredentialKind = 'vault' | 'env' | 'none'
export type PresetKind = 'openai_compatible' | 'codex' | 'acp' | 'claude_code_remote'

export interface ProviderPresetInfo {
  /** Unique key of the choice in the wizard. */
  key: string
  kind: PresetKind
  /** What is sent as `preset` (null: none). For `acp`, the declared agent's name. */
  preset: ProviderPreset | 'opencode' | null
  /** Product name; a preset without one in the catalog (`labelKey`) shows it as is. */
  label: string
  /** Catalog key of the label when the name is words, not a product name. */
  labelKey?: MessageKey
  /** Catalog key of the one plain line under the choice. */
  description: MessageKey
  /** Suggested instance id (backend rule: lowercase, digits, dashes). */
  id: string
  base_url: string
  default_model: string
  /** Placeholder of the model field when no default is proposed. */
  model_hint?: string
  /** Which kind of credential reference is suggested. */
  credential_kind: CredentialKind
  cost_source: CostBasis
}

export const PROVIDER_PRESETS: readonly ProviderPresetInfo[] = [
  {
    key: 'deepseek',
    kind: 'openai_compatible',
    preset: 'deepseek',
    label: 'DeepSeek',
    description: 'providerWizard.presets.deepseek',
    id: 'deepseek',
    base_url: 'https://api.deepseek.com',
    default_model: 'deepseek-chat',
    credential_kind: 'vault',
    cost_source: 'priced',
  },
  {
    key: 'nim',
    kind: 'openai_compatible',
    preset: 'nim',
    label: 'NVIDIA NIM',
    description: 'providerWizard.presets.nim',
    id: 'nim',
    base_url: 'https://integrate.api.nvidia.com/v1',
    default_model: '',
    model_hint: 'meta/llama-3.3-70b-instruct',
    credential_kind: 'vault',
    cost_source: 'priced',
  },
  {
    key: 'ollama',
    kind: 'openai_compatible',
    preset: 'ollama',
    label: 'Ollama (local)',
    description: 'providerWizard.presets.ollama',
    id: 'ollama',
    base_url: 'http://localhost:11434/v1',
    default_model: '',
    model_hint: 'qwen3',
    credential_kind: 'none',
    cost_source: 'free',
  },
  {
    key: 'vllm',
    kind: 'openai_compatible',
    preset: 'vllm',
    label: 'vLLM (local)',
    description: 'providerWizard.presets.vllm',
    id: 'vllm',
    base_url: 'http://localhost:8000/v1',
    default_model: '',
    credential_kind: 'none',
    cost_source: 'free',
  },
  {
    key: 'llama_server',
    kind: 'openai_compatible',
    preset: 'llama_server',
    label: 'llama-server (local)',
    description: 'providerWizard.presets.llama_server',
    id: 'llama-server',
    base_url: 'http://localhost:8080/v1',
    default_model: '',
    credential_kind: 'none',
    cost_source: 'free',
  },
  {
    key: 'custom',
    kind: 'openai_compatible',
    preset: null,
    label: 'OpenAI-compatible (generic)',
    labelKey: 'providerWizard.presets.labelCustom',
    description: 'providerWizard.presets.custom',
    id: '',
    base_url: '',
    default_model: '',
    credential_kind: 'vault',
    cost_source: 'unknown',
  },
  {
    key: 'codex',
    kind: 'codex',
    preset: null,
    label: 'Codex',
    description: 'providerWizard.presets.codex',
    id: 'codex',
    base_url: '',
    default_model: '',
    credential_kind: 'none',
    cost_source: 'subscription',
  },
  {
    key: 'opencode',
    kind: 'acp',
    preset: 'opencode',
    label: 'opencode (ACP)',
    description: 'providerWizard.presets.opencode',
    id: 'opencode',
    base_url: '',
    default_model: '',
    credential_kind: 'none',
    cost_source: 'unknown',
  },
  {
    key: 'claude_code_remote',
    kind: 'claude_code_remote',
    preset: null,
    label: 'Claude Code remote (SSH)',
    labelKey: 'providerWizard.presets.labelRemote',
    description: 'providerWizard.presets.claude_code_remote',
    id: '',
    base_url: '',
    default_model: '',
    credential_kind: 'vault',
    cost_source: 'subscription',
  },
]

export function presetByKey(key: string | null | undefined): ProviderPresetInfo {
  return PROVIDER_PRESETS.find((p) => p.key === key) ?? PROVIDER_PRESETS.find((p) => p.key === 'custom')!
}

/** The name of a preset in the viewer's language (a product name stays as it is). */
export function presetLabel(t: (key: MessageKey) => string, p: ProviderPresetInfo): string {
  return p.labelKey ? t(p.labelKey) : p.label
}
