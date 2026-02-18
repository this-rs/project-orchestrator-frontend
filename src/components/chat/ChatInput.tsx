import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { chatDraftInputAtom, chatSessionPermissionOverrideAtom, chatPermissionConfigAtom, chatSessionModelAtom, chatAutoContinueAtom } from '@/atoms'
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID, getModelShortLabel, getModelDotColor } from '@/constants/models'
import type { PermissionMode } from '@/types'

const MODE_LABELS: Record<PermissionMode, string> = {
  bypassPermissions: 'Bypass',
  acceptEdits: 'Accept Edits',
  default: 'Default',
  plan: 'Plan Only',
}

const MODE_DOT_COLORS: Record<PermissionMode, string> = {
  bypassPermissions: 'bg-emerald-400',
  acceptEdits: 'bg-blue-400',
  default: 'bg-amber-400',
  plan: 'bg-gray-400',
}

/** Payload for prefilling the textarea from an external source (e.g. quick actions) */
export interface PrefillPayload {
  text: string
  /** Cursor position from the end of the string (0 = cursor at end) */
  cursorOffset?: number
}

interface ChatInputProps {
  onSend: (text: string) => void
  onInterrupt: () => void
  isStreaming: boolean
  disabled?: boolean
  /** Current session ID (null = new conversation) */
  sessionId?: string | null
  /** Callback to change permission mode on an active session (mid-session) */
  onChangePermissionMode?: (mode: PermissionMode) => void
  /** Callback to change model on an active session (mid-session) */
  onChangeModel?: (model: string) => void
  /** Callback to toggle auto-continue on an active session (sends WS message to backend) */
  onChangeAutoContinue?: (enabled: boolean) => void
  /** When set, prefills the textarea and focuses it. Change the object reference to trigger. */
  prefill?: PrefillPayload | null
}

export const ChatInput = memo(function ChatInput({ onSend, onInterrupt, isStreaming, disabled, sessionId, onChangePermissionMode, onChangeModel, onChangeAutoContinue, prefill }: ChatInputProps) {
  const [value, setValue] = useAtom(chatDraftInputAtom)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [modeOverride, setModeOverride] = useAtom(chatSessionPermissionOverrideAtom)
  const serverConfig = useAtomValue(chatPermissionConfigAtom)
  const [sessionModel, setSessionModel] = useAtom(chatSessionModelAtom)
  const autoContinue = useAtomValue(chatAutoContinueAtom)
  const [showModeDropdown, setShowModeDropdown] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [modeJustChanged, setModeJustChanged] = useState(false)
  const [modelJustChanged, setModelJustChanged] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  const effectiveMode = modeOverride ?? serverConfig?.mode ?? 'default'
  const effectiveModel = sessionModel ?? serverConfig?.default_model ?? DEFAULT_MODEL_ID

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }, [])

  useEffect(() => {
    resize()
  }, [value, resize])

  // Prefill textarea when a quick action is triggered
  useEffect(() => {
    if (!prefill) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync prefill from parent prop
    setValue(prefill.text)
    // Focus and position cursor after React re-renders the new value
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const cursorPos = typeof prefill.cursorOffset === 'number'
        ? prefill.text.length - prefill.cursorOffset
        : prefill.text.length
      el.setSelectionRange(cursorPos, cursorPos)
    })
  }, [prefill])

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showModeDropdown && !showModelDropdown) return
    const handler = (e: MouseEvent) => {
      if (showModeDropdown && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModeDropdown(false)
      }
      if (showModelDropdown && modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModeDropdown, showModelDropdown])

  // Reset isStopping when streaming actually stops (result event received)
  useEffect(() => {
    if (!isStreaming) {
      setIsStopping(false)
    }
  }, [isStreaming])

  const handleStop = useCallback(() => {
    if (isStopping) return // Already stopping — ignore repeated clicks
    setIsStopping(true)
    onInterrupt()
  }, [isStopping, onInterrupt])

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

  const handleSelectMode = (mode: PermissionMode) => {
    if (sessionId && onChangePermissionMode) {
      // Active session — send WS message for mid-session mode change
      onChangePermissionMode(mode)
    } else {
      // No session yet — set override atom (used at session creation)
      if (mode === serverConfig?.mode) {
        setModeOverride(null)
      } else {
        setModeOverride(mode)
      }
    }
    setShowModeDropdown(false)
    // Visual feedback: brief highlight
    setModeJustChanged(true)
    setTimeout(() => setModeJustChanged(false), 1000)
  }

  const handleSelectModel = (modelId: string) => {
    if (sessionId && onChangeModel) {
      // Active session — send WS message for mid-session model change
      onChangeModel(modelId)
    } else {
      // No session yet — set atom directly (used at session creation)
      setSessionModel(modelId)
    }
    setShowModelDropdown(false)
    // Visual feedback: brief highlight
    setModelJustChanged(true)
    setTimeout(() => setModelJustChanged(false), 1000)
  }

  return (
    <div className="border-t border-white/[0.06] px-3 pt-0.5 pb-2 flex flex-col gap-1">
      {/* Per-session mode & model selectors */}
      <div className="flex items-center gap-3">
        {/* Permission mode selector */}
        <div className="flex items-center gap-1.5" ref={dropdownRef}>
          <span className="text-[10px] text-gray-500">Mode:</span>
          <div className="relative">
            <button
              onClick={() => { setShowModeDropdown(!showModeDropdown); setShowModelDropdown(false) }}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/[0.04] border text-gray-300 hover:bg-white/[0.06] transition-all duration-300 ${
                modeJustChanged
                  ? 'border-indigo-400/50 ring-1 ring-indigo-400/30'
                  : 'border-white/[0.08]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${MODE_DOT_COLORS[effectiveMode]}`} />
              <span>{MODE_LABELS[effectiveMode]}</span>
              {modeOverride && !sessionId && (
                <span className="text-[8px] text-indigo-400 ml-0.5">(override)</span>
              )}
              <svg className="w-2.5 h-2.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showModeDropdown && (
              <div className="absolute bottom-full left-0 mb-1 z-20 w-40 bg-[#1e2130] border border-white/[0.08] rounded-lg shadow-xl py-1">
                {(Object.keys(MODE_LABELS) as PermissionMode[]).map((mode) => {
                  const isActive = effectiveMode === mode
                  const isDefault = mode === serverConfig?.mode
                  return (
                    <button
                      key={mode}
                      onClick={() => handleSelectMode(mode)}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${
                        isActive ? 'text-gray-100 bg-white/[0.04]' : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${MODE_DOT_COLORS[mode]}`} />
                      <span>{MODE_LABELS[mode]}</span>
                      {isDefault && <span className="text-[9px] text-gray-600 ml-auto">default</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Model selector — always visible (new conversation + active session) */}
        <div className="flex items-center gap-1.5" ref={modelDropdownRef}>
          <span className="text-[10px] text-gray-500">Model:</span>
          <div className="relative">
            <button
              onClick={() => { setShowModelDropdown(!showModelDropdown); setShowModeDropdown(false) }}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/[0.04] border text-gray-300 hover:bg-white/[0.06] transition-all duration-300 ${
                modelJustChanged
                  ? 'border-violet-400/50 ring-1 ring-violet-400/30'
                  : 'border-white/[0.08]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${getModelDotColor(effectiveModel)}`} />
              <span>{getModelShortLabel(effectiveModel)}</span>
              <svg className="w-2.5 h-2.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showModelDropdown && (
              <div className="absolute bottom-full left-0 mb-1 z-20 w-52 bg-[#1e2130] border border-white/[0.08] rounded-lg shadow-xl py-1">
                {AVAILABLE_MODELS.map((opt) => {
                  const isActive = effectiveModel === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleSelectModel(opt.id)}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${
                        isActive ? 'text-gray-100 bg-white/[0.04]' : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${opt.dotColor}`} />
                      <span>{opt.shortLabel}</span>
                      <span className="text-[9px] text-gray-600 ml-auto font-mono">{opt.id.replace('claude-', '').slice(0, 15)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Auto-continue toggle — pushed to the right */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className={`text-[10px] ${autoContinue ? 'text-gray-400' : 'text-gray-500'} transition-colors`}>Auto-continue</span>
          <button
            onClick={() => onChangeAutoContinue?.(!autoContinue)}
            className={`relative w-7 h-3.5 rounded-full transition-colors duration-200 ${
              autoContinue ? 'bg-emerald-500/70' : 'bg-gray-600/50'
            }`}
            title={autoContinue ? 'Auto-continue enabled' : 'Auto-continue disabled'}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform duration-200 ${
                autoContinue ? 'translate-x-3' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

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
            onClick={handleStop}
            disabled={isStopping}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
              isStopping
                ? 'bg-red-600/30 text-red-300 cursor-wait'
                : 'bg-red-600/20 text-red-400 hover:bg-red-600/30 active:bg-red-600/50 active:scale-95'
            }`}
            title={isStopping ? 'Stopping...' : 'Stop generating'}
          >
            {isStopping ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            )}
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
})
