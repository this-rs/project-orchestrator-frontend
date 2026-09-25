import { memo, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useAtom, useAtomValue, useStore } from 'jotai'
import { chatAttachmentDeferredSendAtom, chatAttachmentsAtom, chatDraftInputAtom, chatSelectedProjectAtom, chatSessionPermissionOverrideAtom, chatPermissionConfigAtom, chatSessionModelAtom, chatAutoContinueAtom, chatMessageQueueAtom, modelCatalogAtom, modelCatalogLoadedAtom } from '@/atoms'
import { DEFAULT_MODEL_ID, getModelShortLabel, getModelDotColor, groupModelsByFamily } from '@/constants/models'
import { chatApi } from '@/services/chat'
import { documentsApi } from '@/services/documents'
import { ApiError } from '@/services/api'
import { useIsMobile } from '@/hooks'
import type { PermissionMode } from '@/types'
import { ChevronDown, Loader2, Paperclip, Square, ArrowRight } from 'lucide-react'
import { BackgroundTasksIndicator } from './BackgroundTasksIndicator'
import { ModelFamilyPicker, type ModelSelectOptions } from './ModelFamilyPicker'
import { deriveInputAction, describeAction } from './inputAction'
import { MessageQueueBar } from './MessageQueueBar'
import {
  QUEUE_POLICY,
  shouldEnqueue,
  enqueue,
  removeFromQueue,
  editInQueue,
  takeById,
  prioritize,
  takeHead,
} from './messageQueue'
import { Attachments } from './Attachments'
import {
  addAttachment,
  createAttachment,
  decideSend,
  describeUploadFailure,
  filesFromClipboard,
  readyDocumentIds,
  removeAttachment,
  resolveDeferred,
  summarize,
  updateAttachment,
  withFailure,
  withProgress,
  withUploaded,
  type Attachment,
} from './attachmentState'

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


/**
 * Tallest the textarea grows before it scrolls. Was 150px (~6 lines); with the
 * toolbar folded into the composer there is room for more, and a longer
 * message is easier to review when it is all visible.
 */
const TEXTAREA_MAX_PX = 240

interface ChatInputProps {
  /**
   * Dispatch a message.
   *
   * `attachmentIds` are document ids the server has already issued — never an
   * id for an upload still in flight. `attachmentState.ts` is what guarantees it.
   */
  onSend: (text: string, attachmentIds?: string[]) => void
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

  // --- Attachments ---
  const store = useStore()
  const attachments = useAtomValue(chatAttachmentsAtom)
  const deferredSend = useAtomValue(chatAttachmentDeferredSendAtom)
  const selectedProject = useAtomValue(chatSelectedProjectAtom)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  // Depth counter, not a boolean: dragging over a child element fires
  // dragleave on the parent, and a naive boolean makes the overlay flicker.
  const dragDepthRef = useRef(0)
  /** One AbortController per in-flight upload, so removing a chip cancels it. */
  const uploadsRef = useRef(new Map<string, AbortController>())

  const effectiveMode = modeOverride ?? serverConfig?.mode ?? 'default'
  const effectiveModel = sessionModel ?? serverConfig?.default_model ?? DEFAULT_MODEL_ID

  /** Full re-measure: reset then fit (needed to let the box SHRINK). */
  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, TEXTAREA_MAX_PX) + 'px'
  }, [])

  // Auto-resize the textarea to fit content (capped at TEXTAREA_MAX_PX).
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
        const next = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`
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

  // ── Attachments ───────────────────────────────────────────────────────
  //
  // Everything below reads the attachment list through `store.get` rather
  // than the rendered `attachments` value. Uploads resolve out of order and
  // several can settle in the same tick; a render-time snapshot captured in a
  // closure would silently undo a sibling's transition.

  /**
   * Apply a transition to the attachment list and return the new list, so the
   * caller can act on exactly what it wrote.
   */
  const mutateAttachments = useCallback(
    (fn: (list: Attachment[]) => Attachment[]): Attachment[] => {
      const next = fn(store.get(chatAttachmentsAtom))
      store.set(chatAttachmentsAtom, next)
      return next
    },
    [store],
  )

  /** Dispatch for real. Only ever called with a list where nothing is in flight. */
  const dispatchSend = useCallback(
    (text: string, list: Attachment[]) => {
      onSend(text, readyDocumentIds(list))
      setValue('')
      store.set(chatAttachmentsAtom, [])
      store.set(chatAttachmentDeferredSendAtom, false)
      uploadsRef.current.clear()
    },
    [onSend, setValue, store],
  )

  /**
   * Layer 2 in one place: a complete message either leaves now or joins the
   * queue, and every send path goes through here to decide.
   *
   * Both callers need it. `handleSend` is the obvious one; the held-send path
   * (`settleDeferredSend`, for a message whose upload was still running when
   * the user hit send) used to call `dispatchSend` directly and so slipped
   * mid-stream sends past the queue entirely — a message with an attachment
   * behaved differently from one without, which is not a distinction the user
   * made.
   */
  const enqueueOrDispatch = useCallback(
    (text: string, list: Attachment[]) => {
      if (!shouldEnqueue({ isStreaming })) {
        dispatchSend(text, list)
        return
      }
      setQueue((q) => enqueue(q, text, newQueueId(), Date.now(), readyDocumentIds(list)))
      // The queued message took the composer's contents with it — text,
      // attachments and any held send: it starts clean for the next one.
      setValue('')
      store.set(chatAttachmentsAtom, [])
      store.set(chatAttachmentDeferredSendAtom, false)
      uploadsRef.current.clear()
    },
    [isStreaming, dispatchSend, setQueue, setValue, store],
  )

  /**
   * Re-evaluate a held send. Called after every change to the list, from the
   * handler that made the change — never from an effect, so a message can
   * never be sent twice by a re-render.
   */
  const settleDeferredSend = useCallback(
    (list: Attachment[]) => {
      if (!store.get(chatAttachmentDeferredSendAtom)) return
      const outcome = resolveDeferred(summarize(list))
      if (outcome === 'wait') return
      store.set(chatAttachmentDeferredSendAtom, false)
      if (outcome !== 'dispatch') return // 'abort': the failure is on the chip
      // The text is read now, not at click time: it stayed in the box and the
      // user may have kept typing (or cleared it) while the upload ran.
      const text = store.get(chatDraftInputAtom).trim()
      if (text) enqueueOrDispatch(text, list)
    },
    [store, enqueueOrDispatch],
  )

  /**
   * Add files and start uploading them immediately — the single most
   * important behaviour here. Deferring the upload to send time would make
   * every send that carries a file look like a hang.
   */
  const addFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const localId =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `att-${Date.now()}-${Math.random().toString(36).slice(2)}`

        const before = store.get(chatAttachmentsAtom)
        const next = addAttachment(before, createAttachment(localId, file))
        // At the cap `addAttachment` returns the list unchanged; stop rather
        // than firing uploads for files that are not in the list.
        if (next.length === before.length) break
        store.set(chatAttachmentsAtom, next)

        const controller = new AbortController()
        uploadsRef.current.set(localId, controller)

        documentsApi
          .upload(file, {
            projectId: selectedProject?.id,
            sessionId: sessionId ?? undefined,
            signal: controller.signal,
            onProgress: (percent) =>
              mutateAttachments((l) =>
                updateAttachment(l, localId, (a) => withProgress(a, percent)),
              ),
          })
          .then((doc) => {
            uploadsRef.current.delete(localId)
            settleDeferredSend(
              mutateAttachments((l) =>
                updateAttachment(l, localId, (a) => withUploaded(a, doc)),
              ),
            )
          })
          .catch((err: unknown) => {
            uploadsRef.current.delete(localId)
            // An abort means the chip is already gone (removed, or the session
            // switched). Nothing to report on a row that no longer exists.
            if (err instanceof DOMException && err.name === 'AbortError') return
            const message =
              err instanceof ApiError
                ? describeUploadFailure(err.status, err.message)
                : describeUploadFailure(0)
            settleDeferredSend(
              mutateAttachments((l) =>
                updateAttachment(l, localId, (a) => withFailure(a, message)),
              ),
            )
          })
      }
    },
    [store, selectedProject, sessionId, mutateAttachments, settleDeferredSend],
  )

  const handleRemoveAttachment = useCallback(
    (localId: string) => {
      uploadsRef.current.get(localId)?.abort()
      uploadsRef.current.delete(localId)
      settleDeferredSend(mutateAttachments((l) => removeAttachment(l, localId)))
    },
    [mutateAttachments, settleDeferredSend],
  )

  /** Paperclip button → hidden file input. */
  const handleFilesPicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      addFiles(Array.from(e.target.files ?? []))
      // Reset so picking the same file twice in a row fires `change` again.
      e.target.value = ''
    },
    [addFiles],
  )

  /**
   * Paste — the way a screenshot actually gets attached, and the path most
   * often left out. A paste carrying no file falls through untouched, so
   * pasting text keeps working exactly as before.
   */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = filesFromClipboard(e.clipboardData?.items)
      if (files.length === 0) return
      e.preventDefault()
      addFiles(files)
    },
    [addFiles],
  )

  // Drag & drop over the composer. `dataTransfer.types` is the only thing
  // readable during a drag (the files themselves are not), so it is what
  // decides whether this drag is ours — dragging selected text must not open
  // a file drop zone.
  const dragHasFiles = (dt: DataTransfer | null) =>
    !!dt && Array.from(dt.types).includes('Files')

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return
    dragDepthRef.current++
    setIsDraggingFiles(true)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return
    // Without preventDefault the browser navigates to the dropped file.
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDraggingFiles(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!dragHasFiles(e.dataTransfer)) return
      e.preventDefault()
      dragDepthRef.current = 0
      setIsDraggingFiles(false)
      addFiles(Array.from(e.dataTransfer.files))
    },
    [addFiles],
  )

  // Drop the attachments when the session actually changes — a screenshot
  // attached for session A must never ride along to session B. Compared
  // against a ref rather than firing on mount, because ChatInput remounts when
  // the panel switches layout and that must not wipe an upload in progress.
  // Session change wipes BOTH the pending queue and the attachments, in one
  // effect and against one ref.
  //
  // This was two effects before the merge, each comparing and then updating
  // `prevSessionIdRef`. Whichever ran first would update the ref, and the
  // second would see no change and clear nothing — a silent half-purge that
  // compiles, renders, and leaks one session's state into the next. Splitting
  // them again means reintroducing that bug.
  //
  // Compared against a ref rather than firing on mount: `ChatInput` remounts
  // when the panel switches layout, and that must not wipe a pending queue or
  // an upload in flight.
  //
  // In-flight requests are aborted — they carry the old session_id.
  useEffect(() => {
    if (prevSessionIdRef.current === sessionId) return
    prevSessionIdRef.current = sessionId
    for (const controller of uploadsRef.current.values()) controller.abort()
    uploadsRef.current.clear()
    store.set(chatAttachmentsAtom, [])
    store.set(chatAttachmentDeferredSendAtom, false)
    setQueue([])
  }, [sessionId, store, setQueue])

  const handleSend = () => {
    const text = value.trim()
    const list = store.get(chatAttachmentsAtom)

    // ── Layer 1 — can this message exist at all? ───────────────────────
    // Attachment readiness is a property of the message itself, so it is
    // settled before anything about timing.
    switch (decideSend({ hasText: text.length > 0, summary: summarize(list) })) {
      case 'reject-empty':
        return
      case 'reject-failed':
        // The failed chip already carries the server's message and its remove
        // button; a second, transient error elsewhere would only add noise.
        return
      case 'defer':
        store.set(chatAttachmentDeferredSendAtom, true)
        return
      case 'send':
        break
    }

    // ── Layer 2 — when does it leave? ──────────────────────────────────
    // Only a complete message may enter the queue. Queueing one whose upload
    // is still running would flush it later with ids that never resolved —
    // which is why layer 1 runs first and returns rather than falling through.
    enqueueOrDispatch(text, list)
  }

  /**
   * What the send button means right now — derived, never stored.
   *
   * Computed before `deriveInputAction` because the button reads it: the two
   * concerns stack (see `inputAction.ts`), attachment readiness first.
   */
  const sendDecision = decideSend({
    hasText: value.trim().length > 0,
    summary: summarize(attachments),
  })

  // Auto-flush: one message per finished turn, oldest first.
  //
  // Expressed as an INVARIANT ("idle with a non-empty queue must not last"),
  // not as an edge detector. It used to fire only on the streaming
  // true -> false transition, which strands the queue for good whenever that
  // single edge is missed — and it is missed every time `ChatInput` remounts
  // (layout switch, Fast Refresh), because the comparison ref is then
  // re-initialised to the current value and the transition has already
  // happened. The message sat in the queue forever with nothing to say so.
  // Asserting the invariant instead is self-healing: on the next render after
  // any such miss, the queue drains.
  //
  // `flushArmedRef` is what keeps "one message per turn". It is armed when a
  // response STARTS (and at mount, so a stranded queue heals) and disarmed by
  // whatever sends — the auto-flush here, or a manual "send now" from a row.
  // Arming on the rising edge rather than on `isStreaming === true` matters:
  // a manual send interrupts the running response, so a `result` for the
  // interrupted turn lands moments later. Re-arming on that stale `true` would
  // let the interrupted turn's end flush a SECOND message, and both would race
  // into the same turn.
  //
  // If a send never starts a stream (dead socket, disabled input) the latch
  // stays closed and the rest of the queue waits for the next response rather
  // than draining in one render pass.
  const flushArmedRef = useRef(true)
  useEffect(() => {
    const responseStarted = isStreaming && !prevStreamingRef.current
    prevStreamingRef.current = isStreaming
    if (responseStarted) flushArmedRef.current = true
    if (isStreaming) return
    if (!QUEUE_POLICY.autoFlushOnIdle) return
    // A disabled composer has no session to send to — hold, don't drop.
    if (disabled) return
    if (!flushArmedRef.current) return
    const { taken, rest } = takeHead(queue)
    if (!taken) return
    flushArmedRef.current = false
    setQueue(rest)
    // The queued entry carries its own attachment ids: by now the composer
    // holds the *next* message's attachments, so reading them here would send
    // the wrong ones.
    onSend(taken.text, taken.attachmentIds)
  }, [isStreaming, disabled, queue, onSend, setQueue])

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
  /**
   * Second click on a row already marked "next": send it right now.
   *
   * No `onInterrupt()` here — the backend already interrupts the running
   * generation when a user message arrives mid-stream (`chat/manager.rs`:
   * `interrupt_flag.store(true)` + an interrupt frame on the CLI's stdin).
   * Interrupting from the client too would race that path for nothing.
   *
   * `takeById` removes and returns in one step, so what is dispatched is exactly
   * what left the queue — a read-then-filter could send text a concurrent edit
   * had already replaced.
   *
   * Disarms the auto-flush latch: this send IS the turn's message. Without
   * that, the `result` of the response it interrupts would immediately flush a
   * second message into the same turn.
   */
  const handleQueueSendNow = useCallback(
    (id: string) => {
      const { taken, rest } = takeById(store.get(chatMessageQueueAtom), id)
      if (!taken) return
      flushArmedRef.current = false
      setQueue(rest)
      onSend(taken.text, taken.attachmentIds)
    },
    [store, setQueue, onSend],
  )

  const action = deriveInputAction({
    hasText: value.trim().length > 0,
    isStreaming,
    isStopping,
    disabled: disabled ?? false,
    sendDecision,
    deferredSend,
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
    <div
      // No top border: the composer box already has its own outline, so a
      // separator above it only drew a second, competing line. The gap between
      // the transcript and that outline is the demarcation.
      className="relative px-3 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex flex-col gap-1"
      // The composer is the drop target rather than the whole panel: it is
      // where the attachments then appear, so the drop lands where the result
      // shows up instead of somewhere up in the transcript.
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFiles && (
        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-indigo-400/60 bg-[#14161a]/90 pointer-events-none">
          <span className="flex items-center gap-1.5 text-xs text-indigo-300">
            <Paperclip className="w-3.5 h-3.5" />
            Drop to attach
          </span>
        </div>
      )}
      <MessageQueueBar
        queue={queue}
        onEdit={handleQueueEdit}
        onDelete={handleQueueDelete}
        onPrioritize={handleQueuePrioritize}
        onSendNow={handleQueueSendNow}
      />
      {/* Attachment thumbnails — directly above the textarea, part of the
          message being composed (unlike the queue bar, which floats over the
          conversation because those messages are not being composed any more). */}
      <Attachments
        attachments={attachments}
        onRemove={handleRemoveAttachment}
        pendingSend={deferredSend}
      />

      {/* The composer is ONE box: the text on top, and under it, inside the
          same border, every control that shapes the message — attach, mode,
          model, background tasks, auto-continue, send. It used to be a toolbar
          row above plus a bar below; merging them saves a row of height and
          keeps the eye on one place. The border and focus ring live on the
          wrapper (`focus-within`), the textarea itself is transparent. */}
      <div
        className={`flex flex-col rounded-xl bg-white/[0.04] border border-white/[0.06] p-1 transition-colors focus-within:border-indigo-500/40 ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFilesPicked}
          className="hidden"
          // No `accept`: the backend takes all formats and answers 415 for the
          // ones it cannot read. A client-side allow-list would silently hide
          // files the server would in fact have accepted.
        />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
          rows={2}
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
          className="block w-full resize-none bg-transparent border-0 px-2 pt-1.5 pb-1 text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
        />

        {/* Controls row. `relative` makes it the model picker's containing
            block on mobile, so the picker spans the composer's width. */}
        <div className="relative flex items-center gap-1.5 pt-0.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            aria-label="Attach a file"
            title="Attach a file"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-colors disabled:opacity-30"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          {/* Permission mode selector */}
          <div className="flex items-center gap-1.5" ref={dropdownRef}>
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
          <div className="ml-auto flex items-center gap-2">
            <BackgroundTasksIndicator />

            {/* Auto-continue toggle */}
            <div className="flex items-center gap-1.5">
              <span className={`hidden sm:inline text-[10px] ${autoContinue ? 'text-gray-400' : 'text-gray-500'} transition-colors`}>Auto</span>
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

          {/* One slot for both affordances — see `deriveInputAction`. */}
          <button
            onClick={action === 'stop' ? handleStop : handleSend}
            disabled={action === 'idle' || action === 'stopping' || action === 'waiting'}
            aria-label={describeAction(action, sendDecision)}
            title={describeAction(action, sendDecision)}
            data-action={action}
            className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
              action === 'stop'
                ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30 active:bg-red-600/50 active:scale-95'
                : action === 'stopping'
                  ? 'bg-red-600/30 text-red-300 cursor-wait'
                  : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 disabled:opacity-30'
            }`}
          >
            {/* `waiting` and `stopping` share the spinner: both mean "held,
                not lost". They differ in what is being waited on, which the
                title says. */}
            {action === 'stopping' || action === 'waiting' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : action === 'stop' ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
})
