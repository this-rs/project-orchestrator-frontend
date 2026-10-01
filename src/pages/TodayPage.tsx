import { useCallback, type ComponentProps } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { workspacesAtom } from '@/atoms'
import { PageShell } from '@/components/ui'
import { TodayView, type TodaySource } from '@/components/today/TodayView'
import { useAttention } from '@/hooks/useAttention'
import { attentionApi } from '@/services/attention'
import { workspacePath } from '@/utils/paths'
import { LaneChips } from '@/components/today/LaneChips'
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

function LiveToday(props: Omit<ComponentProps<typeof TodayView>, 'source'>) {
  const source = useLiveSource(props.lane)
  return <TodayView source={source} {...props} />
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Today: the day's view across every workspace. A summary line, one recommendation
 * ("Commence par ça"), then À traiter, À reprendre, En cours (by plan) and À suivre.
 * The workspace is a filter (chips, kept in the URL), not the axis of the page.
 */
export function TodayPage() {
  const { lane, setLane, workspaces } = useLaneFilter()
  const clearLane = useCallback(() => setLane(ALL_LANES), [setLane])

  const laneName = lane ? (workspaces.find((w) => w.slug === lane)?.name ?? lane) : null
  const plansSlug = lane ?? workspaces[0]?.slug ?? null

  return (
    <PageShell title={TODAY_TEXT.title} width="full">
      <LiveToday
        key={lane ?? ALL_LANES}
        lane={lane}
        plansSlug={plansSlug}
        onClearLane={clearLane}
        lanePicker={<LaneChips lanes={workspaces} active={lane} onSelect={setLane} />}
        laneNote={laneName ? TODAY_TEXT.laneNote(laneName) : null}
      />
    </PageShell>
  )
}
