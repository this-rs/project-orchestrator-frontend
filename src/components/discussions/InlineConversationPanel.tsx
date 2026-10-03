/**
 * InlineConversationPanel — displays the live conversation for a selected
 * discussion tree node, with "View Full" and "Stop" actions.
 *
 * Read-only view built on the shared `useConversationWs` hook (which assembles
 * events through `historyEventsToMessages`, like the main chat) and rendered
 * with `ChatMessageBubble`. It used to carry its own WebSocket client and event
 * parser, which read `tool_use.name` while the backend sends `tool`.
 */

import { useEffect, useRef, useState } from 'react'
import { focusRing, pressFeedback } from '@/components/ui/classes'
import {
  X,
  Wifi,
  WifiOff,
  Loader2,
  ExternalLink,
  Square,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useConversationWs, type WsStatus } from '@/hooks/runner/useConversationWs'
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble'
import { chatApi } from '@/services/chat'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'

// Read-only: there is no user interaction to answer in this view.
const noopRespond = () => {}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

function StatusIndicator({ status }: { status: WsStatus }) {
  if (status === 'connected') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-green-400">
        <Wifi className="w-3 h-3" />
        En direct
      </span>
    )
  }
  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-yellow-400">
        <Loader2 className="w-3 h-3 animate-spin" />
        {status === 'connecting' ? 'Connexion…' : 'Reconnexion…'}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
      <WifiOff className="w-3 h-3" />
      Déconnecté
    </span>
  )
}

// ---------------------------------------------------------------------------
// InlineConversationPanel
// ---------------------------------------------------------------------------

interface InlineConversationPanelProps {
  sessionId: string
  title: string
  onClose: () => void
}

export function InlineConversationPanel({ sessionId, title, onClose }: InlineConversationPanelProps) {
  const { messages, status } = useConversationWs(sessionId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const [stopping, setStopping] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)
  const [stopNote, setStopNote] = useState<string | null>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages.length])

  const handleViewFull = () => {
    navigate(workspacePath(wsSlug, `/chat/${sessionId}`))
  }

  const handleStop = async () => {
    setStopping(true)
    setStopNote(null)
    try {
      const outcome = await chatApi.interruptSession(sessionId)
      if (!outcome?.delivered) {
        // Not an error (the session may already have stopped), but never look like a successful stop.
        setStopNote("Rien n'a été interrompu : la session était peut-être déjà arrêtée.")
      }
      setConfirmStop(false)
    } catch (err) {
      setStopNote(`L'arrêt a échoué${err instanceof Error && err.message ? ` : ${err.message}` : ''}. Réessaie.`)
    } finally {
      setStopping(false)
    }
  }

  const isLive = status === 'connected'

  return (
    <div className="flex flex-col h-full bg-surface-base">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 border-b border-border-subtle bg-white/[0.02]">
        <div className="min-w-0 flex-1 basis-40">
          <h3 className="text-sm font-medium text-gray-200 break-words">{title}</h3>
          <StatusIndicator status={status} />
        </div>
        {/* Three separate 36 px targets with a real gap: Stop must never sit under a thumb aimed at Close. */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {isLive && !confirmStop && (
            <button
              type="button"
              onClick={() => {
                setStopNote(null)
                setConfirmStop(true)
              }}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-red-300 hover:bg-red-500/[0.1] ${pressFeedback} ${focusRing}`}
              aria-label="Arrêter l'agent de cette session"
            >
              <Square className="w-4 h-4" aria-hidden="true" />
              Arrêter
            </button>
          )}
          <button
            type="button"
            onClick={handleViewFull}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] ${pressFeedback} ${focusRing}`}
            aria-label="Ouvrir la conversation complète"
            title="Ouvrir la conversation complète"
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] ${pressFeedback} ${focusRing}`}
            aria-label="Fermer la conversation"
            title="Fermer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {isLive && confirmStop && (
          <div role="alertdialog" aria-label="Confirmer l'arrêt" className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2">
            <p className="min-w-0 flex-1 basis-48 text-sm text-gray-200">Arrêter l'agent ? Le travail en cours est interrompu.</p>
            <button
              type="button"
              onClick={() => setConfirmStop(false)}
              disabled={stopping}
              className={`inline-flex h-9 items-center rounded-lg px-3 text-sm text-gray-300 hover:bg-white/[0.06] disabled:opacity-50 ${pressFeedback} ${focusRing}`}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleStop}
              disabled={stopping}
              className={`inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 ${pressFeedback} ${focusRing}`}
            >
              {stopping && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              Arrêter l'agent
            </button>
          </div>
        )}
        {stopNote && (
          <p role="alert" className="w-full text-sm text-amber-300 break-words">
            {stopNote}
          </p>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400">
              {status === 'connected'
                ? 'En attente de messages…'
                : status === 'connecting'
                  ? 'Connexion à la session…'
                  : 'Aucun message pour le moment'}
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              message={msg}
              onRespondPermission={noopRespond}
              onRespondInput={noopRespond}
            />
          ))
        )}
      </div>
    </div>
  )
}
