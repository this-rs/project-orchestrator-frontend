import { useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Layers } from 'lucide-react'
import { workspacesAtom } from '@/atoms'
import { FilterBar, PageShell, Select } from '@/components/ui'
import { TodayView, type TodaySource } from '@/components/today/TodayView'
import { useAttention } from '@/hooks/useAttention'
import { attentionApi } from '@/services/attention'
import { workspacePath } from '@/utils/paths'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { TODAY_TEXT } from '@/components/today/bands'

/** Query parameter holding the lane filter on the cross-workspace entry. */
export const LANE_PARAM = 'workspace'
const ALL_LANES = ''

/**
 * Lane filter, reflected in the URL so it can be shared and Back restores it.
 * - /workspace/:slug/today : the path slug is the filter (the familiar entry);
 *   widening goes to /today, picking another lane to that lane's entry.
 * - /today                 : `?workspace=<slug>`, absent = every workspace.
 * Unknown slugs (once workspaces are loaded) are ignored, i.e. every workspace.
 */
function useLaneFilter() {
  const { slug: pathSlug } = useParams<{ slug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const workspaces = useAtomValue(workspacesAtom)

  const requested = pathSlug ?? searchParams.get(LANE_PARAM) ?? null
  const known = !requested || workspaces.length === 0 || workspaces.some((w) => w.slug === requested)
  const lane = known ? requested : null

  const setLane = useCallback(
    (next: string) => {
      if (pathSlug) {
        const base = next ? workspacePath(next, '/today') : '/today'
        navigate(base)
      } else {
        setSearchParams((prev) => {
          const n = new URLSearchParams(prev)
          if (next) n.set(LANE_PARAM, next)
          else n.delete(LANE_PARAM)
          return n
        })
      }
    },
    [pathSlug, navigate, setSearchParams],
  )

  return { lane, setLane, workspaces }
}

// ---------------------------------------------------------------------------
// Source: the live API
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

function LiveToday(props: { lane: string | null; plansSlug: string | null; onClearLane: () => void }) {
  const source = useLiveSource(props.lane)
  return <TodayView source={source} {...props} />
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Today: the cross-workspace cockpit. Four bands in a fixed order (waiting on you,
 * running, stuck, thoughts), threads grouped by lane. Replaces the former task lists.
 */
export function TodayPage() {
  const { lane, setLane, workspaces } = useLaneFilter()
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
      description={TODAY_TEXT.pageDescription}
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
      <LiveToday key={lane ?? ALL_LANES} lane={lane} plansSlug={plansSlug} onClearLane={clearLane} />
    </PageShell>
  )
}
