import { useEffect, useState } from 'react'
import { chatApi } from '@/services'
import type { ChatSession } from '@/types'

interface SessionListProps {
  onSelect: (sessionId: string) => void
  onClose: () => void
}

export function SessionList({ onSelect, onClose }: SessionListProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    chatApi.listSessions({ limit: 50 }).then((data) => {
      if (!cancelled) {
        setSessions(data.items || [])
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    await chatApi.deleteSession(sessionId)
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Sessions</span>
        <button
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Back
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-600 text-sm">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-600 text-sm">No sessions yet</div>
        ) : (
          <div className="py-1">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onSelect(session.id)}
                className="w-full text-left px-4 py-2.5 hover:bg-white/[0.04] transition-colors group flex items-start gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-300 truncate">
                    {session.title || `Session ${session.id.slice(0, 8)}`}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-600">{formatDate(session.updated_at)}</span>
                    <span className="text-xs text-gray-600">{session.message_count} msgs</span>
                    {session.model && (
                      <span className="text-xs text-gray-600">{session.model}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  className="shrink-0 p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete session"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
