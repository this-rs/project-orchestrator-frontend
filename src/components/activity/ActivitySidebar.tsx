/**
 * ActivitySidebar — left rail of the Live Activity Hub.
 *
 * Drives the `activityFiltersAtom` (project, entity types, statuses, time
 * range). All state lives in Jotai so the page header / cards can react to
 * changes without prop drilling.
 *
 * Layout
 * - Project picker (Select) — sets `selectedProjectIdAtom`
 * - Entity-type multi-toggle (Plan / Protocol / Chat)
 * - Status multi-toggle (Running / Completed / Failed / Cancelled / Budget exceeded)
 * - Time-range radio group (1h / 24h / 7d / 30d / All)
 *
 * Verification
 *   Storybook isn't wired up in this repo; the manual test is: change a
 *   filter atom in devtools → `useActivityStream` re-fetches and the grid
 *   re-renders. The page header also surfaces a "Reset filters" affordance.
 */

import { useEffect, useMemo, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Filter, Check, RotateCcw } from 'lucide-react'
import {
  ALL_ENTITY_KINDS,
  ALL_STATUSES,
  ALL_TIME_RANGES,
  entityKindLabel,
  selectedEntityTypesAtom,
  selectedProjectIdAtom,
  selectedStatusesAtom,
  statusLabel,
  timeRangeAtom,
  timeRangeLabel,
  type ActivityEntityKind,
  type ActivityStatusFilter,
} from '@/atoms'
import { Select } from '@/components/ui'
import { workspacesApi } from '@/services/workspaces'
import { useWorkspaceSlug } from '@/hooks'
import type { Project } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toggleInArray<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]
}

// ---------------------------------------------------------------------------
// Section primitives
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-widest text-gray-500 px-1 mb-2">
      {children}
    </div>
  )
}

interface ToggleChipProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  variant?: 'default' | 'status'
  statusKey?: ActivityStatusFilter
}

function ToggleChip({ active, onClick, children, variant = 'default', statusKey }: ToggleChipProps) {
  // Status-specific dot colors
  const dot =
    variant === 'status' && statusKey
      ? {
          running: 'bg-blue-400',
          completed: 'bg-green-400',
          failed: 'bg-red-400',
          cancelled: 'bg-gray-400',
          budget_exceeded: 'bg-amber-400',
        }[statusKey]
      : null

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`
        w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors
        ${active
          ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
          : 'bg-white/[0.03] text-gray-400 border border-transparent hover:bg-white/[0.06] hover:text-gray-200'}
      `}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      <span className="flex-1 text-left">{children}</span>
      {active && <Check className="w-3.5 h-3.5 text-indigo-400" strokeWidth={2.5} />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Project picker — workspace-scoped projects fetched on mount.
// ---------------------------------------------------------------------------

function ProjectPicker() {
  const wsSlug = useWorkspaceSlug()
  const [projectId, setProjectId] = useAtom(selectedProjectIdAtom)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    workspacesApi
      .listProjects(wsSlug, controller.signal)
      .then((data) => {
        setProjects(data)
        // Auto-select the first project if none chosen yet — saves users a click
        // and lets the snapshot hook fire as soon as the page mounts.
        if (data.length > 0 && !projectId) {
          setProjectId(data[0].id)
        }
        // If the currently selected project no longer exists in this workspace,
        // clear the atom so the hook resets.
        if (projectId && !data.some((p) => p.id === projectId)) {
          setProjectId(data[0]?.id ?? null)
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setProjects([])
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
    // We deliberately depend on `wsSlug` only — re-running on `projectId`
    // would create a feedback loop with our own setter above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsSlug])

  const options = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name })),
    [projects],
  )

  return (
    <div>
      <SectionTitle>Project</SectionTitle>
      <Select
        options={options}
        value={projectId ?? undefined}
        onChange={(v) => setProjectId(v)}
        placeholder={loading ? 'Loading projects…' : 'Select a project'}
        disabled={loading || options.length === 0}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entity-type multi-toggle
// ---------------------------------------------------------------------------

function EntityTypeFilter() {
  const [selected, setSelected] = useAtom(selectedEntityTypesAtom)
  const toggle = (kind: ActivityEntityKind) => setSelected(toggleInArray(selected, kind))
  return (
    <div>
      <SectionTitle>Type</SectionTitle>
      <div className="space-y-1">
        {ALL_ENTITY_KINDS.map((kind) => (
          <ToggleChip key={kind} active={selected.includes(kind)} onClick={() => toggle(kind)}>
            {entityKindLabel(kind)}
          </ToggleChip>
        ))}
      </div>
      {selected.length === 0 && (
        <p className="text-[10px] text-gray-600 px-1 mt-1.5">All types shown</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status multi-toggle
// ---------------------------------------------------------------------------

function StatusFilter() {
  const [selected, setSelected] = useAtom(selectedStatusesAtom)
  const toggle = (s: ActivityStatusFilter) => setSelected(toggleInArray(selected, s))
  return (
    <div>
      <SectionTitle>Status</SectionTitle>
      <div className="space-y-1">
        {ALL_STATUSES.map((s) => (
          <ToggleChip
            key={s}
            active={selected.includes(s)}
            onClick={() => toggle(s)}
            variant="status"
            statusKey={s}
          >
            {statusLabel(s)}
          </ToggleChip>
        ))}
      </div>
      {selected.length === 0 && (
        <p className="text-[10px] text-gray-600 px-1 mt-1.5">All statuses shown</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Time-range radio — single-select, persisted.
// ---------------------------------------------------------------------------

function TimeRangeFilter() {
  const [range, setRange] = useAtom(timeRangeAtom)
  return (
    <div>
      <SectionTitle>Time range</SectionTitle>
      <div className="space-y-1">
        {ALL_TIME_RANGES.map((r) => (
          <ToggleChip key={r} active={range === r} onClick={() => setRange(r)}>
            {timeRangeLabel(r)}
          </ToggleChip>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reset bar
// ---------------------------------------------------------------------------

function ResetBar() {
  const [entityTypes, setEntityTypes] = useAtom(selectedEntityTypesAtom)
  const [statuses, setStatuses] = useAtom(selectedStatusesAtom)
  const [range, setRange] = useAtom(timeRangeAtom)
  const isDefault =
    entityTypes.length === 0 &&
    statuses.length === 1 &&
    statuses[0] === 'running' &&
    range === '24h'

  if (isDefault) return null

  return (
    <button
      type="button"
      onClick={() => {
        setEntityTypes([])
        setStatuses(['running'])
        setRange('24h')
      }}
      className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] rounded-md transition-colors"
    >
      <RotateCcw className="w-3.5 h-3.5" />
      Reset filters
    </button>
  )
}

// ---------------------------------------------------------------------------
// Sidebar shell
// ---------------------------------------------------------------------------

export interface ActivitySidebarProps {
  /** Optional summary chip — e.g. "12 active" — rendered at the top. */
  summary?: React.ReactNode
  className?: string
}

export function ActivitySidebar({ summary, className = '' }: ActivitySidebarProps) {
  // We don't currently need the atom value here — but reading it keeps the
  // sidebar in sync if devtools mutate it, and is cheap.
  useAtomValue(selectedProjectIdAtom)

  return (
    <aside
      className={`flex flex-col gap-5 p-4 bg-surface-raised border border-border-subtle rounded-lg overflow-y-auto ${className}`}
      aria-label="Activity filters"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium text-gray-200">
          <Filter className="w-4 h-4 text-gray-400" />
          Filters
        </h2>
        <ResetBar />
      </div>

      {summary && <div className="text-xs text-gray-400">{summary}</div>}

      <ProjectPicker />
      <EntityTypeFilter />
      <StatusFilter />
      <TimeRangeFilter />
    </aside>
  )
}

export default ActivitySidebar
