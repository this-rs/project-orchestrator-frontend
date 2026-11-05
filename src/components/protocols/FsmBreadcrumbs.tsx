/**
 * FsmBreadcrumbs — Breadcrumb navigation for protocol FSM.
 *
 * Supports two modes:
 *   1. **State path** — shows the ordered states a run has traversed (original)
 *   2. **Drill-down** — shows the protocol hierarchy when navigating into macro-states
 *
 * Props (state path mode):
 *   states       — ordered list of state names the run has traversed
 *   currentState — the state the run is currently in (highlighted)
 *   onStateClick — optional callback when a state crumb is clicked
 *
 * Props (drill-down mode):
 *   hierarchy     — stack of { protocolId, protocolName, parentStateName }
 *   onNavigate    — callback with index to navigate back up the stack
 */

import { ChevronRight, Home } from 'lucide-react'
import { useT } from '@/i18n'
import type { RunStatus } from './RunStatusBadge'

// ============================================================================
// TYPES
// ============================================================================

export interface FsmState {
  name: string
  /** Status of the run when it was in this state (for coloring) */
  status?: RunStatus
  /** Timestamp when this state was entered */
  entered_at?: string
}

export interface FsmHierarchyCrumb {
  protocolId: string
  protocolName: string
  /** The state in the parent protocol that triggered drill-down */
  parentStateName?: string
}

// ============================================================================
// STATE PATH MODE
// ============================================================================

interface StatePathProps {
  mode?: 'state-path'
  /** Ordered list of states visited */
  states: FsmState[]
  /** The currently active state name (will be visually emphasized) */
  currentState?: string | null
  /** Callback when a breadcrumb state is clicked */
  onStateClick?: (stateName: string) => void
  /** Additional CSS class */
  className?: string
}

// ============================================================================
// DRILL-DOWN MODE
// ============================================================================

interface DrillDownProps {
  mode: 'drill-down'
  /** Stack of breadcrumbs representing the protocol hierarchy */
  hierarchy: FsmHierarchyCrumb[]
  /** Called when the user clicks a breadcrumb to navigate back */
  onNavigate: (index: number) => void
  /** Additional CSS class */
  className?: string
}

type FsmBreadcrumbsProps = StatePathProps | DrillDownProps

// ============================================================================
// HELPERS
// ============================================================================

function stateColor(state: FsmState, isCurrent: boolean): string {
  if (isCurrent) {
    switch (state.status) {
      case 'running':   return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
      case 'failed':    return 'text-red-400 bg-red-500/10 border-red-500/30'
      case 'completed': return 'text-green-400 bg-green-500/10 border-green-500/30'
      case 'cancelled': return 'text-gray-500 bg-white/[0.04] border-gray-600/30'
      default:          return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30'
    }
  }
  // Past states — muted style
  return 'text-gray-500 bg-white/[0.03] border-transparent hover:text-gray-400 hover:bg-white/[0.05]'
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FsmBreadcrumbs(props: FsmBreadcrumbsProps) {
  const { t } = useT()
  // ── Drill-down mode ─────────────────────────────────────────────────────
  if (props.mode === 'drill-down') {
    const { hierarchy, onNavigate, className = '' } = props

    if (hierarchy.length === 0) return null

    return (
      <nav
        aria-label={t('siteKnowledge.fsm.hierarchyAria')}
        className={`flex items-center gap-1 text-sm overflow-x-auto scrollbar-thin ${className}`}
      >
        {hierarchy.map((crumb, index) => {
          const isLast = index === hierarchy.length - 1

          return (
            <div key={`${crumb.protocolId}-${index}`} className="flex items-center gap-1 min-w-0 shrink-0">
              {/* Separator */}
              {index > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              )}

              {/* Parent state name (context of how we got here) */}
              {crumb.parentStateName && (
                <>
                  <span className="text-gray-500 truncate text-xs">
                    {crumb.parentStateName}
                  </span>
                  <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                </>
              )}

              {/* Protocol name */}
              {isLast ? (
                <span className="font-medium text-gray-100 truncate flex items-center gap-1.5">
                  {index === 0 && <Home className="w-3.5 h-3.5 flex-shrink-0" />}
                  {crumb.protocolName}
                </span>
              ) : (
                <button
                  onClick={() => onNavigate(index)}
                  className="font-medium text-cyan-400 hover:text-cyan-300 truncate transition-colors flex items-center gap-1.5"
                >
                  {index === 0 && <Home className="w-3.5 h-3.5 flex-shrink-0" />}
                  {crumb.protocolName}
                </button>
              )}
            </div>
          )
        })}
      </nav>
    )
  }

  // ── State path mode (original) ──────────────────────────────────────────
  const { states, currentState, onStateClick, className = '' } = props

  if (states.length === 0) {
    return (
      <div className={`text-xs text-gray-600 italic ${className}`}>
        {t('siteKnowledge.fsm.noStates')}
      </div>
    )
  }

  return (
    <nav
      className={`flex items-center gap-1 overflow-x-auto scrollbar-thin ${className}`}
      aria-label={t('siteKnowledge.fsm.statesAria')}
    >
      {states.map((state, idx) => {
        const isCurrent = state.name === currentState
        const isLast = idx === states.length - 1
        const clickable = !!onStateClick

        return (
          <div key={`${state.name}-${idx}`} className="flex items-center gap-1 shrink-0">
            <button
              onClick={clickable ? () => onStateClick!(state.name) : undefined}
              disabled={!clickable}
              className={`
                inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border transition-colors
                ${stateColor(state, isCurrent)}
                ${clickable ? 'cursor-pointer' : 'cursor-default'}
                ${isCurrent ? 'ring-1 ring-inset ring-white/[0.08]' : ''}
              `}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {state.name}
            </button>

            {/* Separator chevron */}
            {!isLast && (
              <ChevronRight className="w-3 h-3 text-gray-700 shrink-0" aria-hidden />
            )}
          </div>
        )
      })}
    </nav>
  )
}
