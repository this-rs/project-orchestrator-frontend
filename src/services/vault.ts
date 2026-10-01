import { api, apiRequest, ApiError, apiErrorMessage } from './api'

/**
 * Secrets vault API. No call here ever RECEIVES a secret value: values only go
 * up (put, answer). Agents read values server-side, inside their shell.
 */

export interface VaultSecret {
  name: string
  description?: string | null
  created_at: string
  updated_at: string
}

export type GrantScope =
  | { kind: 'session'; value: string }
  | { kind: 'project'; value: string }
  | { kind: 'anywhere' }

export type SecretSelector = { kind: 'all' } | { kind: 'names'; names: string[] }

export interface VaultGrant {
  id: string
  secrets: SecretSelector
  scope: GrantScope
  created_at: string
  expires_at: string
  note?: string | null
}

export interface SecretRequest {
  id: string
  name: string
  reason: string
  session_id: string
  project_slug?: string | null
  exists: boolean
  created_at: string
}

export interface VaultOverview {
  initialized: boolean
  /** Set while open: the instant it locks itself. */
  unlocked_until: string | null
  secret_count: number
  /** The vault file exists but cannot be read. */
  unavailable: string | null
  secrets: VaultSecret[]
  grants: VaultGrant[]
  requests: SecretRequest[]
}

export type AnswerAction = 'provide' | 'grant' | 'decline'

export interface AnswerInput {
  action: AnswerAction
  value?: string
  description?: string
  /** Defaults server-side to the requesting session. */
  scope?: GrantScope
  minutes?: number
  /** Unlock in the same call when the vault is locked. */
  passphrase?: string
  unlock_minutes?: number
}

/**
 * Unlock proof — proof that THIS tab typed the passphrase during the current
 * unlock. The server requires it to store, delete or grant secrets: agents run
 * as the same OS user and can forge a login, not this.
 *
 * Kept in memory ONLY (never localStorage/sessionStorage, which are files on
 * disk an agent could read). A reload forgets it: the next change then asks the
 * passphrase again, which is the point.
 */
let unlockProof: string | null = null

export function hasUnlockProof(): boolean {
  return unlockProof !== null
}

/** Called when the server says the vault is locked or the proof is stale. */
export function forgetUnlockProof(): void {
  unlockProof = null
}

function remember<T extends { unlock_proof?: string | null }>(res: T): T {
  if (res.unlock_proof) unlockProof = res.unlock_proof
  return res
}

/** A change that widens agent access: carries the proof. */
function withProof<T>(endpoint: string, method: string, body?: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: unlockProof ? { 'x-vault-proof': unlockProof } : {},
  }).catch((err: unknown) => {
    // 403 "needs the vault passphrase" / 409 "locked": the proof is useless now.
    if (err instanceof ApiError && (err.status === 409 || /passphrase/i.test(err.message))) {
      forgetUnlockProof()
    }
    throw err
  })
}

interface UnlockResult {
  unlocked_until: string | null
  unlock_proof: string
}

export const vaultApi = {
  overview: () => api.get<VaultOverview>('/vault'),
  init: (passphrase: string, minutes?: number) =>
    api.post<UnlockResult>('/vault/init', { passphrase, minutes }).then(remember),
  unlock: (passphrase: string, minutes?: number) =>
    api.post<UnlockResult>('/vault/unlock', { passphrase, minutes }).then(remember),
  lock: () =>
    api.post<void>('/vault/lock').then(() => {
      forgetUnlockProof()
    }),
  putSecret: (name: string, value: string, description?: string) =>
    withProof<void>(`/vault/secrets/${encodeURIComponent(name)}`, 'PUT', { value, description }),
  deleteSecret: (name: string) => withProof<void>(`/vault/secrets/${encodeURIComponent(name)}`, 'DELETE'),
  createGrant: (input: { secrets: SecretSelector; scope: GrantScope; minutes?: number; note?: string }) =>
    withProof<VaultGrant>('/vault/grants', 'POST', input),
  revokeGrant: (id: string) => api.delete<void>(`/vault/grants/${id}`),
  answer: (requestId: string, input: AnswerInput) =>
    withProof<{ outcome: string; grant: VaultGrant | null; unlock_proof?: string | null }>(
      `/vault/requests/${requestId}/answer`,
      'POST',
      input,
    ).then(remember),
}

/** The server answers `{"error": "..."}`; show the sentence, not the JSON. */
export const vaultErrorMessage = apiErrorMessage

/** Durations offered everywhere, so choices stay consistent. */
export const DURATION_CHOICES: { label: string; minutes: number }[] = [
  { label: '15 min', minutes: 15 },
  { label: '1 h', minutes: 60 },
  { label: '4 h', minutes: 240 },
  { label: '12 h', minutes: 720 },
]

export const GRANT_DURATION_CHOICES: { label: string; minutes: number }[] = [
  { label: '1 h', minutes: 60 },
  { label: '1 day', minutes: 1440 },
  { label: '7 days', minutes: 10080 },
  { label: '30 days', minutes: 43200 },
]
