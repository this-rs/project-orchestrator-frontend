/**
 * useRunRootSession — resolves a run_id to its root ChatSession ID.
 */

import { useState, useEffect } from 'react'
import { chatApi } from '@/services/chat'

export function useRunRootSession(runId: string | null | undefined) {
  const [rootSessionId, setRootSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!runId) { setRootSessionId(null); setLoading(false); return }
    setLoading(true)
    chatApi.getRunSessions(runId).then((sessions) => {
      if (sessions.length > 0) {
        setRootSessionId(sessions[0].id)
      } else {
        setRootSessionId(null)
      }
    }).catch(() => {
      setRootSessionId(null)
    }).finally(() => {
      setLoading(false)
    })
  }, [runId])

  return { rootSessionId, loading }
}
