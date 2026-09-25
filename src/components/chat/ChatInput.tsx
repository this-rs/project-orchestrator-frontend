import { memo, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { chatDraftInputAtom, chatSessionPermissionOverrideAtom, chatPermissionConfigAtom, chatSessionModelAtom, chatAutoContinueAtom, chatMessageQueueAtom, modelCatalogAtom, modelCatalogLoadedAtom } from '@/atoms'
import { DEFAULT_MODEL_ID, getModelShortLabel, getModelDotColor, groupModelsByFamily } from '@/constants/models'
import { chatApi } from '@/services/chat'
import { useIsMobile } from '@/hooks'
import type { PermissionMode } from '@/types'
import { ChevronDown, Loader2, Square, ArrowRight } from 'lucide-react'
import { BackgroundTasksIndicator } from './BackgroundTasksIndicator'
import { ModelFamilyPicker, type ModelSelectOptions } from './ModelFamilyPicker'
import { deriveInputAction, ACTION_LABELS } from './inputAction'
import { MessageQueueBar } from './MessageQueueBar'
import {
  QUEUE_POLICY,
  shouldEnqueue,
  enqueue,
  removeFromQueue,
  editInQueue,
  prioritize,
  takeHead,
} from './messageQueue'

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
  const isMobile = useIsMobile()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [modeOverride, setModeOverride] = useAtom(chatSessionPermissionOverrideAtom)
  const [serverConfig, setServerConfig] = useAtom(chatPermissionConfigAtom)
  const [sessionModel, setSessionModel] = useAtom(chatSessionModelAtom)
  const autoContinue = useAtomValue(chatAutoContinueAtom)
  const availableModels = useAtomValue(modelCatalogAtom)
  const catalogLoaded = useAtomValue(modelCatalogLoadedAtom)
  const modelGroups = useMemo(() => groupModelsByFamily(availableModels), [availableModels])
  const [showModeDropdown, setShowModeDropdown] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [modeJustChanged, setModeJustChanged] = useState(false)
  const [modelJustChanged, setModelJustChanged] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [queue, setQueue] = useAtom(chatMessageQueueAtom)
  const prevStreamingRef = useRef(isStreaming)
  const prevSessionIdRef = useRef(sessionId)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  const effectiveMode = modeOverride ?? serverConfig?.mode ?? 'default'
  const effectiveModel = sessionModel ?? serverConfig?.default_model ?? DEFAULT_MODEL_ID

  /** Full re-measure: reset then fit (needed to let the box SHRINK). */
  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }, [])

  // Auto-resize the textarea to fit content (capped at 150px).
  //
  // Perf: the naive pattern (style write `height:auto` then `scrollHeight`
  // read) forces a synchronous double reflow on EVERY keystroke — measurable
  // typing lag on mobile where layout is expensive. Typing forward can only
  // GROW the box, so the hot path does a clean-layout read (cheap, cached)
  // and only writes when the content actually overflows. The full reset
  // re-measure (which can shrink the box) only runs on deletions — much
  // rarer than insertions while typing.
  const lastValueLenRef = useRef(0)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const grewOrSame = value.length >= lastValueLenRef.current
    lastValueLenRef.current = value.length

    if (grewOrSame) {
      // Insertion fast path: read on clean layout, write only on overflow.
      if (el.scrollHeight > el.clientHeight) {
        const next = `${Math.min(el.scrollHeight, 150)}px`
        if (el.style.height !== next) el.style.height = next
      }
    } else {
      // Deletion: allow the box to shrink via a full re-measure.
      resize()
    }
  }, [value, resize])

  // --- Auto-focus textarea on session switch, cursor at end ---
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      // preventScroll: on iOS the default focus behavior scrolls/pans the
      // page to reveal the field — the visual-viewport compensation already
      // does, and the extra pan misaligns the fixed panel.
      el.focus({ preventScroll: true })
      // Place cursor at end of restored draft
      const len = el.value.length
      el.setSelectionRange(len, len)
    })
  }, [sessionId])

  // Prefill textarea when a quick action is triggered
  useEffect(() => {
    if (!prefill) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync prefill from parent prop
    setValue(prefill.text)
    // Focus and position cursor after React re-renders the new value
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      // preventScroll: on iOS the default focus behavior scrolls/pans the
      // page to reveal the field — the visual-viewport compensation already
      // does, and the extra pan misaligns the fixed panel.
      el.focus({ preventScroll: true })
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

  // Load permission config from server on mount (so mode selector has the correct default)
  useEffect(() => {
    if (serverConfig) return // Already loaded (e.g. from PermissionSettingsPanel)
    let cancelled = false
    chatApi.getPermissionConfig().then((config) => {
      if (!cancelled) setServerConfig(config)
    }).catch(() => {
      // Non-critical — will fallback to 'default'
    })
    return () => { cancelled = true }
  }, [serverConfig, setServerConfig])

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

  const newQueueId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `q-${Date.now()}-${Math.random().toString(36).slice(2)}`

  const handleSend = () => {
    const text = value.trim()
    if (!text) return
    // While streaming, hold the message here instead of dispatching. Sending
    // mid-stream makes the backend interrupt the running generation
    // (`chat/manager.rs`), which cut off the response the user was reading.
    if (shouldEnqueue({ isStreaming })) {
      setQueue((q) => enqueue(q, text, newQueueId(), Date.now()))
    } else {
      onSend(text)
    }
    setValue('')
  }

  // Auto-flush: one message per finished turn, oldest first. Fires only on the
  // streaming true -> false edge, so a queue mutation cannot re-trigger it.
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current
    prevStreamingRef.current = isStreaming
    if (!QUEUE_POLICY.autoFlushOnIdle) return
    if (!wasStreaming || isStreaming) return
    const { taken, rest } = takeHead(queue)
    if (!taken) return
    setQueue(rest)
    onSend(taken.text)
  }, [isStreaming, queue, onSend, setQueue])

  // Drop the queue when the session actually changes — a message composed for
  // session A must never land in session B. Compared against a ref rather than
  // firing on mount, because ChatInput remounts when the panel switches layout
  // and that must not wipe a pending queue.
  useEffect(() => {
    if (prevSessionIdRef.current !== sessionId) {
      prevSessionIdRef.current = sessionId
      setQueue([])
    }
  }, [sessionId, setQueue])

  const handleQueueEdit = useCallback(
    (id: string, text: string) => setQueue((q) => editInQueue(q, id, text)),
    [setQueue],
  )
  const handleQueueDelete = useCallback(
    (id: string) => setQueue((q) => removeFromQueue(q, id)),
    [setQueue],
  )
  const handleQueuePrioritize = useCallback(
    (id: string) => setQueue((q) => prioritize(q, id)),
    [setQueue],
  )

  const action = deriveInputAction({
    hasText: value.trim().length > 0,
    isStreaming,
    isStopping,
    disabled: disabled ?? false,
  })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // On mobile, the on-screen keyboard's return key must insert a real newline —
    // sending is done via the dedicated send button. Let the keypress fall through
    // to the textarea's default behavior (newline) instead of submitting.
    if (isMobile) return
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

  const handleSelectModel = (modelId: string, { close }: ModelSelectOptions = { close: true }) => {
    if (sessionId && onChangeModel) {
      // Active session — send WS message for mid-session model change
      onChangeModel(modelId)
    } else {
      // No session yet — set atom directly (used at session creation)
      setSessionModel(modelId)
    }
    if (close) setShowModelDropdown(false)
    // Visual feedback: brief highlight
    setModelJustChanged(true)
    setTimeout(() => setModelJustChanged(false), 1000)
  }

  return (
    // pb: with viewport-fit=cover, keep the input clear of the home
    // indicator on notched devices (inset collapses to 0 when the
    // keyboard is open, so no double padding).
    <div className="relative border-t border-white/[0.06] px-3 pt-0.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex flex-col gap-1">
      <MessageQueueBar
        queue={queue}
        onEdit={handleQueueEdit}
        onDelete={handleQueueDelete}
        onPrioritize={handleQueuePrioritize}
      />
      {/* Per-session mode & model selectors. `relative` makes this row the
          model picker's containing block on mobile (see below). */}
      <div className="relative flex items-center gap-3">
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
              <ChevronDown className="w-2.5 h-2.5 text-gray-500" />
            </button>
            {showModeDropdown && (
              <div className="absolute bottom-full left-0 mb-1 z-20 w-40 bg-surface-popover border border-white/[0.08] rounded-lg shadow-xl py-1">
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
          {/* Positioned only from `sm` up. Below that the picker's containing
              block is the whole toolbar row, so it spans the input's width
              instead of hanging off a button that sits mid-row — anchored to
              the button, a phone-width screen pushed it off the right edge. */}
          <div className="sm:relative">
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
              <ChevronDown className="w-2.5 h-2.5 text-gray-500" />
            </button>
            {showModelDropdown && (
              <div
                data-testid="model-picker-popover"
                className="absolute bottom-full left-0 right-0 sm:right-auto sm:w-64 mb-1 z-20 max-h-[min(18rem,45dvh)] overflow-y-auto overscroll-contain bg-surface-popover border border-white/[0.08] rounded-lg shadow-xl"
              >
                <ModelFamilyPicker
                  groups={modelGroups}
                  activeModelId={effectiveModel}
                  loaded={catalogLoaded}
                  onSelect={handleSelectModel}
                />
              </div>
            )}
          </div>
        </div>

        {/* Background tasks indicator (Monitor + Bash bg) — pushed to the
            right alongside Auto-continue. Plan 5985a7c4 (F4). The
            component renders `null` when no tasks are tracked, so the
            toolbar stays compact when there's no background activity. */}
        <div className="ml-auto flex items-center gap-3">
          <BackgroundTasksIndicator />

          {/* Auto-continue toggle */}
          <div className="flex items-center gap-1.5">
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
      </div>

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          // On mobile the return key inserts a newline (sending is via the button);
          // on desktop it submits, so hint the soft keyboard accordingly.
          enterKeyHint={isMobile ? 'enter' : 'send'}
          // Keep iOS/iPadOS from heuristically treating this as a login
          // field (AutoFill/password bar above the keyboard). A bare
          // textarea with no autocomplete hint can get misclassified by
          // iCloud Keychain / password managers.
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          placeholder="Send a message..."
          className="flex-1 resize-none bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 disabled:opacity-50"
        />
        {/* One slot for both affordances — see `deriveInputAction`. */}
        <button
          onClick={action === 'stop' ? handleStop : handleSend}
          disabled={action === 'idle' || action === 'stopping'}
          aria-label={ACTION_LABELS[action]}
          title={ACTION_LABELS[action]}
          data-action={action}
          className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
            action === 'stop'
              ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30 active:bg-red-600/50 active:scale-95'
              : action === 'stopping'
                ? 'bg-red-600/30 text-red-300 cursor-wait'
                : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 disabled:opacity-30'
          }`}
        >
          {action === 'stopping' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : action === 'stop' ? (
            <Square className="w-3.5 h-3.5 fill-current" />
          ) : (
            <ArrowRight className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  )
})
