import { useMemo, useRef, useState } from 'react'
import {
  defaultModelForFamily,
  sortByVersionAscending,
  type ModelDefinition,
  type ModelFamilyGroup,
} from '@/constants/models'

export interface ModelSelectOptions {
  /** Close the picker after selecting (true for a deliberate row click). */
  close: boolean
}

interface ModelFamilyPickerProps {
  groups: readonly ModelFamilyGroup[]
  activeModelId: string
  loaded: boolean
  onSelect: (modelId: string, options: ModelSelectOptions) => void
}

/**
 * Model picker: one line per family (Opus, Fable, Sonnet…), version chosen on
 * that same line.
 *
 * Toggle and slider are ONE control: a stepped track. Two versions give a
 * two-position track (a toggle), three or more give more stops (a slider).
 * Same place, same look, same gestures — tap a stop or drag, the choice is
 * committed on release; arrow keys work the same way. A single version shows
 * no track at all.
 */
export function ModelFamilyPicker({ groups, activeModelId, loaded, onSelect }: ModelFamilyPickerProps) {
  if (groups.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-gray-500">
        {loaded ? 'No models available' : 'Loading models…'}
      </div>
    )
  }

  return (
    <div className="py-1">
      {groups.map((group) => (
        <FamilyRow key={group.family} group={group} activeModelId={activeModelId} onSelect={onSelect} />
      ))}
    </div>
  )
}

interface FamilyRowProps {
  group: ModelFamilyGroup
  activeModelId: string
  onSelect: (modelId: string, options: ModelSelectOptions) => void
}

function FamilyRow({ group, activeModelId, onSelect }: FamilyRowProps) {
  const versions = useMemo(() => sortByVersionAscending(group.models), [group.models])
  const isActiveFamily = versions.some((m) => m.id === activeModelId)

  // A previewed position only means something relative to the active model it
  // was made under. Recording that model alongside it lets the preview go
  // stale by itself when the active model changes from outside (another row,
  // a server default, a mid-session switch confirmed by the backend) — the row
  // then falls back to the derived default, with no effect syncing props.
  const [preview, setPreview] = useState<{ id: string; underActive: string } | null>(null)
  const shownId =
    preview && preview.underActive === activeModelId
      ? preview.id
      : defaultModelForFamily(versions, activeModelId)?.id

  const shown = versions.find((m) => m.id === shownId) ?? versions[versions.length - 1]
  const shownIndex = Math.max(0, versions.findIndex((m) => m.id === shown.id))

  // Only ever send a selection that actually changes the model. In an active
  // session a selection is a mid-session model switch sent over the socket,
  // so a no-op must not reach it.
  const commit = (model: ModelDefinition, options: ModelSelectOptions) => {
    if (model.id !== activeModelId || options.close) onSelect(model.id, options)
  }

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1 ${isActiveFamily ? 'bg-white/[0.05]' : ''}`}
      data-testid={`model-family-${group.family}`}
    >
      <button
        type="button"
        onClick={() => commit(shown, { close: true })}
        className={`flex items-center gap-2 w-[4.25rem] shrink-0 self-stretch text-left text-xs rounded ${
          isActiveFamily ? 'text-gray-100' : 'text-gray-400 hover:text-gray-200'
        }`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${group.dotColor}`} aria-hidden="true" />
        <span className="truncate">{group.label}</span>
      </button>

      {/* Same height as the track even when empty, so a single-version family
          keeps the same row rhythm as the others. */}
      <div className="flex-1 min-w-0 h-9 sm:h-6">
        {versions.length >= 2 && (
          <VersionTrack
            label={group.label}
            thumbColor={group.dotColor}
            versions={versions}
            index={shownIndex}
            onPreview={(i) => setPreview({ id: versions[i].id, underActive: activeModelId })}
            onCancel={() => setPreview(null)}
            onCommit={(i) => commit(versions[i], { close: false })}
          />
        )}
      </div>

      <span
        className={`w-7 shrink-0 text-right font-mono text-[11px] ${
          shown.tier === 'legacy' ? 'text-gray-500' : 'text-gray-300'
        }`}
        title={shown.tier === 'legacy' ? `${shown.fullLabel} (legacy)` : shown.fullLabel}
      >
        {shown.version}
      </span>
    </div>
  )
}

/** Keys that move the thumb. Only these commit on key-up (see `onKeyUp`). */
const STEP_KEYS: Record<string, (index: number, last: number) => number> = {
  ArrowLeft: (i) => i - 1,
  ArrowDown: (i) => i - 1,
  PageDown: (i) => i - 1,
  ArrowRight: (i) => i + 1,
  ArrowUp: (i) => i + 1,
  PageUp: (i) => i + 1,
  Home: () => 0,
  End: (_, last) => last,
}

interface VersionTrackProps {
  label: string
  /** Literal Tailwind bg class for the thumb (the family's dot color). */
  thumbColor: string
  versions: readonly ModelDefinition[]
  index: number
  onPreview: (index: number) => void
  onCommit: (index: number) => void
  onCancel: () => void
}

/**
 * Stepped version track — the single control behind both "toggle" (2 stops)
 * and "slider" (3+ stops).
 *
 * Moving only PREVIEWS; the choice is committed once, on release. Committing
 * on every move would, in an active session, fire one mid-session model switch
 * per stop crossed and litter the conversation.
 *
 * Height: the visible rail is a 1px line, so the element's height is pure hit
 * area — taller below `sm` (36px) where it is operated by a finger, compact
 * (24px) where it is operated by a mouse.
 *
 * Touch: `touch-pan-y` leaves vertical swipes to the browser so the list still
 * scrolls when a swipe starts on a track; horizontal drags come to us. When
 * the browser takes a gesture over for scrolling it sends `pointercancel`, and
 * the preview is discarded rather than committed.
 */
function VersionTrack({ label, thumbColor, versions, index, onPreview, onCommit, onCancel }: VersionTrackProps) {
  const railRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const last = versions.length - 1

  const clamp = (i: number) => Math.min(last, Math.max(0, i))

  const indexAt = (clientX: number) => {
    const rect = railRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return index
    return clamp(Math.round(((clientX - rect.left) / rect.width) * last))
  }

  const percent = (i: number) => (last === 0 ? 0 : (i / last) * 100)

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`${label} version`}
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={index}
      aria-valuetext={versions[index].version}
      className="relative h-9 sm:h-6 cursor-pointer select-none touch-pan-y rounded outline-none focus-visible:ring-1 focus-visible:ring-white/20"
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture?.(e.pointerId)
        onPreview(indexAt(e.clientX))
      }}
      onPointerMove={(e) => {
        if (dragging.current) onPreview(indexAt(e.clientX))
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return
        dragging.current = false
        // Read the position from the release event itself rather than from
        // `index`, which may not have re-rendered since the last move.
        onCommit(indexAt(e.clientX))
      }}
      onPointerCancel={() => {
        dragging.current = false
        onCancel()
      }}
      onKeyDown={(e) => {
        const step = STEP_KEYS[e.key]
        if (!step) return
        e.preventDefault()
        onPreview(clamp(step(index, last)))
      }}
      // Only keys that move the thumb commit. Any other key-up — notably Tab
      // landing on the track — must not, or merely tabbing through the picker
      // would switch to whatever version another family shows.
      onKeyUp={(e) => {
        if (STEP_KEYS[e.key]) onCommit(index)
      }}
    >
      <div ref={railRef} className="absolute inset-y-0 left-1.5 right-1.5" data-testid="version-rail">
        <div className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-white/15" />
        {versions.map((m, i) => (
          <span
            key={m.id}
            className="absolute top-1/2 w-1 h-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30"
            style={{ left: `${percent(i)}%` }}
          />
        ))}
        <div
          className={`absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow ${thumbColor} transition-[left] duration-150 ease-out`}
          style={{ left: `${percent(index)}%` }}
        />
      </div>
    </div>
  )
}
