import { useAtom } from 'jotai'
import { chatPanelModeAtom, chatPanelWidthAtom } from '@/atoms'
import { useChat } from '@/hooks'
import { ChatMessages } from './ChatMessages'
import { ChatInput } from './ChatInput'
import { SessionList } from './SessionList'
import { ProjectSelect } from './ProjectSelect'
import { useState, useCallback, useRef, useEffect } from 'react'
import type { Project } from '@/types'

const MIN_WIDTH = 320
const MAX_WIDTH = 800

export function ChatPanel() {
  const [mode, setMode] = useAtom(chatPanelModeAtom)
  const [panelWidth, setPanelWidth] = useAtom(chatPanelWidthAtom)
  const [showSessions, setShowSessions] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const chat = useChat()
  const panelRef = useRef<HTMLDivElement>(null)

  const isOpen = mode !== 'closed'
  const isFullscreen = mode === 'fullscreen'
  const isNewConversation = !chat.sessionId

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX
      setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)))
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, setPanelWidth])

  const handleSend = (text: string) => {
    if (isNewConversation && !selectedProject) return
    chat.sendMessage(
      text,
      isNewConversation
        ? { cwd: selectedProject!.root_path, projectSlug: selectedProject!.slug }
        : undefined,
    )
  }

  const handleNewSession = () => {
    chat.newSession()
    setSelectedProject(null)
  }

  return (
    <div
      ref={panelRef}
      className={`fixed z-30 bg-[#1a1d27] border-l border-white/[0.06] flex flex-col ${isDragging ? '' : 'transition-transform duration-300 ease-in-out'} ${isOpen ? 'translate-x-0' : 'translate-x-full'} ${isFullscreen ? 'inset-0' : 'top-0 right-0 bottom-0 w-full'}`}
      style={!isFullscreen ? { maxWidth: panelWidth } : undefined}
    >
      {/* Resize handle */}
      {!isFullscreen && (
        <div
          onMouseDown={handleMouseDown}
          className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-indigo-500/40 transition-colors ${isDragging ? 'bg-indigo-500/50' : ''}`}
        />
      )}
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
            title="Sessions"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-300 truncate block">
              {chat.sessionId ? 'Chat' : 'New Chat'}
            </span>
            {!isNewConversation && selectedProject && (
              <span className="text-[10px] text-gray-500 truncate block">
                {selectedProject.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewSession}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
            title="New chat"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={() => setMode(isFullscreen ? 'open' : 'fullscreen')}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v5m0-5h5m6 6l5 5m0 0v-5m0 5h-5" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setMode('closed')}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      {showSessions ? (
        <SessionList
          onSelect={(sessionId) => {
            chat.loadSession(sessionId)
            setShowSessions(false)
          }}
          onClose={() => setShowSessions(false)}
        />
      ) : (
        <>
          {/* Project selector — only for new conversations */}
          {isNewConversation && (
            <ProjectSelect
              value={selectedProject?.id || null}
              onChange={setSelectedProject}
            />
          )}

          <ChatMessages
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            onRespondPermission={chat.respondPermission}
            onRespondInput={chat.respondInput}
          />
          <ChatInput
            onSend={handleSend}
            onInterrupt={chat.interrupt}
            isStreaming={chat.isStreaming}
            disabled={isNewConversation && !selectedProject}
          />
        </>
      )}
    </div>
  )
}
