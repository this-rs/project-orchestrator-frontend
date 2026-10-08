import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { Hash, Plus } from 'lucide-react'
import { workspacesAtom } from '@/atoms'
import { workspacesApi } from '@/services/workspaces'
import { workspacePath } from '@/utils/paths'
import { Button, ConceptIntro, EntityList, EntityListSkeleton, EntityRow, ErrorState, Fact, Input, RelativeTime, surface } from '@/components/ui'
import type { ConceptExplain } from '@/constants/nomenclature'
import { ProductMark, ScreenHeader, StandaloneScreen, StatusBanner } from '@/pages/setup'
import type { Workspace } from '@/types'

// i18n after #252
const TEXT = {
  title: 'Select a workspace',
  // website features.pillars.projects: « Groups several projects in a workspace that shares context and objectives »
  lead: 'A workspace groups the projects that share a context and objectives. Choose the one to work in.',
  notFound: (slug: string) => `Workspace "${slug}" was not found`,
  notFoundBody: 'It may have been deleted or renamed. Choose another one below.',
  loading: 'Loading workspaces',
  errorTitle: 'Connection error',
  errorBody: 'Failed to load workspaces. Is the backend running?',
  create: 'Create a workspace',
  createSubmit: 'Create',
  creating: 'Creating…',
  cancel: 'Cancel',
  namePlaceholder: 'Workspace name',
  nameLabel: 'Workspace name',
  welcome: 'Welcome to Project Orchestrator',
  welcomeLead: 'Create your first workspace to get started.',
  createFirst: 'Create workspace',
  createFailed: 'Failed to create workspace',
} as const

/**
 * The three sentences that introduce a workspace (DESIGN.md § 5). Inline: the
 * registry has no `workspaces` concept (it lists the entries of ONE workspace's
 * sidebar), so the key is only used to remember the fold.
 */
const WORKSPACE_EXPLAIN: ConceptExplain = {
  what: 'A workspace groups several of your projects that share a context and objectives.',
  why: 'You open one workspace and see its projects, plans, notes and decisions together, and Today shows what waits for you across all of them.',
  different: 'Instead of one folder per project with nothing in between, the projects of a workspace share what was decided, so an Assistant working on one knows what the others settled.',
}

/**
 * Full-page workspace selector shown when:
 * - No workspace slug is in the URL
 * - No previous workspace in localStorage
 * - The stored workspace no longer exists
 */
export function WorkspaceSelectorPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const notFoundSlug = searchParams.get('notFound')
  const setWorkspacesAtom = useSetAtom(workspacesAtom)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadWorkspaces = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await workspacesApi.list({ limit: 100, sort_by: 'name', sort_order: 'asc' })
      setWorkspaces(data.items || [])
    } catch {
      setError(TEXT.errorBody)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  // If only one workspace exists, redirect immediately
  useEffect(() => {
    if (!loading && workspaces.length === 1) {
      navigate(workspacePath(workspaces[0].slug, '/overview'), { replace: true })
    }
  }, [loading, workspaces, navigate])

  const header = (
    <>
      <ScreenHeader kicker={<ProductMark />} title={TEXT.title} lead={TEXT.lead} />
      <ConceptIntro concept={WORKSPACE_EXPLAIN} storageKey="workspaces" className="mt-3" />
    </>
  )

  if (loading) {
    return (
      <StandaloneScreen width="sm">
        {header}
        <div className="mt-6" aria-busy="true" aria-label={TEXT.loading}>
          <EntityListSkeleton rows={3} />
        </div>
      </StandaloneScreen>
    )
  }

  if (error) {
    return (
      <StandaloneScreen width="sm" center>
        <ErrorState title={TEXT.errorTitle} description={error} onRetry={loadWorkspaces} />
      </StandaloneScreen>
    )
  }

  if (workspaces.length === 0) {
    return <EmptyWorkspaceOnboarding navigate={navigate} setWorkspacesAtom={setWorkspacesAtom} />
  }

  return (
    <StandaloneScreen width="sm">
      {header}

      <div className="mt-6 space-y-4">
        {notFoundSlug && (
          <StatusBanner tone="warning" title={TEXT.notFound(notFoundSlug)} role="alert">
            <p>{TEXT.notFoundBody}</p>
          </StatusBanner>
        )}

        <EntityList aria-label="Workspaces">
          {workspaces.map((ws) => (
            <EntityRow
              key={ws.id}
              title={ws.name}
              onClick={() => navigate(workspacePath(ws.slug, '/overview'), { replace: true })}
              leading={
                <span
                  aria-hidden="true"
                  className="flex w-8 h-8 -my-1.5 items-center justify-center rounded-lg bg-white/[0.06] text-sm font-semibold text-gray-300"
                >
                  {ws.name.charAt(0).toUpperCase()}
                </span>
              }
              description={ws.description || undefined}
              trailing={ws.updated_at ? <RelativeTime date={ws.updated_at} prefix="updated " /> : undefined}
              meta={[
                <Fact key="slug" icon={Hash} mono>
                  {ws.slug}
                </Fact>,
              ]}
              chevron
            />
          ))}
        </EntityList>

        <InlineCreateWorkspace navigate={navigate} setWorkspacesAtom={setWorkspacesAtom} />
      </div>
    </StandaloneScreen>
  )
}

/** Shared create-workspace submit logic. */
function useCreateWorkspace(
  navigate: ReturnType<typeof useNavigate>,
  setWorkspacesAtom: (fn: (prev: Workspace[]) => Workspace[]) => void,
) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setCreating(true)
    setError(null)
    try {
      const ws = await workspacesApi.create({ name: trimmed })
      // Optimistic update: add to global atom so WorkspaceRouteGuard finds it
      setWorkspacesAtom((prev) => [...prev, ws])
      navigate(workspacePath(ws.slug, '/overview'), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : TEXT.createFailed)
      setCreating(false)
    }
  }

  const reset = () => {
    setName('')
    setError(null)
  }

  return { name, setName, creating, error, handleCreate, reset }
}

/**
 * The one primary action of the selector, « Create a workspace »; it opens the
 * inline form, whose submit then becomes the primary (the trigger is hidden).
 */
function InlineCreateWorkspace({
  navigate,
  setWorkspacesAtom,
}: {
  navigate: ReturnType<typeof useNavigate>
  setWorkspacesAtom: (fn: (prev: Workspace[]) => Workspace[]) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { name, setName, creating, error, handleCreate, reset } = useCreateWorkspace(navigate, setWorkspacesAtom)

  useEffect(() => {
    if (showForm) inputRef.current?.focus()
  }, [showForm])

  if (!showForm) {
    return (
      <div className="flex justify-center">
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {TEXT.create}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleCreate} className={`${surface} space-y-3 p-4`}>
      <Input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={TEXT.namePlaceholder}
        aria-label={TEXT.nameLabel}
        disabled={creating}
        error={error ?? undefined}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            setShowForm(false)
            reset()
          }}
          disabled={creating}
        >
          {TEXT.cancel}
        </Button>
        <Button type="submit" size="sm" className="flex-1" disabled={creating || !name.trim()} loading={creating}>
          {creating ? TEXT.creating : TEXT.createSubmit}
        </Button>
      </div>
    </form>
  )
}

/**
 * Onboarding screen for first-time users with no workspaces.
 * Shows a friendly welcome message and inline workspace creation form.
 */
function EmptyWorkspaceOnboarding({
  navigate,
  setWorkspacesAtom,
}: {
  navigate: ReturnType<typeof useNavigate>
  setWorkspacesAtom: (fn: (prev: Workspace[]) => Workspace[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { name, setName, creating, error, handleCreate } = useCreateWorkspace(navigate, setWorkspacesAtom)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <StandaloneScreen width="xs" center>
      <ScreenHeader kicker={<ProductMark />} title={TEXT.welcome} lead={TEXT.welcomeLead} />
      <ConceptIntro concept={WORKSPACE_EXPLAIN} storageKey="workspaces" className="mt-3" />

      <form onSubmit={handleCreate} className="mt-8 space-y-3">
        <Input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Workspace"
          aria-label={TEXT.nameLabel}
          disabled={creating}
          error={error ?? undefined}
        />
        <Button type="submit" className="w-full" disabled={creating || !name.trim()} loading={creating}>
          {creating ? TEXT.creating : TEXT.createFirst}
        </Button>
      </form>
    </StandaloneScreen>
  )
}
