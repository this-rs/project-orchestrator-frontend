import type { ReactNode } from 'react'

type EmptyStateVariant = 'tasks' | 'plans' | 'notes' | 'milestones' | 'projects' | 'search'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  /** Auto-select a themed illustration */
  variant?: EmptyStateVariant
}

export function EmptyState({ icon, title, description, action, variant }: EmptyStateProps) {
  const illustration = variant ? illustrations[variant] : null

  return (
    <div className="empty-state flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-white/[0.06] rounded-2xl">
      {illustration ? (
        <div className="mb-5">{illustration}</div>
      ) : icon ? (
        <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center text-gray-500 mb-4">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-medium text-gray-200 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-400 mb-4 max-w-xs sm:max-w-md">{description}</p>}
      {action}
    </div>
  )
}

// ============================================================================
// Inline SVG illustrations — dark theme, <2KB each, indigo-400 accent
// ============================================================================

const S = 80 // illustration size

const illustrations: Record<EmptyStateVariant, ReactNode> = {
  // Clipboard with empty checklist
  tasks: (
    <svg width={S} height={S} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <rect x="20" y="14" width="40" height="52" rx="4" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" />
      <rect x="28" y="8" width="24" height="10" rx="3" stroke="currentColor" className="text-gray-600" strokeWidth="1.5" fill="var(--color-surface-raised)" />
      <circle cx="32" cy="13" r="1.5" className="fill-gray-600" />
      <line x1="30" y1="30" x2="50" y2="30" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="30" y1="38" x2="46" y2="38" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="30" y1="46" x2="42" y2="46" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
      <circle cx="56" cy="52" r="10" className="fill-indigo-500/10" />
      <path d="M52 52l3 3 5-5" stroke="currentColor" className="text-indigo-400" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Map/route with empty waypoints
  plans: (
    <svg width={S} height={S} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <path d="M20 60V24l20-10 20 10v36l-20-10-20 10z" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="40" y1="14" x2="40" y2="50" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx="30" cy="36" r="3" stroke="currentColor" className="text-gray-600" strokeWidth="1.5" />
      <circle cx="50" cy="30" r="3" stroke="currentColor" className="text-gray-600" strokeWidth="1.5" />
      <circle cx="40" cy="52" r="10" className="fill-indigo-500/10" />
      <path d="M37 52h6M40 49v6" stroke="currentColor" className="text-indigo-400" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),

  // Notepad with empty lines
  notes: (
    <svg width={S} height={S} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <rect x="18" y="12" width="44" height="56" rx="3" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" />
      <line x1="18" y1="22" x2="62" y2="22" stroke="currentColor" className="text-gray-700" strokeWidth="1" />
      <line x1="26" y1="32" x2="54" y2="32" stroke="currentColor" className="text-gray-700/50" strokeWidth="1" strokeDasharray="2 4" />
      <line x1="26" y1="40" x2="50" y2="40" stroke="currentColor" className="text-gray-700/50" strokeWidth="1" strokeDasharray="2 4" />
      <line x1="26" y1="48" x2="46" y2="48" stroke="currentColor" className="text-gray-700/50" strokeWidth="1" strokeDasharray="2 4" />
      <circle cx="22" cy="17" r="1.5" className="fill-gray-600" />
      <circle cx="27" cy="17" r="1.5" className="fill-gray-600" />
      <circle cx="56" cy="56" r="10" className="fill-indigo-500/10" />
      <path d="M53 53l6 6M53 56l3-3" stroke="currentColor" className="text-indigo-400" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),

  // Flag on a timeline
  milestones: (
    <svg width={S} height={S} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <line x1="14" y1="66" x2="66" y2="66" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="30" y1="66" x2="30" y2="24" stroke="currentColor" className="text-gray-600" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M30 24l22 8-22 8" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" fill="var(--color-surface-raised)" strokeLinejoin="round" />
      <circle cx="20" cy="66" r="3" className="fill-gray-700" stroke="currentColor" strokeWidth="1" />
      <circle cx="50" cy="66" r="3" className="fill-gray-700" stroke="currentColor" strokeWidth="1" />
      <circle cx="56" cy="48" r="10" className="fill-indigo-500/10" />
      <path d="M56 44v8M52 48h8" stroke="currentColor" className="text-indigo-400" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),

  // Folder structure
  projects: (
    <svg width={S} height={S} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <path d="M16 24h16l4-6h28a3 3 0 013 3v38a3 3 0 01-3 3H16a3 3 0 01-3-3V27a3 3 0 013-3z" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" />
      <line x1="13" y1="32" x2="67" y2="32" stroke="currentColor" className="text-gray-700" strokeWidth="1" />
      <rect x="24" y="40" width="16" height="2" rx="1" className="fill-gray-700" />
      <rect x="24" y="46" width="12" height="2" rx="1" className="fill-gray-700/50" />
      <circle cx="58" cy="52" r="10" className="fill-indigo-500/10" />
      <path d="M55 52h6M58 49v6" stroke="currentColor" className="text-indigo-400" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),

  // Magnifying glass with empty result
  search: (
    <svg width={S} height={S} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <circle cx="36" cy="36" r="18" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" />
      <line x1="48.5" y1="48.5" x2="62" y2="62" stroke="currentColor" className="text-gray-600" strokeWidth="2" strokeLinecap="round" />
      <line x1="28" y1="36" x2="44" y2="36" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
      <line x1="30" y1="42" x2="40" y2="42" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
      <path d="M32 28l4 4-4 4" stroke="currentColor" className="text-gray-600" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
    </svg>
  ),
}
