/**
 * useAgentExecutionsMap — polls agent executions for a run, indexed by task_id.
 */

import { useState, useCallback, useEffect } from 'react'
import { chatApi } from '@/services/chat'
import type { AgentExecution } from '@/types'

export function useAgentExecutionsMap(runId: string | null | undefined, isRunning: boolean) {
  const [execMap, setExecMap] = useState<Map<string, AgentExecution>>(new Map())

  const fetchExecutions = useCallback(async () => {
    if (!runId) return
    try {
      const execs = await chatApi.getAgentExecutions(runId)
      const map = new Map<string, AgentExecution>()
      for (const e of execs) map.set(e.task_id, e)
      setExecMap(map)
    } catch {
      // Endpoint may not be available yet — graceful fallback
    }
  }, [runId])

  // Initial fetch + poll every 5s while the run is active
  useEffect(() => {
    fetchExecutions()
    if (!isRunning) return
    const interval = setInterval(fetchExecutions, 5000)
    return () => clearInterval(interval)
  }, [fetchExecutions, isRunning])

  return execMap
}
