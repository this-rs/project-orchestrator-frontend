// ============================================================================
// PROVIDER WIZARD — French strings, validation and status of the Providers page
// ============================================================================
//
// The "Add a provider" wizard and the provider cards speak plain French (the
// rest of the settings page is still in English). Every typed error code the
// backend can answer on these routes gets a French sentence here; an unknown
// code falls back to the English explanation of `providerErrors.ts`.
//
// Nothing in this module ever receives a secret value.

import { ApiError, apiErrorMessage } from '@/services/api'
import { toProviderError } from '@/services/providers'
import { providerErrorExplanation } from './providerErrors'
import type { CostBasis, ProviderErrorInfo, ProviderHealth, ProviderInstance } from '@/types/provider'

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const COST_LABELS_FR: Readonly<Record<CostBasis, string>> = {
  reported: 'Indiqué par le provider',
  priced: 'Tarifé (estimation)',
  free: 'Gratuit (local)',
  subscription: 'Abonnement',
  unknown: 'Inconnu',
}

export const KIND_LABELS_FR: Readonly<Record<string, string>> = {
  claude_code: 'Claude Code',
  openai_compatible: 'OpenAI-compatible',
  codex: 'Codex',
  acp: 'Agent ACP',
}

export function kindLabelFr(kind: string | null | undefined): string {
  return (kind && KIND_LABELS_FR[kind]) || kind || 'Inconnu'
}

/** `codex` and `acp` instances are a program on the server: no URL. */
export function isProcessKind(kind: string | null | undefined): boolean {
  return kind === 'codex' || kind === 'acp'
}

export const WIZARD_STEPS = [
  { id: 'preset', title: 'Modèle' },
  { id: 'key', title: 'Clé' },
  { id: 'connection', title: 'Connexion' },
  { id: 'project', title: 'Projet' },
  { id: 'summary', title: 'Récapitulatif' },
] as const
export type WizardStepId = (typeof WIZARD_STEPS)[number]['id']

/** Durations of the grant of a key to an instance. */
export const GRANT_CHOICES_FR: { value: string; label: string }[] = [
  { value: '60', label: '1 heure' },
  { value: '1440', label: '1 jour' },
  { value: '10080', label: '7 jours' },
  { value: '43200', label: '30 jours' },
]

export type TaskKey = 'secret' | 'instance' | 'grant' | 'test'
export type TaskState = 'todo' | 'running' | 'done' | 'error'

export const TASK_LABELS: Readonly<Record<TaskKey, string>> = {
  secret: 'Enregistrer la clé dans le coffre',
  instance: 'Créer l’instance',
  grant: 'Accorder la clé à l’instance',
  test: 'Tester la connexion',
}

// ---------------------------------------------------------------------------
// Validation (mirrors the backend: `valid_id` of settings.rs, `validate_name` of vault/store.rs)
// ---------------------------------------------------------------------------

/** Instance id: lowercase letters, digits and dashes, starts with a letter or digit, ≤ 48. */
const INSTANCE_ID = /^[a-z0-9][a-z0-9-]*$/
/** Vault secret name: letters, digits, `_`, `-`, `.`, ≤ 64. */
const SECRET_NAME = /^[A-Za-z0-9_.-]+$/
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export function validateInstanceId(raw: string, taken: readonly string[]): string | null {
  const id = raw.trim()
  if (!id) return 'L’identifiant est obligatoire.'
  if (id.length > 48 || !INSTANCE_ID.test(id)) return 'Lettres minuscules, chiffres et « - » uniquement (48 caractères au plus).'
  if (id === 'claude-code') return '« claude-code » est réservé au provider intégré.'
  if (taken.includes(id)) return 'Un provider porte déjà cet identifiant.'
  return null
}

export function validateSecretName(raw: string): string | null {
  const name = raw.trim()
  if (!name) return 'Donnez un nom à la clé.'
  if (name.length > 64 || !SECRET_NAME.test(name)) return 'Lettres, chiffres, « _ », « - » et « . » uniquement (64 caractères au plus).'
  return null
}

export function validateEnvName(raw: string): string | null {
  const name = raw.trim()
  if (!name) return 'Indiquez le nom de la variable.'
  if (!ENV_NAME.test(name)) return 'Un nom de variable : lettres, chiffres et « _ », sans commencer par un chiffre.'
  return null
}

/** French twin of `validateBaseUrl`: https everywhere, plain http on a loopback host only. */
export function validateBaseUrlFr(raw: string): string | null {
  const value = raw.trim()
  if (!value) return 'L’URL de base est obligatoire.'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'Ce n’est pas une URL valide (exemple : https://api.example.com/v1).'
  }
  if (url.protocol === 'https:') return null
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (url.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1' || host === '::1')) return null
  return 'Utilisez https. Le http simple n’est accepté que pour localhost, 127.0.0.1 et ::1.'
}

/** Suggested vault name for the key of an instance: its id. */
export function suggestedSecretName(instanceId: string): string {
  return instanceId.trim() || 'cle-provider'
}

// ---------------------------------------------------------------------------
// Errors in plain French
// ---------------------------------------------------------------------------

const TOOLS_NOT_CALLED_FR_TEXT =
  'Ce modèle n’a pas appelé l’outil de test (certains modèles de raisonnement ne le font pas) : essayez un autre modèle listé.'
/** The probe ran and the model did not call the test tool: about THIS model, not the endpoint. */
export const TOOLS_NOT_CALLED_FR = TOOLS_NOT_CALLED_FR_TEXT

const ERRORS_FR: Partial<Record<string, string>> = {
  credentials_locked: 'Le coffre est verrouillé : la clé ne peut pas être lue. Déverrouillez-le, puis testez à nouveau.',
  auth_required: 'Ce provider demande une connexion ou une clé accordée à l’instance. Lancez la commande indiquée, ou accordez la clé à l’instance.',
  unauthorized: 'Le provider a refusé la clé. Vérifiez la clé enregistrée dans le coffre.',
  endpoint_unreachable: 'Le point d’accès ne répond pas. Vérifiez l’URL et que le service tourne.',
  model_no_tools: TOOLS_NOT_CALLED_FR_TEXT,
  context_too_small: 'La fenêtre de contexte de ce modèle est trop petite pour les outils. Choisissez un modèle plus grand.',
  cli_not_found: 'Le programme de ce provider n’est pas installé sur le serveur (ou pas dans son PATH).',
  rate_limited: 'Le provider limite le nombre de requêtes. Réessayez dans un moment.',
  overloaded: 'Le provider est surchargé. Réessayez dans un moment.',
  timeout: 'Le provider n’a pas répondu à temps.',
  process_exited: 'Le programme du provider s’est arrêté de façon inattendue.',
  protocol: 'Le provider a renvoyé une réponse incompréhensible.',
  unsupported: 'Ce provider ne prend pas en charge ce qui est demandé.',
  invalid_request: 'La requête a été refusée comme invalide.',
  provider_unknown: 'Ce provider n’existe pas (ou plus) sur le serveur.',
  provider_unavailable: 'Ce provider n’est pas disponible pour l’instant.',
  security_gate_closed:
    'Les providers tiers exigent que l’authentification soit activée sur ce serveur. Activez-la, puis recommencez. Claude Code n’est pas concerné.',
  origin_mismatch: 'L’instance ne pointe plus vers l’origine affichée : l’autorisation n’a pas été enregistrée. Rechargez la page et vérifiez l’origine.',
  endpoint_not_allowed: 'Ce projet n’a pas autorisé ce point d’accès.',
  endpoint_invalid_url: 'L’URL de base n’est pas valide. Saisissez-la en entier, par exemple https://api.example.com/v1.',
  endpoint_scheme_not_allowed: 'Seul https est accepté (http uniquement pour localhost).',
  endpoint_http_outside_loopback: 'Le http simple n’est accepté que pour localhost, 127.0.0.1 et ::1. Utilisez https.',
  endpoint_credentials_in_url: 'L’URL contient un identifiant ou un mot de passe. Retirez-le : la clé passe par le coffre, jamais par l’URL.',
  endpoint_host_missing: 'L’URL de base n’a pas d’hôte.',
  endpoint_private_address: 'L’hôte pointe vers une adresse privée ou interne, que le serveur refuse d’appeler.',
  endpoint_unresolvable: 'Le serveur ne trouve pas ce nom d’hôte. Vérifiez l’orthographe de l’URL.',
  endpoint_redirects_not_allowed: 'Le point d’accès répond par une redirection, que le serveur ne suit pas. Utilisez l’URL finale.',
  credential_test_requires_saved_instance:
    'Un test avec une clé n’est fait que sur une instance déjà enregistrée, avec la même URL et la même référence de clé. Enregistrez, puis testez.',
  tool_not_in_profile: 'Cette session n’a pas le droit d’appeler cet outil.',
}

export const FORBIDDEN_FR = 'Seule une personne connectée peut faire ce changement (un agent ne le peut pas).'

/** French sentence for a typed provider error. */
export function providerErrorFr(error: ProviderErrorInfo): string {
  return ERRORS_FR[error.code] ?? providerErrorExplanation(error)
}

/** French sentence for a code read out of a test verdict (`health.code`). */
export function verdictCodeFr(code: string | null | undefined): string | null {
  if (!code) return null
  return ERRORS_FR[code] ?? null
}

/**
 * What to tell the user about a failed call of the wizard or the cards.
 * A typed code is translated; a 403 is the human-token rule; anything else is
 * the server's own sentence (which never carries a secret, per provider-errors.md).
 */
export function wizardErrorMessage(err: unknown): string {
  const typed = toProviderError(err)
  if (typed) return providerErrorFr(typed)
  if (err instanceof ApiError && err.status === 403) {
    return /passphrase|proof/i.test(err.message)
      ? 'Le coffre demande la phrase secrète : déverrouillez-le depuis cet onglet.'
      : FORBIDDEN_FR
  }
  if (err instanceof ApiError && err.status === 409 && /locked/i.test(err.message)) return 'Le coffre est verrouillé.'
  return apiErrorMessage(err, 'La requête a échoué')
}

// ---------------------------------------------------------------------------
// Card status: one glance
// ---------------------------------------------------------------------------

export type InstanceStatusKey = 'connected' | 'key_missing' | 'not_allowed' | 'unreachable' | 'degraded' | 'unchecked'

export interface InstanceStatus {
  key: InstanceStatusKey
  label: string
  variant: 'success' | 'warning' | 'error' | 'default'
}

const KEY_CODES = new Set(['auth_required', 'credentials_locked', 'unauthorized'])

export function instanceStatus(instance: ProviderInstance, health: ProviderHealth): InstanceStatus {
  const code = health.error?.code
  if (health.status === 'auth_required' || (code && KEY_CODES.has(code))) {
    return { key: 'key_missing', label: 'Clé manquante', variant: 'warning' }
  }
  if (health.status === 'unhealthy') return { key: 'unreachable', label: 'Injoignable', variant: 'error' }
  if (instance.allowed_for_project === false) return { key: 'not_allowed', label: 'Projet non autorisé', variant: 'warning' }
  if (health.status === 'healthy') return { key: 'connected', label: 'Connecté', variant: 'success' }
  if (health.status === 'degraded') return { key: 'degraded', label: 'Dégradé', variant: 'warning' }
  return { key: 'unchecked', label: 'Non vérifié', variant: 'default' }
}

export function formatWhenFr(iso: string | null | undefined): string {
  if (!iso) return 'jamais'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
