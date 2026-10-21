/**
 * A LIVE 3D scene of a plan in the chat: `{"live": {"plan": "<uuid>"}}` in an ```iso-scene
 * block. LAZY chunk (with the engine).
 *
 * - The plan is read over REST (the plan for its title and completion dates, its
 *   dependency graph for the tasks and their dependencies), then the scene follows the
 *   CrudEvents of the WebSocket bus: a task that starts, finishes or fails changes its
 *   station, a new task adds one, a commit or a note linked to a task sends a particle.
 *   No model token is spent: everything comes from the server's real statuses.
 * - The mapping event → patches is pure (`planToPatches.ts`).
 * - An unknown or unreadable plan is a readable refusal, never an exception.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useContext } from 'react'
import { Link, useInRouterContext, useParams } from 'react-router-dom'
import { Radio } from 'lucide-react'
import { useT, type MessageKey } from '@/i18n'
import { ApiError } from '@/services/api'
import { getEventBus, plansApi } from '@/services'
import { ChromeWorkspaceSlugContext } from '@/hooks/useWorkspace'
import { workspacePath } from '@/utils/paths'
import type { CrudEvent } from '@/types'
import { liveScene, type LiveScene, type LivePatch } from '@/vendor/three-iso/live'
import { LAMP } from '@/vendor/three-iso/iso'
import type { VizBlockProps } from '../registry'
import { IsoSceneRefusal, IsoStage } from './IsoSceneViz'
import { parseLiveSpec } from './fence'
import { eventStep, initialStep, mergeModel, modelFromGraph, toModel, type LivePlanState, type LiveStep, type PlanModel } from './planToPatches'

/** A burst of events (a new task) re-reads the plan once, this long after the last one. */
const REFETCH_MS = 400
const STATUSES = new Set(['pending', 'blocked', 'in_progress', 'completed', 'failed', 'interrupted'])

type Phase =
  | { kind: 'loading' }
  | { kind: 'refused'; message: string }
  | { kind: 'ready'; title: string }

/** The plan read over REST, as a model. Throws what the API throws. */
async function loadPlanModel(planId: string): Promise<{ title: string; model: PlanModel }> {
  const [plan, graph] = await Promise.all([plansApi.get(planId), plansApi.getDependencyGraph(planId)])
  const completedAt: Record<string, string | undefined> = {}
  for (const t of Array.isArray(plan?.tasks) ? plan.tasks : []) completedAt[t.id] = t.completed_at
  return { title: typeof plan?.title === 'string' ? plan.title : '', model: modelFromGraph(planId, graph, completedAt) }
}

function useTaskHref(): ((taskId: string) => string) | null {
  const { slug: paramSlug } = useParams<{ slug: string }>()
  const chromeSlug = useContext(ChromeWorkspaceSlugContext)
  const inRouter = useInRouterContext()
  const slug = paramSlug ?? chromeSlug
  return useMemo(() => (inRouter && slug ? (id: string) => workspacePath(slug, `/tasks/${id}`) : null), [inRouter, slug])
}

function LivePlan({ planId, expanded }: { planId: string; expanded: boolean }) {
  const { t } = useT()
  const href = useTaskHref()
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [scene, setScene] = useState<{ L: LiveScene; gen: number } | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [, setTick] = useState(0)
  const stateRef = useRef<LivePlanState | null>(null)
  const genRef = useRef(0)

  /** Apply a step: to the current scene, or to a new one (`reset`). */
  const run = useCallback((step: LiveStep, current: LiveScene | null): LiveScene | null => {
    stateRef.current = step.state
    if (!step.patches.length && !step.reset && current) {
      setTick((n) => n + 1) // the legend may still change (a hidden task, the « +N » count)
      return current
    }
    const fresh = () => {
      genRef.current += 1
      return liveScene({ id: `plan-${planId.slice(0, 8)}` })
    }
    let L = step.reset || !current ? fresh() : current
    let res = L.apply(step.patches as LivePatch[], performance.now())
    if (!res.ok && L === current) {
      // The scene refused an update: rebuild it whole from the model rather than drift from it.
      L = fresh()
      res = L.apply(initialStep(step.state.model).patches as LivePatch[], performance.now())
    }
    setProblems(res.ok ? [] : res.problems)
    if (L !== current) setScene({ L, gen: genRef.current })
    else setTick((n) => n + 1)
    return L
  }, [planId])

  // Load the plan, then follow the bus. Unsubscribed (and pending timers dropped) on unmount.
  useEffect(() => {
    let alive = true
    let L: LiveScene | null = null
    let off: (() => void) | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const refetch = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        loadPlanModel(planId)
          .then(({ model }) => {
            if (!alive || !stateRef.current) return
            L = run(toModel(stateRef.current, mergeModel(stateRef.current.model, model)), L)
          })
          .catch(() => {
            /* the scene keeps what it has; the next event or read catches up */
          })
      }, REFETCH_MS)
    }
    const onEvent = (event: CrudEvent) => {
      if (!alive || !stateRef.current) return
      try {
        const step = eventStep(stateRef.current, event, Date.now())
        L = run(step, L)
        if (step.refetch) refetch()
      } catch (e) {
        setProblems([e instanceof Error ? e.message : String(e)])
      }
    }
    loadPlanModel(planId)
      .then(({ title, model }) => {
        if (!alive) return
        L = run(initialStep(model), null)
        setPhase({ kind: 'ready', title })
        const bus = getEventBus()
        bus.connect()
        off = bus.on(onEvent)
      })
      .catch((e: unknown) => {
        if (!alive) return
        const message =
          e instanceof ApiError && (e.status === 404 || e.status === 400)
            ? t('chatA-tools.viz.iso.live.unknownPlan', { id: planId })
            : t('chatA-tools.viz.iso.live.unreadable', { id: planId, detail: e instanceof Error ? e.message : String(e) })
        setPhase({ kind: 'refused', message })
      })
    return () => {
      alive = false
      off?.()
      if (timer) clearTimeout(timer)
    }
    // `t` changes with the language: the scene does not need re-reading for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, run])

  // Re-render the legend when the scene changes (status, label, a new station).
  useEffect(() => scene?.L.subscribe(() => setTick((n) => n + 1)), [scene])

  if (phase.kind === 'loading') {
    return (
      <div className="flex h-[220px] w-full items-center justify-center gap-1.5 text-[11px] text-gray-500" data-testid="live-plan-loading">
        <Radio className="w-3.5 h-3.5 animate-pulse" />
        <span>{t('chatA-tools.viz.iso.live.loading')}</span>
      </div>
    )
  }
  if (phase.kind === 'refused') {
    return (
      <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2 text-xs text-amber-300/90" role="note" data-testid="live-plan-refused">
        {phase.message}
      </div>
    )
  }

  const view = stateRef.current?.view
  const tones = new Map((scene?.L.stations ?? []).map((s) => [s.id, s.tone]))
  const byId = new Map((stateRef.current?.model.tasks ?? []).map((x) => [x.id, x]))
  const machine = scene?.L.machine ?? null
  return (
    <div data-testid="live-plan">
      {machine && scene ? (
        <IsoStage key={scene.gen} machine={machine} live={scene.L} expanded={expanded} label={t('chatA-tools.viz.iso.live.label', { title: phase.title || planId })} />
      ) : (
        <div className="flex h-[120px] items-center justify-center px-3 text-center text-[11px] text-gray-500" data-testid="live-plan-empty">
          {t('chatA-tools.viz.iso.live.empty')}
        </div>
      )}
      {problems.length > 0 && <IsoSceneRefusal problems={[t('chatA-tools.viz.iso.live.refused'), ...problems]} />}
      {view && view.stations.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 px-1 pt-2 text-[11px] text-gray-400" data-testid="live-plan-legend">
          {view.stations.map((s) => {
            const tone = tones.get(s.id)
            const color = (tone && (LAMP as Record<string, string>)[tone]) || LAMP.indigo
            const status = byId.get(s.id)?.status ?? 'pending'
            const statusText = STATUSES.has(status) ? t(`chatA-tools.viz.iso.live.status.${status}` as MessageKey) : status
            return (
              <li key={s.id} className="flex items-center gap-1.5" data-status={s.status}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: color, opacity: s.status === 'planned' ? 0.45 : 1 }} aria-hidden />
                {href ? (
                  <Link to={href(s.id)} className="hover:text-gray-200 hover:underline">
                    {s.label}
                  </Link>
                ) : (
                  <span>{s.label}</span>
                )}
                <span className={s.status === 'failed' ? 'text-red-400/90' : s.status === 'building' ? 'text-sky-300/90' : s.status === 'done' ? 'text-emerald-400/80' : 'text-gray-500'}>
                  · {statusText}
                </span>
              </li>
            )
          })}
          {view.hidden > 0 && (
            <li className="text-gray-500" data-testid="live-plan-more">
              {t('chatA-tools.viz.iso.live.more', { count: view.hidden })}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export default function LivePlanViz({ data, expanded = false, fallbackText }: VizBlockProps) {
  const spec = useMemo(() => parseLiveSpec(data), [data])
  if (!spec.ok) return <IsoSceneRefusal problems={spec.problems} fallbackText={fallbackText} />
  return <LivePlan planId={spec.planId} expanded={expanded} />
}
