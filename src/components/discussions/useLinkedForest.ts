import { useCallback, useEffect, useRef, useState } from 'react'
import { chatApi } from '@/services/chat'
import type { SessionInfo, SessionTreeNode, SessionWithLinks } from '@/types/chat'
import { buildLinkedForest, type LinkedForest, type LinkedSession } from './linkedForest'

export type LinkedEntity = { type: 'plan' | 'task' | 'run'; id: string }

function fromWithLinks(items: SessionWithLinks[], showTasks: boolean): LinkedSession[] {
  return items.map(({ session, links, source }) => {
    const parts: string[] = []
    if (showTasks && links.linked_tasks.length > 0) parts.push(links.linked_tasks.map((t) => t.title).join(' · '))
    if (links.linked_rfcs.length > 0) parts.push(links.linked_rfcs.map((r) => r.title).join(' · '))
    if (session.preview) parts.push(session.preview)
    const where = [session.model, session.cwd?.replace(/^\/(?:Users|home)\/[^/]+\//, '~/')].filter(Boolean).join(' · ')
    if (where) parts.push(where)
    return {
      id: session.id,
      title: session.title,
      costUsd: session.total_cost_usd,
      messageCount: session.message_count,
      createdAt: session.created_at,
      source,
      detail: parts.join(' — ') || undefined,
    }
  })
}

function fromInfo(items: SessionInfo[]): LinkedSession[] {
  return items.map((s) => ({
    id: s.id,
    title: s.title,
    streaming: s.is_streaming,
    costUsd: s.total_cost_usd,
    createdAt: s.created_at,
    source: 'runner',
  }))
}

export async function fetchLinkedSessions(entity: LinkedEntity): Promise<LinkedSession[]> {
  if (entity.type === 'plan') return fromWithLinks(await chatApi.getPlanSessions(entity.id), true)
  if (entity.type === 'task') return fromWithLinks(await chatApi.getTaskSessions(entity.id), false)
  return fromInfo(await chatApi.getRunSessions(entity.id))
}

export interface UseLinkedForestResult {
  forest: LinkedForest | null
  isLoading: boolean
  error: string | null
  /** Number of listed sessions whose subtree could not be read (they still appear, as leaves). */
  treeErrors: number
  refresh: () => void
}

/**
 * The sessions linked to an entity, as ONE forest. The tree route of every listed
 * session is read (one call each); a failing tree does not hide its session.
 */
export function useLinkedForest(entity: LinkedEntity): UseLinkedForestResult {
  const [forest, setForest] = useState<LinkedForest | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [treeErrors, setTreeErrors] = useState(0)
  const seq = useRef(0)

  const load = useCallback(async () => {
    const n = ++seq.current
    try {
      const linked = await fetchLinkedSessions(entity)
      const settled = await Promise.allSettled(linked.map((l) => chatApi.getSessionTree(l.id)))
      if (n !== seq.current) return
      const trees = new Map<string, SessionTreeNode[]>()
      let failed = 0
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') trees.set(linked[i].id, r.value)
        else failed++
      })
      setForest(buildLinkedForest(linked, trees, entity.type === 'task' ? entity.id : undefined))
      setTreeErrors(failed)
      setError(null)
    } catch (e) {
      if (n !== seq.current) return
      setError(e instanceof Error ? e.message : 'Failed to load the discussions')
    } finally {
      if (n === seq.current) setIsLoading(false)
    }
  }, [entity.type, entity.id]) // eslint-disable-line react-hooks/exhaustive-deps -- entity identity is its two fields

  useEffect(() => {
    setIsLoading(true)
    setForest(null)
    void load()
    return () => {
      // Invalidate any in-flight load: a stale answer must not overwrite the new entity.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      seq.current++
    }
  }, [load])

  return { forest, isLoading, error, treeErrors, refresh: () => void load() }
}
