import { useAtom } from 'jotai'
import { useNavigate } from 'react-router-dom'
import { Server, ShieldCheck, MessageSquare, Rocket, Check, X } from 'lucide-react'
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
          <img src="/logo-32.png" alt="Project Orchestrator" className="h-10 w-10 rounded-xl" />
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
// Icon wrappers using lucide-react
// ============================================================================

function ServerIcon() {
  return <Server className="h-4 w-4" />
}

function ShieldIcon() {
  return <ShieldCheck className="h-4 w-4" />
}

function ChatIcon() {
  return <MessageSquare className="h-4 w-4" />
}

function RocketIcon() {
  return <Rocket className="h-4 w-4" />
}

function CheckIcon() {
  return <Check className="h-4 w-4" />
}

function CloseIcon() {
  return <X className="h-4 w-4" />
}
