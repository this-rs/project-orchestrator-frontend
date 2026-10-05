/** `update` field of GET /api/version (backend `UpdateStatus`). Absent on servers older than v0.0.16. */
export type DeploymentMode = 'standalone' | 'source' | 'desktop' | 'docker' | 'package_manager'

export interface ServerUpdateStatus {
  /** Version the running build corresponds to (e.g. "0.0.15") */
  current: string
  /** Display string including commits ahead for source builds */
  current_build: string
  latest: string | null
  update_available: boolean
  release_url: string | null
  notes_excerpt: string | null
  published_at: string | null
  checked_at: string | null
  last_error: string | null
  check_enabled: boolean
  auto_update_enabled: boolean
  deployment_mode: DeploymentMode
  /** Whether this server can install the update itself */
  self_update_supported: boolean
  /** What the operator should run when the server cannot update itself */
  update_hint: string
  installing: boolean
  install_error: string | null
  /** Version already written to disk, waiting for a restart */
  staged_version: string | null
  restart_required: boolean
  /** A supervisor will bring the server back after a restart request */
  restart_supported: boolean
}

export interface RestartResponse {
  restarting: boolean
  in_ms: number
}
