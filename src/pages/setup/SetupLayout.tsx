import { useAtom } from 'jotai'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { setupStepAtom } from '@/atoms/setup'
import { useDragRegion } from '@/hooks'
import { Button, HaloPointer, ProgressLine, Reveal, focusRing, leadText, pageTitle } from '@/components/ui'
import { SETUP_STEPS, SETUP_TEXT } from './text'

interface SetupLayoutProps {
  children: React.ReactNode
  onNext?: () => void
  onPrev?: () => void
  onFinish?: () => void
  nextDisabled?: boolean
  nextLabel?: string
  hideNav?: boolean
  /** When true, stepper steps are clickable for free navigation (reconfigure mode). */
  freeNavigation?: boolean
  /** When true, show a close button in the header to return to the app (reconfigure mode). */
  showClose?: boolean
}

/**
 * The chrome of the setup assistant — the first screen after the download, so
 * it continues the site: dark, one display title per step with its lead in the
 * site's words, glass buttons, ONE primary (Next). The progress is a segmented
 * `ProgressLine` AND words (« Step 2 of 4 », the list of steps with their
 * state): colour is never the only cue. The step's content arrives once with
 * `Reveal` (allowed here, DESIGN.md § Mouvement « Kit »); nothing else moves.
 *
 * Rendered outside `MainLayout`, so it owns its gutters and mounts the one
 * `HaloPointer` of the screen.
 */
export function SetupLayout({
  children,
  onNext,
  onPrev,
  onFinish,
  nextDisabled = false,
  nextLabel,
  hideNav = false,
  freeNavigation = false,
  showClose = false,
}: SetupLayoutProps) {
  const [step, setStep] = useAtom(setupStepAtom)
  const navigate = useNavigate()
  const onDragMouseDown = useDragRegion()

  const total = SETUP_STEPS.length
  const current = SETUP_STEPS[step] ?? SETUP_STEPS[0]
  const isFirst = step === 0
  const isLast = step === total - 1

  const handlePrev = () => {
    if (onPrev) onPrev()
    else setStep((s) => Math.max(0, s - 1))
  }

  const handleNext = () => {
    if (isLast && onFinish) {
      onFinish()
    } else if (onNext) {
      onNext()
    } else {
      setStep((s) => Math.min(total - 1, s + 1))
    }
  }

  const handleClose = () => {
    navigate(-1)
  }

  // Done steps fill the track; the current one is lighter; what remains is the empty track.
  const share = 100 / total
  const segments = [
    { pct: share * step, className: 'bg-indigo-500' },
    { pct: share, className: 'bg-indigo-500/40' },
  ]
  const blockedId = 'setup-next-blocked'

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-surface-base text-gray-100">
      <HaloPointer />

      {/* Header — draggable on Tauri desktop */}
      <div className="border-b border-white/[0.06] px-4 py-3 md:px-6" onMouseDown={onDragMouseDown}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <img src="/logo-32.png" alt="" aria-hidden="true" className="h-9 w-9 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-200">{SETUP_TEXT.productName}</p>
            <p className="text-xs text-gray-500">{showClose ? SETUP_TEXT.kickerReconfigure : SETUP_TEXT.kickerSetup}</p>
          </div>
          {showClose && (
            <Button variant="ghost" size="sm" onClick={handleClose} aria-label={SETUP_TEXT.closeAria} title={SETUP_TEXT.closeAria}>
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{SETUP_TEXT.close}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Content: progress, the step's title and lead, then the step itself */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-6">
        <div className="mx-auto max-w-3xl pb-10 pt-5 md:pt-8">
          <nav aria-label={SETUP_TEXT.progressLabel} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              <span className="font-medium text-gray-200 tabular-nums">{SETUP_TEXT.stepOf(step + 1, total)}</span>
              {freeNavigation && <span className="text-xs text-gray-500">{SETUP_TEXT.freeNavigationHint}</span>}
            </div>
            <ProgressLine value={Math.round(share * (step + 1))} label={SETUP_TEXT.progressLabel} segments={segments} size="md" />
            <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5">
              {SETUP_STEPS.map((s, i) => {
                const isActive = i === step
                const isDone = i < step
                const isClickable = freeNavigation && !isActive
                const tone = isActive ? 'text-gray-100 font-medium' : isDone ? 'text-indigo-300' : 'text-gray-500'
                const body = (
                  <>
                    {isDone ? (
                      <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                    ) : (
                      <span className="tabular-nums" aria-hidden="true">
                        {i + 1}
                      </span>
                    )}
                    <span>{s.label}</span>
                    {isDone && <span className="sr-only">, {SETUP_TEXT.stepDone}</span>}
                  </>
                )
                return (
                  <li key={s.key} aria-current={isActive ? 'step' : undefined} className={`inline-flex items-center gap-1.5 ${tone}`}>
                    {isClickable ? (
                      <button type="button" onClick={() => setStep(i)} className={`-mx-1 inline-flex min-h-9 items-center gap-1.5 rounded px-1 hover:text-gray-200 ${focusRing}`}>
                        {body}
                      </button>
                    ) : (
                      <span className="inline-flex min-h-9 items-center gap-1.5">{body}</span>
                    )}
                  </li>
                )
              })}
            </ol>
          </nav>

          <Reveal key={current.key} trigger="load" className="mt-6 min-w-0 md:mt-8">
            <header className="min-w-0">
              <h1 className={`${pageTitle} break-words`}>{current.title}</h1>
              <p className={`mt-3 ${leadText}`}>{current.lead}</p>
            </header>
            <div className="mt-8 min-w-0">{children}</div>
          </Reveal>
        </div>
      </div>

      {/* Navigation — the one primary of the screen is Next */}
      {!hideNav && (
        <div className="border-t border-white/[0.06] px-4 py-3 md:px-6" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Button variant="ghost" size="sm" onClick={handlePrev} disabled={isFirst}>
              {SETUP_TEXT.previous}
            </Button>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {nextDisabled && (
                <p id={blockedId} role="status" className="min-w-0 text-xs leading-4 text-gray-400">
                  {SETUP_TEXT.blocked}
                </p>
              )}
              <Button size="sm" onClick={handleNext} disabled={nextDisabled} aria-describedby={nextDisabled ? blockedId : undefined}>
                {nextLabel || (isLast ? SETUP_TEXT.finish : SETUP_TEXT.next)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
