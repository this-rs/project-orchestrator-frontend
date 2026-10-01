import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Layers } from 'lucide-react'
import { workspacesAtom } from '@/atoms'
import { FilterBar, PageShell, Select, focusRing, metaText } from '@/components/ui'
import { TodayView, type TodaySource } from '@/components/today/TodayView'
import { DEMO_NAMES, filterLane, loadDemo } from '@/components/today/demo'
import { useAttention } from '@/hooks/useAttention'
import { attentionApi } from '@/services/attention'
import type { AttentionResponse } from '@/types/attention'
import { workspacePath } from '@/utils/paths'
import { NOMENCLATURE } from '@/constants/nomenclature'

/** Query parameter holding the lane filter on the cross-workspace entry. */
export const LANE_PARAM = 'workspace'
/**
 * `/today?demo=<name>` renders a simulated data set (a shared contract fixture) instead
 * of calling the API. Names: see `DEMO_NAMES` (components/today/demo.ts). No action is sent.
 */
export const DEMO_PARAM = 'demo'
const ALL_LANES = ''

/**
 * Lane filter, reflected in the URL so it can be shared and Back restores it.
 * - /workspace/:slug/today : the path slug is the filter (the familiar entry);
 *   widening goes to /today, picking another lane to that lane's entry.
 * - /today                 : `?workspace=<slug>`, absent = every workspace.
 * Unknown slugs (once workspaces are loaded) are ignored, i.e. every workspace.
 * The `demo` parameter is carried through every change.
 */
function useLaneFilter() {
  const { slug: pathSlug } = useParams<{ slug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const workspaces = useAtomValue(workspacesAtom)

  const requested = pathSlug ?? searchParams.get(LANE_PARAM) ?? null
  const known = !requested || workspaces.length === 0 || workspaces.some((w) => w.slug === requested)
  const lane = known ? requested : null
  const demo = searchParams.get(DEMO_PARAM)

  const setLane = useCallback(
    (next: string) => {
      if (pathSlug) {
        const base = next ? workspacePath(next, '/today') : '/today'
        navigate(demo ? `${base}?${DEMO_PARAM}=${encodeURIComponent(demo)}` : base)
      } else {
        setSearchParams((prev) => {
          const n = new URLSearchParams(prev)
          if (next) n.set(LANE_PARAM, next)
          else n.delete(LANE_PARAM)
          return n
        })
      }
    },
    [pathSlug, demo, navigate, setSearchParams],
  )

  const clearDemo = useCallback(
    () =>
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev)
        n.delete(DEMO_PARAM)
        return n
      }),
    [setSearchParams],
  )

  return { lane, setLane, workspaces, demo, clearDemo }
}

// ---------------------------------------------------------------------------
// Sources: live API, or a demo set
// ---------------------------------------------------------------------------

/** Live: `GET /api/attention` + realtime refetch + optimistic actions (useAttention). */
function useLiveSource(lane: string | null): TodaySource {
  const a = useAttention({ workspace: lane })
  const { refresh } = a
  const sendMessage = useCallback(
    async (sessionId: string, text: string) => {
      await attentionApi.sendMessage(sessionId, text)
      void refresh()
    },
    [refresh],
  )
  return {
    status: a.status,
    data: a.data,
    error: a.error,
    refresh: () => void refresh(),
    notices: a.notices,
    drafts: a.drafts,
    setDraft: a.setDraft,
    answerPermission: a.answerPermission,
    sendReply: a.sendReply,
    resumeRun: a.resumeRun,
    sendMessage,
  }
}

/** Demo: a fixture, filtered by lane locally. Every action resolves without any request. */
function useDemoSource(name: string, lane: string | null): TodaySource {
  const [loaded, setLoaded] = useState<{ name: string; data: AttentionResponse | null; error: Error | null } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    let live = true
    loadDemo(name).then(
      (data) => live && setLoaded({ name, data, error: null }),
      (error: unknown) => live && setLoaded({ name, data: null, error: error instanceof Error ? error : new Error(String(error)) }),
    )
    return () => {
      live = false
    }
  }, [name, attempt])

  const current = loaded && loaded.name === name ? loaded : null
  const data = useMemo(() => (current?.data ? filterLane(current.data, lane) : null), [current, lane])
  const noop = useCallback(async () => true, [])
  return {
    status: data ? 'ready' : current?.error ? 'error' : 'loading',
    data,
    error: current?.error ?? null,
    refresh: () => setAttempt((n) => n + 1),
    notices: {},
    drafts,
    setDraft: (id, text) => setDrafts((d) => ({ ...d, [id]: text })),
    answerPermission: noop,
    sendReply: noop,
    resumeRun: noop,
    sendMessage: async () => {},
  }
}

function LiveToday(props: { lane: string | null; plansSlug: string | null; onClearLane: () => void }) {
  const source = useLiveSource(props.lane)
  return <TodayView source={source} {...props} />
}

function DemoToday(props: { name: string; lane: string | null; plansSlug: string | null; onClearLane: () => void; onExit: () => void }) {
  const { name, onExit, ...rest } = props
  const source = useDemoSource(name, rest.lane)
  return (
    <div className="space-y-4">
      <p role="note" data-testid="demo-banner" className={`${metaText} flex flex-wrap items-center gap-x-3 gap-y-1`}>
        <span>
          Démo : jeu « {name} ». Données simulées, aucune action n’est envoyée.
        </span>
        <button type="button" onClick={onExit} className={`inline-flex min-h-9 items-center rounded px-1 text-indigo-300 hover:text-indigo-200 ${focusRing}`}>
          Quitter la démo
        </button>
        <span className="sr-only">Jeux disponibles : {DEMO_NAMES.join(', ')}</span>
      </p>
      <TodayView source={source} {...rest} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Today: the cross-workspace cockpit. Four bands in a fixed order (waiting on you,
 * running, stuck, thoughts), threads grouped by lane. Replaces the former task lists.
 */
export function TodayPage() {
  const { lane, setLane, workspaces, demo, clearDemo } = useLaneFilter()
  const clearLane = useCallback(() => setLane(ALL_LANES), [setLane])

  const laneOptions = [
    { value: ALL_LANES, label: 'All workspaces' },
    ...workspaces.map((w) => ({ value: w.slug, label: w.name })),
  ]
  const laneName = lane ? (workspaces.find((w) => w.slug === lane)?.name ?? lane) : null
  const plansSlug = lane ?? workspaces[0]?.slug ?? null

  return (
    <PageShell
      title={NOMENCLATURE.today.plural}
      description={NOMENCLATURE.today.description}
      width="full"
      filters={
        <FilterBar
          filters={
            <Select
              label="Workspace"
              options={laneOptions}
              value={lane ?? ALL_LANES}
              onChange={setLane}
              icon={<Layers className="w-3 h-3" />}
            />
          }
          activeCount={lane ? 1 : 0}
          activeLabels={laneName ? [laneName] : []}
          onClear={clearLane}
          defaultOpen
        />
      }
    >
      {demo ? (
        <DemoToday name={demo} lane={lane} plansSlug={plansSlug} onClearLane={clearLane} onExit={clearDemo} />
      ) : (
        <LiveToday key={lane ?? ALL_LANES} lane={lane} plansSlug={plansSlug} onClearLane={clearLane} />
      )}
    </PageShell>
  )
}
