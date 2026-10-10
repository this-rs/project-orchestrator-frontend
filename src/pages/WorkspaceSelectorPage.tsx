import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { Hash, Plus } from 'lucide-react'
import { workspacesAtom } from '@/atoms'
import { workspacesApi } from '@/services/workspaces'
import { workspacePath } from '@/utils/paths'
import { useT } from '@/i18n'
import { Button, ConceptIntro, EntityList, EntityListSkeleton, EntityRow, ErrorState, Fact, Input, RelativeTime, surface } from '@/components/ui'
import type { ConceptExplain } from '@/constants/nomenclature'
import { ProductMark, ScreenHeader, StandaloneScreen, StatusBanner } from '@/pages/setup'
import type { Workspace } from '@/types'

/**
 * The three sentences that introduce a workspace (DESIGN.md § 5). Inline: the
 * registry has no `workspaces` concept (it lists the entries of ONE workspace's
 * sidebar), so the key is only used to remember the fold.
 */
function useWorkspaceExplain(): ConceptExplain {
  const { t } = useT()
  return {
    what: t('workspaceSelector.explain.what'),
    why: t('workspaceSelector.explain.why'),
    different: t('workspaceSelector.explain.different'),
  }
}

/**
 * Full-page workspace selector shown when:
 * - No workspace slug is in the URL
 * - No previous workspace in localStorage
 * - The stored workspace no longer exists
 */
export function WorkspaceSelectorPage() {
  const { t } = useT()
  const workspaceExplain = useWorkspaceExplain()
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
      setError(t('workspaceSelector.errorBody'))
    } finally {
      setLoading(false)
    }
  }, [t])

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
      <ScreenHeader kicker={<ProductMark />} title={t('workspaceSelector.title')} lead={t('workspaceSelector.lead')} />
      <ConceptIntro concept={workspaceExplain} storageKey="workspaces" className="mt-3" />
    </>
  )

  if (loading) {
    return (
      <StandaloneScreen width="sm">
        {header}
        <div className="mt-6" aria-busy="true" aria-label={t('workspaceSelector.loading')}>
          <EntityListSkeleton rows={3} />
        </div>
      </StandaloneScreen>
    )
  }

  if (error) {
    return (
      <StandaloneScreen width="sm" center>
        <ErrorState title={t('workspaceSelector.errorTitle')} description={error} onRetry={loadWorkspaces} />
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
          <StatusBanner tone="warning" title={t('workspaceSelector.notFound', { slug: notFoundSlug })} role="alert">
            <p>{t('workspaceSelector.notFoundBody')}</p>
          </StatusBanner>
        )}

        <EntityList aria-label={t('nav.workspaces')}>
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
              trailing={ws.updated_at ? <RelativeTime date={ws.updated_at} prefix={`${t('workspaceSelector.updated')} `} /> : undefined}
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
  const { t } = useT()
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
      setError(err instanceof Error ? err.message : t('workspaceSelector.createFailed'))
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
  const { t } = useT()
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
          {t('workspaceSelector.create')}
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
        placeholder={t('workspaceSelector.nameLabel')}
        aria-label={t('workspaceSelector.nameLabel')}
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
          {t('workspaceSelector.cancel')}
        </Button>
        <Button type="submit" size="sm" className="flex-1" disabled={creating || !name.trim()} loading={creating}>
          {creating ? t('workspaceSelector.creating') : t('workspaceSelector.createSubmit')}
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
  const { t } = useT()
  const workspaceExplain = useWorkspaceExplain()
  const inputRef = useRef<HTMLInputElement>(null)
  const { name, setName, creating, error, handleCreate } = useCreateWorkspace(navigate, setWorkspacesAtom)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <StandaloneScreen width="xs" center>
      <ScreenHeader kicker={<ProductMark />} title={t('workspaceSelector.welcome')} lead={t('workspaceSelector.welcomeLead')} />
      <ConceptIntro concept={workspaceExplain} storageKey="workspaces" className="mt-3" />

      <form onSubmit={handleCreate} className="mt-8 space-y-3">
        <Input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('workspaceSelector.namePlaceholder')}
          aria-label={t('workspaceSelector.nameLabel')}
          disabled={creating}
          error={error ?? undefined}
        />
        <Button type="submit" className="w-full" disabled={creating || !name.trim()} loading={creating}>
          {creating ? t('workspaceSelector.creating') : t('workspaceSelector.createFirst')}
        </Button>
      </form>
    </StandaloneScreen>
  )
}
