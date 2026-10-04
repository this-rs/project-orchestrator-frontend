import { useCallback, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { workspacesAtom } from '@/atoms'
import { PageContainer } from '@/components/ui'
import { TodayView, type TodaySource } from '@/components/today/TodayView'
import { useAttention } from '@/hooks/useAttention'
import { attentionApi } from '@/services/attention'
import { workspacePath } from '@/utils/paths'
import { LaneChips } from '@/components/today/LaneChips'
import { TODAY_TEXT, buildBands, shownPlanIds } from '@/components/today/bands'
import { LinkedDiscussions } from '@/components/discussions/LinkedDiscussions'
import { AttachSessionButton } from '@/components/discussions/AttachSessionButton'
import type { AttentionThread } from '@/types/attention'
import { WorkDashboard } from '@/components/today/work/WorkDashboard'
import { LiveAgents } from '@/components/today/live/LiveAgents'

/** Query parameter holding the lane filter on the cross-workspace entry. */
export const LANE_PARAM = 'workspace'
const ALL_LANES = ''
/** Name of the region holding the user's own day (day plan and tasks). */
export const DAY_REGION = 'Ma journée et mes tâches'

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
 * Today: the day's view across every workspace. ONE page: a header that says the day in one
 * sentence (with the workspace filter and four counters), what depends on the user (À traiter,
 * À reprendre, their tasks), and what advances alone (the plans that run, the assistants,
 * À lire). A plan is shown once: the ones the queue already shows are left out of "Plans à lancer".
 * The workspace is a filter (kept in the URL), not the axis of the page.
 */
export function TodayPage() {
  const { lane, setLane, workspaces } = useLaneFilter()
  const clearLane = useCallback(() => setLane(ALL_LANES), [setLane])

  const laneName = lane ? (workspaces.find((w) => w.slug === lane)?.name ?? lane) : null
  const plansSlug = lane ?? workspaces[0]?.slug ?? null

  // Every workspace unless one is picked: the dashboard loads them one by one (a plan links by its workspace).
  const dashboardWorkspaces = lane ? [lane] : workspaces.map((w) => w.slug)

  const source = useLiveSource(lane)
  const shown = useMemo(() => (source.data ? shownPlanIds(buildBands(source.data)) : undefined), [source.data])

  return (
    // No page title bar: the header of the view IS the title (the day in one sentence).
    <PageContainer width="full" className="mx-auto max-w-[88rem]">
      {/* No `key` on the lane: remounting flashed every skeleton on each filter tap. The old data stays, dimmed and inert, until the new lane lands. */}
      <TodayView
        source={source}
        lane={lane}
        plansSlug={plansSlug}
        onClearLane={clearLane}
        lanePicker={<LaneChips lanes={workspaces} active={lane} onSelect={setLane} />}
        laneNote={laneName ? TODAY_TEXT.laneNote(laneName) : null}
        renderDiscussions={renderDiscussions}
        renderAttach={renderAttach}
        liveSlot={<LiveAgents />}
        daySlot={
          <section aria-label={DAY_REGION} data-testid="today-day" className="min-w-0">
            <WorkDashboard key={dashboardWorkspaces.join('|')} workspaces={dashboardWorkspaces} lane={lane} shownPlanIds={shown} />
          </section>
        }
      />
    </PageContainer>
  )
}
