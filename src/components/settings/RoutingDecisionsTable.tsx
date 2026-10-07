import { useEffect, useState } from 'react'
import { Badge, Button } from '@/components/ui'
import { useT } from '@/i18n'
import { routingApi } from '@/services/routing'
import type { RoutingDecision } from '@/types/routing'
import { ErrorLine, Loading, Panel, ProjectPicker } from './SettingsPanel'
import { formatUsd } from './routingFormat'
import { useProjectOptions } from './useProjectOptions'

export const DECISIONS_PAGE_SIZE = 10

function Outcome({ decision }: { decision: RoutingDecision }) {
  const { t, number } = useT()
  const o = decision.outcome
  const label =
    o?.success === true ? t('routing.decisions.success') : o?.success === false ? t('routing.decisions.failed') : t('routing.decisions.pending')
  const variant = o?.success === true ? 'success' : o?.success === false ? 'error' : 'default'
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant={variant}>{label}</Badge>
      {typeof o?.reward === 'number' && (
        <span className="text-xs text-gray-500">{t('routing.decisions.reward', { value: number(o.reward, { maximumFractionDigits: 2 }) })}</span>
      )}
    </span>
  )
}

/** Recorded routing decisions, newest first, paged, filterable by project. */
export function RoutingDecisionsTable() {
  const { t, number, date } = useT()
  const projects = useProjectOptions()
  const [slug, setSlug] = useState('')
  const [page, setPage] = useState(0)
  const [state, setState] = useState<{ key: string; rows: RoutingDecision[] | null; failed: boolean } | null>(null)
  const [tick, setTick] = useState(0)
  const key = `${slug}|${page}|${tick}`

  useEffect(() => {
    let live = true
    routingApi
      .decisions({
        ...(slug ? { project_slug: slug } : {}),
        limit: DECISIONS_PAGE_SIZE,
        offset: page * DECISIONS_PAGE_SIZE,
      })
      .then((rows) => live && setState({ key, rows, failed: false }))
      .catch(() => live && setState({ key, rows: null, failed: true }))
    return () => {
      live = false
    }
  }, [slug, page, key])

  const current = state?.key === key ? state : null
  const rows = current?.rows ?? null
  const unknown = t('routing.report.unknown')

  return (
    <Panel
      testId="routing-decisions"
      title={t('routing.decisions.title')}
      description={t('routing.decisions.description')}
      aside={
        <ProjectPicker
          id="routing-decisions-project"
          projects={projects}
          value={slug}
          allLabel={t('routing.decisions.allProjects')}
          label={t('routing.decisions.projectFilter')}
          onChange={(s) => {
            setSlug(s)
            setPage(0)
          }}
        />
      }
      actions={
        <>
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            {t('routing.decisions.previous')}
          </Button>
          <span className="text-xs text-gray-400">{t('routing.decisions.page', { page: page + 1 })}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!rows || rows.length < DECISIONS_PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('routing.decisions.next')}
          </Button>
        </>
      }
    >
      {!current && <Loading>{t('routing.decisions.loading')}</Loading>}
      {current?.failed && (
        <div className="flex items-center gap-3">
          <ErrorLine>{t('routing.decisions.error')}</ErrorLine>
          <Button size="sm" variant="secondary" onClick={() => setTick((n) => n + 1)}>
            {t('routing.settings.retry')}
          </Button>
        </div>
      )}
      {rows && rows.length === 0 && <p className="text-sm text-gray-500">{t('routing.decisions.empty')}</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1 pr-3 font-medium">{t('routing.decisions.cols.when')}</th>
                <th className="py-1 pr-3 font-medium">{t('routing.decisions.cols.class')}</th>
                <th className="py-1 pr-3 font-medium">{t('routing.decisions.cols.model')}</th>
                <th className="py-1 pr-3 font-medium">{t('routing.decisions.cols.mode')}</th>
                <th className="py-1 pr-3 font-medium">{t('routing.decisions.cols.reason')}</th>
                <th className="py-1 pr-3 font-medium">{t('routing.decisions.cols.cost')}</th>
                <th className="py-1 font-medium">{t('routing.decisions.cols.outcome')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05] text-gray-300">
              {rows.map((d) => (
                <tr key={d.id} data-testid="routing-decision-row">
                  <td className="whitespace-nowrap py-1.5 pr-3">{date(d.at, { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-1.5 pr-3">{d.task_class}</td>
                  <td className="py-1.5 pr-3 font-mono">
                    {d.provider_id}
                    {d.model ? ` · ${d.model}` : ''}
                  </td>
                  <td className="py-1.5 pr-3">
                    <Badge variant={d.applied ? 'success' : 'default'}>
                      {d.applied ? t('routing.decisions.applied') : t('routing.decisions.shadow')}
                    </Badge>
                  </td>
                  <td className="max-w-[16rem] truncate py-1.5 pr-3" title={d.reason}>
                    {d.reason}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3">{formatUsd(d.outcome?.cost_usd, number, unknown)}</td>
                  <td className="py-1.5">
                    <Outcome decision={d} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
