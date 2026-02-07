import { useAtom } from 'jotai'
import { chatPanelModeAtom } from '@/atoms'
import { useChat } from '@/hooks'
import { ChatMessages } from './ChatMessages'
import { ChatInput } from './ChatInput'
import { SessionList } from './SessionList'
import { useState } from 'react'

export function ChatPanel() {
  const [mode, setMode] = useAtom(chatPanelModeAtom)
  const [showSessions, setShowSessions] = useState(false)
  const chat = useChat()

  const isOpen = mode !== 'closed'
  const isFullscreen = mode === 'fullscreen'

  const panelClasses = isFullscreen
    ? 'fixed inset-0 z-30'
    : 'fixed top-0 right-0 bottom-0 w-[400px] z-30'

  return (
    <div
      className={`${panelClasses} bg-[#1a1d27] border-l border-white/[0.06] flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
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
          <span className="text-sm font-medium text-gray-300 truncate">
            {chat.sessionId ? 'Chat' : 'New Chat'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={chat.newSession}
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
          <ChatMessages
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            onRespondPermission={chat.respondPermission}
            onRespondInput={chat.respondInput}
          />
          <ChatInput
            onSend={chat.sendMessage}
            onInterrupt={chat.interrupt}
            isStreaming={chat.isStreaming}
          />
        </>
      )}
    </div>
  )
}
