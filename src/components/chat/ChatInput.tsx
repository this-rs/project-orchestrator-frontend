import { memo, useState, useRef, useCallback, useEffect, useId } from 'react'
import { useAtom, useAtomValue, useStore } from 'jotai'
import { chatAttachmentDeferredSendAtom, chatAttachmentsAtom, chatDraftInputAtom, chatSelectedProjectAtom, chatSessionPermissionOverrideAtom, chatPermissionConfigAtom, chatAutoContinueAtom, chatMessageQueuesAtom, draftKeyFor, chatProviderTargetAtom, chatSessionToolPolicyAtom, chatSessionCapabilitiesAtom, chatSessionImagesCauseAtom, refsEnabledAtom, chatRefLabelsAtom, chatTimelineOpenAtom } from '@/atoms'
import { chatApi } from '@/services/chat'
import { documentsApi } from '@/services/documents'
import { ApiError } from '@/services/api'
import { useIsMobile } from '@/hooks'
import type { ToolPolicyMode } from '@/types/provider'
import {
  COMPOSER_MODE_LABELS,
  COMPOSER_MODE_ORDER,
  MODE_DOT_COLORS,
  trustRequiresSandboxText,
  trustDowngradedText,
  TRUST_FALLBACK_MODE,
  claudeNativeModeLabel,
  isTrustAllowed,
  modeLabelSet,
  readToolPolicyMode,
} from '@/constants/toolPolicy'
import { ChevronDown, Loader2, Paperclip, Square, ArrowRight, ChartNoAxesGantt } from 'lucide-react'
import { ActivityBar, type RunActions } from './ActivityBar'
import type { RunningItem } from './runningActivity'
import { RoutingSelectionMenu } from './RoutingSelectionMenu'
import type { ProviderModelMenu } from './ProviderModelPicker'
import { deriveInputAction, describeAction } from './inputAction'
import { MessageQueueBar } from './MessageQueueBar'
import { shouldEnqueue, type QueueOp, type QueuedMessage } from './messageQueue'
import { Attachments } from './Attachments'
import { RefDropOverlay, useRefDropTarget } from '@/refs/source/useRefDropTarget'
import { ReferenceChip } from './ReferenceChip'
import { COMPOSER_CHIP } from './chipGeometry'
import { RefPicker, refOptionId } from './RefPicker'
import { detectTrigger, isReferenceQuery } from '@/refs/trigger'
import { useActiveKinds } from '@/refs/useActiveKinds'
import { useRefSearch } from '@/refs/useRefSearch'
import { countRefTokens, reconcileRefs, refKey, removeRefFromText } from '@/refs/refState'
import { MAX_REFS_PER_MESSAGE, type ChatReference } from '@/refs/types'
import type { RefSearchItem } from '@/refs/refsApi'
import { findRefTokens, refToken } from '@/utils/messageRefs'
import { useT } from '@/i18n'
import { Button } from '@/components/ui'
import { panelGlass } from '@/components/ui/panelGlass'
import {
  addAttachment,
  createAttachment,
  decideSend,
  describeUploadFailure,
  filesFromClipboard,
  isImageFile,
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
  onSend: (text: string, attachmentIds?: string[], refs?: ChatReference[]) => void
  /**
   * Queue a message behind the running response instead of sending it now.
   * The session holds it and delivers it when the turn ends — the server does,
   * not this component (`useChat.queueMessage`).
   */
  onQueue: (text: string, attachmentIds?: string[], refs?: ChatReference[]) => void
  /** Edit, drop, move to the front or send now one queued message (`useChat.queueOp`). */
  onQueueOp: (action: QueueOp) => void
  onInterrupt: () => void
  isStreaming: boolean
  disabled?: boolean
  /** Current session ID (null = new conversation) */
  sessionId?: string | null
  /** Callback to change permission mode on an active session (mid-session) */
  onChangePermissionMode?: (mode: ToolPolicyMode) => void
  /** Callback to change model on an active session (mid-session) */
  onChangeModel?: (model: string) => void
  /** Start a new conversation — offered where a session is locked on its provider. */
  onNewConversation?: () => void
  /** Callback to toggle auto-continue on an active session (sends WS message to backend) */
  onChangeAutoContinue?: (enabled: boolean) => void
  /**
   * Why `disabled` is set, when the reason is not obvious from the screen (no
   * provider, a deleted instance, a provider that cannot resume). Shown above
   * the box and tied to the textarea: a dead composer always says why.
   */
  disabledReason?: string | null
  /** When set, prefills the textarea and focuses it. Change the object reference to trigger. */
  prefill?: PrefillPayload | null
  /** What is running in this session (see `runningActivity.ts`); shown above the queue. */
  activity?: ReadonlyArray<RunningItem>
  /** Open / stop / dashboard for the detached runs listed in `activity`. */
  runActions?: RunActions
}

/** A stable empty queue, so a conversation without one does not re-run the effects that read it. */
const NO_QUEUE: QueuedMessage[] = []

const NO_REFUSED_IMAGES: string[] = []

/** A stable "nothing runs", so an absent prop does not re-render the bar. */
const NO_ACTIVITY: ReadonlyArray<RunningItem> = []

export const ChatInput = memo(function ChatInput({ onSend, onQueue, onQueueOp, onInterrupt, isStreaming, disabled, disabledReason, sessionId, onChangePermissionMode, onChangeModel, onNewConversation, onChangeAutoContinue, prefill, activity = NO_ACTIVITY, runActions }: ChatInputProps) {
  const [value, setValue] = useAtom(chatDraftInputAtom)
  const isMobile = useIsMobile()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // The composer box: the mobile reference sheet rests on it (state, so the sheet re-renders once it exists).
  const [composerBoxEl, setComposerBoxEl] = useState<HTMLDivElement | null>(null)
  const [modeOverride, setModeOverride] = useAtom(chatSessionPermissionOverrideAtom)
  const [serverConfig, setServerConfig] = useAtom(chatPermissionConfigAtom)
  const autoContinue = useAtomValue(chatAutoContinueAtom)
  const [timelineOpen, setTimelineOpen] = useAtom(chatTimelineOpenAtom)
  const providerTarget = useAtomValue(chatProviderTargetAtom)
  const sessionPolicy = useAtomValue(chatSessionToolPolicyAtom)
  const trustHelpId = useId()
  const refListId = useId()
  const disabledHelpId = useId()
  // Whether the model in front of the composer takes images. Read at add time
  // through the store too (see `addFiles`), this value drives nothing else.
  const acceptsImages = useAtomValue(chatSessionCapabilitiesAtom).images
  // Why not: the model's own limit, or the agent engine not carrying images yet.
  const imagesCause = useAtomValue(chatSessionImagesCauseAtom)
  const { t } = useT()
  /**
   * Images turned away because the model takes none — said next to the
   * attachments. Tagged with the session it happened in, so the notice does
   * not follow the user into another conversation.
   */
  const [refusal, setRefusal] = useState<{ sessionId: string | null | undefined; names: string[] }>({ sessionId, names: [] })
  const refusedImages = refusal.sessionId === sessionId ? refusal.names : NO_REFUSED_IMAGES
  const [showModeDropdown, setShowModeDropdown] = useState(false)
  // Provider and model menus (`ProviderModelPicker`): one open at a time, and
  // never together with the mode menu.
  const [pickerMenu, setPickerMenu] = useState<ProviderModelMenu>(null)
  const [modeJustChanged, setModeJustChanged] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  // The queued messages of THIS composer's conversation — read only. The
  // session holds them and delivers them (`chat/pending_queue.rs`); this
  // component shows the list and forwards the user's actions on it.
  const queue = useAtomValue(chatMessageQueuesAtom)[draftKeyFor(sessionId)] ?? NO_QUEUE
  const prevSessionIdRef = useRef(sessionId)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  // --- Attachments ---
  const store = useStore()

  // --- References (# and @) --- off unless the server announced refs_v1: the composer is then exactly what it was.
  const refsEnabled = useAtomValue(refsEnabledAtom)
  const [refLabels, setRefLabels] = useAtom(chatRefLabelsAtom)
  const [caret, setCaret] = useState(0)
  // Between compositionstart and compositionend (IME) the text is provisional: no trigger, no key handling.
  const [composing, setComposing] = useState(false)
  // Escape closes the picker for THIS trigger; a new `#` opens it again.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [refActive, setRefActive] = useState(0)
  // `closes #42` is prose, not a search: a bare number opens nothing and takes no key.
  const found = refsEnabled && !composing && !disabled ? detectTrigger(value, caret) : null
  const trigger = found && isReferenceQuery(found) ? found : null
  const pickerOpen = trigger !== null && trigger.start !== dismissedAt
  useActiveKinds() // the trigger and the picker follow the kinds the server lists
  const refSearch = useRefSearch({ query: trigger?.query ?? '', kinds: trigger?.kinds, sigil: trigger?.sigil, enabled: pickerOpen })
  const activeRef = Math.min(refActive, refSearch.items.length - 1)
  // The option Enter/Tab would take, and the one aria-activedescendant names: the same thing, or nothing
  // (loading, error and an empty list have none: Enter then sends the message).
  const activeItem = pickerOpen && refSearch.status === 'ready' ? refSearch.items[activeRef] : undefined
  // The listbox exists only with options in it.
  const listOpen = pickerOpen && refSearch.items.length > 0
  // The message holds more distinct references than it may carry: it says so, and nothing is added.
  const [refsOverflow, setRefsOverflow] = useState(false)
  // The chips are the tokens of the text, dressed with what the search taught us.
  const draftRefs = refsEnabled ? reconcileRefs(value, Object.values(refLabels)) : []
  const refsFull = draftRefs.length >= MAX_REFS_PER_MESSAGE
  // What choosing a result did, said to screen readers; a duplicate is also shown (the typed query vanishes, the user must know why).
  const [pickNote, setPickNote] = useState<{ text: string; visible: boolean }>({ text: '', visible: false })
  useEffect(() => {
    if (!pickNote.text) return
    const timer = setTimeout(() => setPickNote({ text: '', visible: false }), 4000)
    return () => clearTimeout(timer)
  }, [pickNote])
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

  // The server default arrives as a legacy Claude string (or a neutral mode):
  // the composer works on the neutral one.
  const serverMode = serverConfig ? readToolPolicyMode(serverConfig.mode) : null
  const effectiveMode: ToolPolicyMode = modeOverride ?? readToolPolicyMode(serverConfig?.mode)
  const modeLabels = COMPOSER_MODE_LABELS[modeLabelSet(providerTarget.isClaudeCode)]
  // `auto` / `dontAsk` exist only in the Claude CLI and have no neutral twin:
  // when the mode in force is one of them, say so instead of showing the
  // neutral mode it was folded into.
  const nativeMode = modeOverride === null
    ? serverConfig?.mode
    : sessionPolicy?.mode === effectiveMode ? sessionPolicy.native_mode : undefined
  const effectiveModeLabel =
    (providerTarget.isClaudeCode ? claudeNativeModeLabel(nativeMode, 'short') : null) ?? modeLabels[effectiveMode]
  const trustAllowed = isTrustAllowed(providerTarget)

  // A `trust` in force (chosen, remembered, or the server default) on a
  // provider without a sandbox would make the server refuse the opening (A35):
  // downgrade it to `ask` as soon as such a provider is targeted, and say so.
  const [trustDowngraded, setTrustDowngraded] = useState(false)
  useEffect(() => {
    if (sessionId) return
    if (effectiveMode === 'trust' && !trustAllowed) {
      setModeOverride(TRUST_FALLBACK_MODE)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a provider change made elsewhere
      setTrustDowngraded(true)
    } else if (trustAllowed) {
      setTrustDowngraded(false)
    }
  }, [effectiveMode, trustAllowed, sessionId, setModeOverride])

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
    if (!showModeDropdown && !pickerMenu) return
    const handler = (e: MouseEvent) => {
      if (showModeDropdown && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModeDropdown(false)
      }
      if (pickerMenu && modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setPickerMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModeDropdown, pickerMenu])

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

  /** The references a text sends: its tokens, with the labels the composer learned. None unless refs_v1. */
  const refsOf = useCallback(
    (text: string): ChatReference[] =>
      store.get(refsEnabledAtom) ? reconcileRefs(text, Object.values(store.get(chatRefLabelsAtom))) : [],
    [store],
  )

  /** Dispatch for real. Only ever called with a list where nothing is in flight. */
  const dispatchSend = useCallback(
    (text: string, list: Attachment[]) => {
      const refs = refsOf(text)
      if (refs.length > 0) onSend(text, readyDocumentIds(list), refs)
      else onSend(text, readyDocumentIds(list))
      setValue('')
      setRefLabels({})
      store.set(chatAttachmentsAtom, [])
      store.set(chatAttachmentDeferredSendAtom, false)
      uploadsRef.current.clear()
    },
    [onSend, setValue, setRefLabels, refsOf, store],
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
      const refs = refsOf(text)
      if (refs.length > 0) onQueue(text, readyDocumentIds(list), refs)
      else onQueue(text, readyDocumentIds(list))
      setRefLabels({})
      // The queued message took the composer's contents with it — text,
      // attachments and any held send: it starts clean for the next one.
      setValue('')
      store.set(chatAttachmentsAtom, [])
      store.set(chatAttachmentDeferredSendAtom, false)
      uploadsRef.current.clear()
    },
    [isStreaming, dispatchSend, onQueue, setValue, setRefLabels, refsOf, store],
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
      // A model that takes no images: an image is turned away HERE, with the
      // reason on screen, instead of being uploaded and silently ignored by
      // the model. Any other document goes through.
      const refused = acceptsImages ? [] : files.filter(isImageFile)
      setRefusal({ sessionId, names: refused.map((f) => f.name || t('chatA-input.composer.imageName')) })
      for (const file of files) {
        if (refused.includes(file)) continue
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
                ? describeUploadFailure(err.status, err.message, t)
                : describeUploadFailure(0, undefined, t)
            settleDeferredSend(
              mutateAttachments((l) =>
                updateAttachment(l, localId, (a) => withFailure(a, message)),
              ),
            )
          })
      }
    },
    [store, selectedProject, sessionId, mutateAttachments, settleDeferredSend, acceptsImages, t],
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

  // A reference dragged from anywhere in the app (refs_v1): same zone, other payload. Files are untouched.
  const refDrop = useRefDropTarget({ stop: true })

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
  // The queued messages are not touched here: they belong to their
  // conversation and the session holds them (`chatMessageQueuesAtom`).
  //
  // Compared against a ref rather than firing on mount: `ChatInput` remounts
  // when the panel switches layout, and that must not wipe an upload in flight.
  //
  // In-flight requests are aborted — they carry the old session_id.
  useEffect(() => {
    if (prevSessionIdRef.current === sessionId) return
    prevSessionIdRef.current = sessionId
    for (const controller of uploadsRef.current.values()) controller.abort()
    uploadsRef.current.clear()
    store.set(chatAttachmentsAtom, [])
    store.set(chatAttachmentDeferredSendAtom, false)
  }, [sessionId, store])

  const handleSend = () => {
    const text = value.trim()
    // A restored draft may hold more tokens than a message may carry: never send a state the wire cannot say.
    if (refsEnabled && countRefTokens(text) > MAX_REFS_PER_MESSAGE) {
      setRefsOverflow(true)
      return
    }
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

  // No auto-flush here. The queue used to be drained by this component, which
  // sent the oldest message when it saw the stream stop: delivery depended on
  // this conversation being the one on screen. The session drains it now.
  const handleQueueEdit = useCallback(
    (id: string, text: string) => onQueueOp({ op: 'edit', id, content: text }),
    [onQueueOp],
  )
  const handleQueueDelete = useCallback((id: string) => onQueueOp({ op: 'remove', id }), [onQueueOp])
  /** First click on a row's send button: it leaves first when the turn ends. Interrupts nothing. */
  const handleQueuePrioritize = useCallback((id: string) => onQueueOp({ op: 'prioritize', id }), [onQueueOp])
  /**
   * Second click, on a row already marked "next": send it right now. The
   * server puts it first and interrupts the running response — the one action
   * on the queue that cuts a response short, which is why it takes two clicks.
   */
  const handleQueueSendNow = useCallback((id: string) => onQueueOp({ op: 'send_now', id }), [onQueueOp])

  const action = deriveInputAction({
    hasText: value.trim().length > 0,
    isStreaming,
    isStopping,
    disabled: disabled ?? false,
    sendDecision,
    deferredSend,
  })

  /** Put the caret back in the textarea (the focus never left it, except after a chip's remove button). */
  const restoreCaret = (pos: number) => {
    setCaret(pos)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus({ preventScroll: true })
      el.setSelectionRange(pos, pos)
    })
  }

  /** A result was chosen: its token replaces what was typed after the `#`, and the caret goes after it. */
  const pickRef = (item: RefSearchItem) => {
    if (!trigger) return
    const ref: ChatReference = { kind: item.kind, id: item.id, label: item.label, subtitle: item.subtitle, entity_status: item.entity_status }
    const already = draftRefs.some((r) => refKey(r) === refKey(ref))
    // At the cap nothing is added (the picker says so); a reference already in the draft is not added twice.
    if (refsFull && !already) {
      setRefsOverflow(true)
      return
    }
    const before = value.slice(0, trigger.start)
    const after = value.slice(trigger.end)
    setPickNote(
      already
        ? { text: t('chatA-input.composer.alreadyIn', { label: item.label }), visible: true }
        : { text: t('chatA-input.composer.added', { label: item.label }), visible: false },
    )
    const token = already ? '' : refToken(ref)
    const gap = token && !after.startsWith(' ') ? ' ' : ''
    setRefLabels((l) => ({ ...l, [refKey(ref)]: ref }))
    setValue(before + token + gap + after)
    setRefActive(0)
    restoreCaret(before.length + token.length + gap.length + (token && after.startsWith(' ') ? 1 : 0))
  }

  const handleRefKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    // IME: the keys belong to the composition (Enter confirms a candidate, it does not pick or send).
    if (composing || e.nativeEvent.isComposing || e.keyCode === 229) return true
    if (pickerOpen) {
      const count = refSearch.items.length
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          // No option to move through: the arrows keep moving the caret.
          if (count === 0) return false
          e.preventDefault()
          setRefActive((activeRef + (e.key === 'ArrowDown' ? 1 : -1) + count) % count)
          return true
        case 'Enter':
        case 'Tab':
          if (activeItem) {
            e.preventDefault()
            pickRef(activeItem)
            return true
          }
          // The previous list is still on screen while the next search runs: the key must not pick from it,
          // and must not send the message under the user's eyes either.
          if (refSearch.status === 'loading' && refSearch.items.length > 0) {
            e.preventDefault()
            return true
          }
          // No active option (loading, failed, empty): the key keeps its usual meaning, Enter sends.
          return false
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          setDismissedAt(trigger.start)
          return true
      }
    }
    // A token goes as one piece: Backspace right after it removes all of it.
    const el = e.currentTarget
    if (e.key === 'Backspace' && el.selectionStart === el.selectionEnd) {
      const token = findRefTokens(value).find((t) => t.end === el.selectionStart)
      if (token) {
        e.preventDefault()
        setValue(value.slice(0, token.start) + value.slice(token.end))
        restoreCaret(token.start)
        return true
      }
    }
    return false
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (refsEnabled && handleRefKeyDown(e)) return
    // On mobile, the on-screen keyboard's return key must insert a real newline —
    // sending is done via the dedicated send button. Let the keypress fall through
    // to the textarea's default behavior (newline) instead of submitting.
    if (isMobile) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSelectMode = (mode: ToolPolicyMode) => {
    // Refused, with the reason shown on the option itself.
    if (mode === 'trust' && !trustAllowed) return
    if (sessionId && onChangePermissionMode) {
      // Active session — send WS message for mid-session mode change
      onChangePermissionMode(mode)
    } else {
      // No session yet — set override atom (used at session creation)
      if (mode === serverMode) {
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

  const handlePickerMenu = useCallback((menu: ProviderModelMenu) => {
    setPickerMenu(menu)
    if (menu) setShowModeDropdown(false)
  }, [])

  return (
    // pb: with viewport-fit=cover, keep the input clear of the home
    // indicator on notched devices (inset collapses to 0 when the
    // keyboard is open, so no double padding).
    <div
      // No top border: the composer box already has its own outline, so a
      // separator above it only drew a second, competing line. The gap between
      // the transcript and that outline is the demarcation.
      // Floats over the transcript (ComposerDock): no background here, and the margins let clicks
      // through to the messages below; only the composer's own blocks take pointer events.
      className="relative px-3 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex flex-col gap-1 pointer-events-none [&>*]:pointer-events-auto"
      // The composer is the drop target rather than the whole panel: it is
      // where the attachments then appear, so the drop lands where the result
      // shows up instead of somewhere up in the transcript.
      onDragEnter={(e) => { handleDragEnter(e); refDrop.zoneProps.onDragEnter(e) }}
      onDragOver={(e) => { handleDragOver(e); refDrop.zoneProps.onDragOver(e) }}
      onDragLeave={(e) => { handleDragLeave(e); refDrop.zoneProps.onDragLeave(e) }}
      onDrop={(e) => { handleDrop(e); refDrop.zoneProps.onDrop(e) }}
    >
      {refDrop.over && <RefDropOverlay />}
      {isDraggingFiles && (
        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-indigo-400/60 bg-[#14161a]/90 pointer-events-none">
          <span className="flex items-center gap-1.5 text-xs text-indigo-300">
            <Paperclip className="w-3.5 h-3.5" />
            {t('chatA-input.composer.drop')}
          </span>
        </div>
      )}
      {/* The tray: what is running, then what is waiting to be sent — ONE card
          above the composer, each half optional. Two stacked cards would draw
          two outlines for one idea ("things in flight around this message"). */}
      {(activity.length > 0 || queue.length > 0) && (
        <div
          // Glass, same recipe as the composer box below it (translucent fill + blur): the
          // transcript scrolls under the dock, and a near-transparent fill left the tray's
          // text drawn straight over the messages behind it.
          className="rounded-xl border border-white/[0.1] bg-surface-base/55 backdrop-blur-md backdrop-saturate-150 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/[0.06]"
          data-testid="composer-tray"
        >
          <ActivityBar items={activity} runActions={runActions} />
          <MessageQueueBar
            bare
            queue={queue}
            onEdit={handleQueueEdit}
            onDelete={handleQueueDelete}
            onPrioritize={handleQueuePrioritize}
            onSendNow={handleQueueSendNow}
          />
        </div>
      )}
      {/* Attachment thumbnails — directly above the textarea, part of the
          message being composed (unlike the queue bar, which floats over the
          conversation because those messages are not being composed any more). */}
      <Attachments
        attachments={attachments}
        onRemove={handleRemoveAttachment}
        pendingSend={deferredSend}
      />
      {refusedImages.length > 0 && (
        <p
          role="alert"
          data-testid="images-refused"
          className={`rounded-lg border border-amber-500/30 ${panelGlass.warning} px-2.5 py-1.5 text-[11px] text-amber-200`}
        >
          {t(imagesCause === 'harness' ? 'session.images.harness' : 'session.images.model', { names: refusedImages.join(', ') })}
        </p>
      )}
      {trustDowngraded && !sessionId && (
        <p
          role="status"
          data-testid="trust-downgraded"
          className={`flex items-start justify-between gap-2 rounded-lg border border-amber-500/30 ${panelGlass.warning} px-2.5 py-1.5 text-[11px] text-amber-200`}
        >
          <span className="min-w-0">{trustDowngradedText()}</span>
          <button
            type="button"
            onClick={() => setTrustDowngraded(false)}
            aria-label={t('chatA-input.composer.close')}
            className="shrink-0 rounded px-1 text-amber-200/80 hover:bg-amber-500/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300"
          >
            ×
          </button>
        </p>
      )}
      {disabled && disabledReason && (
        <p
          id={disabledHelpId}
          data-testid="composer-disabled-reason"
          className="rounded-lg border border-white/[0.1] bg-surface-base/80 px-2.5 py-1.5 text-[11px] text-gray-300"
        >
          {disabledReason}
        </p>
      )}

      {/* The composer is ONE box: the text on top, and under it, inside the
          same border, every control that shapes the message — attach, mode,
          model, background tasks, auto-continue, send. It used to be a toolbar
          row above plus a bar below; merging them saves a row of height and
          keeps the eye on one place. The border and focus ring live on the
          wrapper (`focus-within`), the textarea itself is transparent. */}
      <div
        // Glass: a translucent fill and a blur, so the transcript scrolling under the box stays
        // legible but soft. (It used to be a flat bg-white/[0.04] on top of a strip.)
        ref={setComposerBoxEl}
        className={`flex flex-col rounded-xl bg-surface-base/55 backdrop-blur-md backdrop-saturate-150 border border-white/[0.1] shadow-lg shadow-black/20 p-1 transition-colors focus-within:border-indigo-500/40 ${
          disabled ? 'opacity-50' : ''
        }${refsEnabled ? ' relative' : ''}`}
      >
        {pickerOpen && (
          <RefPicker
            listId={refListId}
            search={refSearch}
            activeIndex={activeRef}
            kindFilter={trigger?.kinds?.[0]}
            sigil={trigger?.sigil}
            needsProject={trigger?.sigil === '@' && !selectedProject}
            full={refsFull}
            isInDraft={(item) => draftRefs.some((r) => refKey(r) === refKey(item))}
            onPick={pickRef}
            onHover={setRefActive}
            sheet={isMobile}
            anchor={composerBoxEl}
            onClose={() => {
              // Focus first: focusing the composer re-arms the picker, closing comes after.
              textareaRef.current?.focus()
              if (trigger) setDismissedAt(trigger.start)
            }}
          />
        )}
        {refsEnabled && (
          <p
            role="status"
            aria-live="polite"
            data-testid="refs-limit-notice"
            className={refsOverflow ? 'm-0 px-2 pt-1 text-[11px] text-amber-300' : 'sr-only'}
          >
            {refsOverflow ? t('chatA-input.composer.maxRefs', { max: MAX_REFS_PER_MESSAGE }) : ''}
          </p>
        )}
        {refsEnabled && (
          <p role="status" aria-live="polite" aria-atomic="true" data-testid="refs-pick-announcer" className="sr-only">
            {pickNote.text}
          </p>
        )}
        {pickNote.visible && (
          <p aria-hidden="true" data-testid="refs-pick-note" className="m-0 px-2 pt-1 text-xs text-amber-200">
            {pickNote.text}
          </p>
        )}
        {draftRefs.length > 0 && (
          <ul aria-label={t('chatA-input.composer.references')} className="m-0 flex max-h-20 list-none flex-wrap gap-1 overflow-y-auto px-1.5 pt-1">
            {draftRefs.map((r) => (
              <li key={refKey(r)}>
                <ReferenceChip
                  draft
                  reference={r}
                  onRemove={(ref) => {
                    const next = removeRefFromText(value, ref)
                    setValue(next)
                    // The remove button is about to vanish: the focus goes back to the text, at the end of it.
                    restoreCaret(next.length)
                  }}
                />
              </li>
            ))}
          </ul>
        )}
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
          onChange={(e) => {
            if (refsEnabled) {
              // A 21st distinct token is refused (a message holds at most MAX_REFS_PER_MESSAGE): the text stays as it was, and says why.
              const asked = countRefTokens(e.target.value)
              if (asked > MAX_REFS_PER_MESSAGE && asked > countRefTokens(value)) {
                setRefsOverflow(true)
                return
              }
              setRefsOverflow(false)
            }
            setValue(e.target.value)
            if (refsEnabled) {
              setCaret(e.target.selectionStart)
              setRefActive(0)
              // A new `#` (or none left) re-arms the picker that Escape closed.
              if (detectTrigger(e.target.value, e.target.selectionStart)?.start !== dismissedAt) setDismissedAt(null)
            }
          }}
          onKeyDown={handleKeyDown}
          {...(refsEnabled
            ? {
                // ARIA combobox: the focus stays here, the active option is named by aria-activedescendant.
                role: 'combobox' as const,
                'aria-haspopup': 'listbox' as const,
                'aria-autocomplete': 'list' as const,
                'aria-expanded': listOpen,
                'aria-controls': listOpen ? refListId : undefined,
                'aria-activedescendant': activeItem ? refOptionId(refListId, activeRef) : undefined,
                onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => setCaret(e.currentTarget.selectionStart),
                onCompositionStart: () => setComposing(true),
                onCompositionEnd: (e: React.CompositionEvent<HTMLTextAreaElement>) => {
                  setComposing(false)
                  setCaret(e.currentTarget.selectionStart)
                },
                onBlur: () => trigger && setDismissedAt(trigger.start),
                // Back in the field, the same `#` offers its results again.
                onFocus: () => setDismissedAt(null),
              }
            : {})}
          onPaste={handlePaste}
          disabled={disabled}
          aria-describedby={disabled && disabledReason ? disabledHelpId : undefined}
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
          placeholder={t('chatA-input.composer.placeholder')}
          className="block w-full resize-none bg-transparent border-0 px-2 pt-1.5 pb-1 text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
        />

        {/* Controls row. `relative` makes it the model picker's containing
            block on mobile, so the picker spans the composer's width. */}
        <div className="relative flex items-center gap-1.5 pt-0.5" data-testid="composer-controls">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            aria-label={t('chatA-input.composer.attach')}
            title={t('chatA-input.composer.attach')}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-colors disabled:opacity-30"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          {/* The chips (mode, then provider and model) share ONE flexible group
              on ONE line: the target chip is the one that truncates, the mode
              chip keeps its size, attach and send keep their place at both ends.
              The group used to wrap onto a second line when the row was too
              narrow, which doubled the height of the composer for the same
              information. */}
          <div data-testid="composer-chips" className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5">
          {/* Permission mode selector */}
          <div className="flex shrink-0 items-center gap-1.5" ref={dropdownRef}>
            <div className="relative">
              <button
                onClick={() => { setShowModeDropdown(!showModeDropdown); setPickerMenu(null) }}
                data-testid="mode-chip"
                className={`${COMPOSER_CHIP} ${
                  modeJustChanged
                    ? 'border-indigo-400/50 ring-1 ring-indigo-400/30'
                    : 'border-white/[0.08]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${MODE_DOT_COLORS[effectiveMode]}`} />
                <span>{effectiveModeLabel}</span>
                {modeOverride && !sessionId && (
                  <span className="hidden sm:inline text-[8px] text-indigo-400 ml-0.5">{t('chatA-input.composer.override')}</span>
                )}
                <ChevronDown className="w-2.5 h-2.5 text-gray-500" />
              </button>
              {showModeDropdown && (
                <div className={`absolute bottom-full left-0 mb-1 z-20 ${trustAllowed ? 'w-40' : 'w-56'} bg-surface-popover border border-white/[0.08] rounded-lg shadow-xl py-1`}>
                  {COMPOSER_MODE_ORDER.map((mode) => {
                    const isActive = effectiveMode === mode
                    const isDefault = mode === serverMode
                    // Kept focusable and announced as disabled, with the reason
                    // as visible text: a greyed-out option that says nothing
                    // reads as a bug.
                    const refused = mode === 'trust' && !trustAllowed
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleSelectMode(mode)}
                        aria-disabled={refused || undefined}
                        aria-describedby={refused ? trustHelpId : undefined}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          refused
                            ? 'text-gray-500 cursor-not-allowed'
                            : isActive ? 'text-gray-100 bg-white/[0.04]' : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${refused ? 'bg-gray-600' : MODE_DOT_COLORS[mode]}`} />
                          <span>{modeLabels[mode]}</span>
                          {isDefault && <span className="text-[9px] text-gray-600 ml-auto">{t('chatA-input.composer.default')}</span>}
                        </span>
                        {refused && (
                          <span id={trustHelpId} className="mt-0.5 block text-[10px] leading-snug text-gray-500">
                            {trustRequiresSandboxText()}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Provider (when the server has several) and model — always visible
              (new conversation + active session). */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5" ref={modelDropdownRef}>
            <RoutingSelectionMenu
              sessionId={sessionId}
              open={pickerMenu}
              onOpenChange={handlePickerMenu}
              onChangeModel={onChangeModel}
              onNewConversation={onNewConversation}
            />
          </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Timeline strip toggle */}
            <Button
              icon
              size="sm"
              type="button"
              onClick={() => setTimelineOpen((v) => !v)}
              aria-pressed={timelineOpen}
              aria-label={t('session.timeline.title')}
              title={timelineOpen ? t('session.timeline.hide') : t('session.timeline.show')}
              className={timelineOpen ? 'text-indigo-300' : 'text-gray-400'}
            >
              <ChartNoAxesGantt className="size-4" aria-hidden="true" />
            </Button>
            {/* Auto-continue toggle */}
            <div className="flex items-center gap-1.5">
              <span className={`hidden sm:inline text-[10px] ${autoContinue ? 'text-gray-400' : 'text-gray-500'} transition-colors`}>{t('chatA-input.composer.auto')}</span>
              <button
                onClick={() => onChangeAutoContinue?.(!autoContinue)}
                className={`relative w-7 h-3.5 rounded-full transition-colors duration-200 ${
                  autoContinue ? 'bg-emerald-500/70' : 'bg-gray-600/50'
                }`}
                title={autoContinue ? t('chatA-input.composer.autoOn') : t('chatA-input.composer.autoOff')}
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
            aria-label={describeAction(action, sendDecision, t)}
            title={describeAction(action, sendDecision, t)}
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
