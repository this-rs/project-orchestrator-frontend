import { api } from './api'
import type { ServerUpdateStatus, RestartResponse } from '@/types/update'

/** Actions of the server-side update service. Status is read from GET /api/version. */
export const updateApi = {
  /** Query GitHub now. */
  check: () => api.post<ServerUpdateStatus>('/update/check', {}),
  /** Download + verify + stage the latest release. Returns at once (202); poll the status. */
  install: () => api.post<ServerUpdateStatus>('/update/install', {}),
  /** Restart the server to apply the staged update. Interrupts running conversations. */
  restart: () => api.post<RestartResponse>('/update/restart', {}),
}
