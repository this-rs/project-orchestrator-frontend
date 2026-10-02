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
import { LinkedDiscussions } from '@/components/discussions/LinkedDiscussions'
import { AttachSessionButton } from '@/components/discussions/AttachSessionButton'
import type { AttentionThread } from '@/types/attention'
import { WorkDashboard } from '@/components/today/work/WorkDashboard'

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
    switching: a.switchingLane,
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
// Slots: the discussion tree of a plan's thread, "Rattacher à…" of a thread-less session
// ---------------------------------------------------------------------------

/** The thread's plan is the entity of the tree; without a plan there is nothing to show (no button). */
function renderDiscussions(thread: AttentionThread) {
  if (!thread.plan) return null
  return (
    <LinkedDiscussions
      entity={{ type: 'plan', id: thread.plan.id }}
      workspaceSlug={thread.workspace}
      resume={{ planId: thread.plan.id, run: thread.run ? { id: thread.run.id, status: thread.run.status } : null }}
    />
  )
}

function renderAttach({ sessionId, workspace }: { sessionId: string; workspace: string }) {
  return <AttachSessionButton sessionId={sessionId} workspaceSlug={workspace} />
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

  // Every workspace unless one is picked: the dashboard loads them one by one (a plan links by its workspace).
  const dashboardWorkspaces = lane ? [lane] : workspaces.map((w) => w.slug)

  return (
    <PageShell title={TODAY_TEXT.title} width="full">
      <div className="space-y-8">
        <section aria-label="Tableau de bord du jour" className="space-y-4">
          <LaneChips lanes={workspaces} active={lane} onSelect={setLane} />
          <WorkDashboard key={dashboardWorkspaces.join('|')} workspaces={dashboardWorkspaces} lane={lane} />
        </section>

        <section aria-label="Ce qui attend ta réponse" className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-200">Ce qui attend ta réponse</h2>
          {/* No `key` on the lane: remounting flashed every skeleton on each chip tap. The old data stays, dimmed and inert, until the new lane lands. */}
          <LiveToday
            lane={lane}
            plansSlug={plansSlug}
            onClearLane={clearLane}
            laneNote={laneName ? TODAY_TEXT.laneNote(laneName) : null}
            renderDiscussions={renderDiscussions}
            renderAttach={renderAttach}
          />
        </section>
      </div>
    </PageShell>
  )
}
