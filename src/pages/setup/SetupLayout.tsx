import { useAtom } from 'jotai'
import { useNavigate } from 'react-router-dom'
import { setupStepAtom } from '@/atoms/setup'
import { useDragRegion } from '@/hooks'

const STEPS = [
  { label: 'Infrastructure', icon: ServerIcon },
  { label: 'Authentication', icon: ShieldIcon },
  { label: 'Chat AI', icon: ChatIcon },
  { label: 'Launch', icon: RocketIcon },
]

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

  const isFirst = step === 0
  const isLast = step === STEPS.length - 1

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
      setStep((s) => Math.min(STEPS.length - 1, s + 1))
    }
  }

  const handleClose = () => {
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-white" style={{ backgroundColor: 'var(--surface-base)' }}>
      {/* Header — draggable on Tauri desktop */}
      <div className="border-b border-white/[0.06] px-6 py-4" onMouseDown={onDragMouseDown}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
            <svg
              className="h-5 w-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Project Orchestrator</h1>
            <p className="text-xs text-gray-500">
              {showClose ? 'Configuration' : 'Initial Setup'}
            </p>
          </div>
          {showClose && (
            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-400 transition hover:bg-white/[0.06] hover:text-white"
              title="Back to app"
            >
              <CloseIcon />
              <span className="hidden sm:inline">Close</span>
            </button>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div className="border-b border-white/[0.06] px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <nav className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const isActive = i === step
              const isDone = i < step
              const isClickable = freeNavigation && i !== step

              const stepContent = (
                <>
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition ${
                      isActive
                        ? 'bg-indigo-600 text-white'
                        : isDone
                          ? 'bg-indigo-600/20 text-indigo-400'
                          : 'bg-white/[0.06] text-gray-500'
                    }`}
                  >
                    {isDone ? (
                      <CheckIcon />
                    ) : (
                      <Icon />
                    )}
                  </div>
                  <span
                    className={`hidden text-sm font-medium sm:block ${
                      isActive
                        ? 'text-white'
                        : isDone
                          ? 'text-indigo-400'
                          : 'text-gray-500'
                    } ${isClickable ? 'group-hover:text-white' : ''}`}
                  >
                    {s.label}
                  </span>
                </>
              )

              return (
                <div key={s.label} className="flex flex-1 items-center">
                  {isClickable ? (
                    <button
                      onClick={() => setStep(i)}
                      className="group flex items-center gap-2.5 rounded-lg px-1 py-1 -mx-1 transition hover:bg-white/[0.04]"
                    >
                      {stepContent}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      {stepContent}
                    </div>
                  )}
                  {i < STEPS.length - 1 && (
                    <div
                      className={`mx-3 h-px flex-1 ${
                        isDone ? 'bg-indigo-600/40' : 'bg-white/[0.06]'
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-2xl">{children}</div>
      </div>

      {/* Navigation */}
      {!hideNav && (
        <div className="border-t border-white/[0.06] px-6 py-4">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <button
              onClick={handlePrev}
              disabled={isFirst}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 transition hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <div className="text-xs text-gray-600">
              Step {step + 1} of {STEPS.length}
            </div>
            <button
              onClick={handleNext}
              disabled={nextDisabled}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {nextLabel || (isLast ? 'Finish' : 'Next')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Inline SVG icons (small, no external deps)
// ============================================================================

function ServerIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
    </svg>
  )
}

function RocketIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
