import { useState, useRef, useCallback, useEffect } from 'react'

interface ChatInputProps {
  onSend: (text: string) => void
  onInterrupt: () => void
  isStreaming: boolean
  disabled?: boolean
}

export function ChatInput({ onSend, onInterrupt, isStreaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }, [])

  useEffect(() => {
    resize()
  }, [value, resize])

  const handleSend = () => {
    const text = value.trim()
    if (!text) return
    // No isStreaming guard — messages can be sent at any time (queued by backend)
    onSend(text)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-white/[0.06] p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Send a message..."
          className="flex-1 resize-none bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 disabled:opacity-50"
        />
        {/* Stop button — slides in during streaming */}
        <div
          className={`shrink-0 overflow-hidden transition-all duration-200 ease-in-out ${
            isStreaming ? 'w-8 opacity-100' : 'w-0 opacity-0'
          }`}
        >
          <button
            onClick={onInterrupt}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
            title="Stop generating"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        </div>
        {/* Send button — always visible */}
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 transition-colors disabled:opacity-30"
          title="Send message"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
