import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { useT } from '@/i18n'
import { routingApi } from '@/services/routing'
import type { RoutingReport } from '@/types/routing'
import { ErrorLine, Loading, Panel, ProjectPicker } from './SettingsPanel'
import { formatPercent, formatUsd } from './routingFormat'
import { useProjectOptions } from './useProjectOptions'

const TH = 'py-1 pr-3 font-medium'
const TD = 'py-1.5 pr-3'

/** What the shadow decisions would have changed: agreement, ESTIMATED cost gap, per class and per arm. */
export function ShadowReportCard() {
  const { t, number } = useT()
  const projects = useProjectOptions()
  const [slug, setSlug] = useState('')
  const [tick, setTick] = useState(0)
  const key = `${slug}|${tick}`
  const [state, setState] = useState<{ key: string; report: RoutingReport | null } | null>(null)

  useEffect(() => {
    let live = true
    routingApi
      .report(slug ? { project_slug: slug } : {})
      .then((report) => live && setState({ key, report }))
      .catch(() => live && setState({ key, report: null }))
    return () => {
      live = false
    }
  }, [slug, key])

  const current = state?.key === key ? state : null
  const report = current?.report ?? null
  const unknown = t('routing.report.unknown')
  const na = t('routing.report.na')

  return (
    <Panel
      testId="routing-report"
      title={t('routing.report.title')}
      aside={
        <ProjectPicker
          id="routing-report-project"
          projects={projects}
          value={slug}
          allLabel={t('routing.decisions.allProjects')}
          label={t('routing.decisions.projectFilter')}
          onChange={setSlug}
        />
      }
    >
      {!current && <Loading>{t('routing.report.loading')}</Loading>}
      {current && !report && (
        <div className="flex items-center gap-3">
          <ErrorLine>{t('routing.report.error')}</ErrorLine>
          <Button size="sm" variant="secondary" onClick={() => setTick((n) => n + 1)}>
            {t('routing.settings.retry')}
          </Button>
        </div>
      )}
      {report && report.decisions === 0 && <p className="text-sm text-gray-500">{t('routing.report.empty')}</p>}
      {report && report.decisions > 0 && (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t('routing.report.decisions')} value={number(report.decisions)} testId="report-decisions" />
            <Stat label={t('routing.report.applied')} value={number(report.applied)} testId="report-applied" />
            <Stat label={t('routing.report.agreement')} value={formatPercent(report.agreement_rate, number, na)} testId="report-agreement" />
            <Stat
              label={t('routing.report.costDelta')}
              value={formatUsd(report.estimated_cost_delta_usd, number, unknown)}
              testId="report-cost-delta"
            />
          </dl>
          <p className="text-xs text-gray-400" data-testid="report-estimate-note">
            {t('routing.report.estimateNote')}
          </p>

          <div className="overflow-x-auto">
            <h4 className="mb-1 text-xs font-semibold text-gray-300">{t('routing.report.byClass')}</h4>
            <table className="w-full min-w-[30rem] text-left text-xs" data-testid="report-by-class">
              <thead className="text-gray-500">
                <tr>
                  <th className={TH}>{t('routing.report.class')}</th>
                  <th className={TH}>{t('routing.report.decisions')}</th>
                  <th className={TH}>{t('routing.report.applied')}</th>
                  <th className={TH}>{t('routing.report.agreement')}</th>
                  <th className={TH}>{t('routing.report.costDelta')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-gray-300">
                {report.by_class.map((c) => (
                  <tr key={c.task_class}>
                    <td className={TD}>{c.task_class}</td>
                    <td className={TD}>{number(c.decisions)}</td>
                    <td className={TD}>{number(c.applied)}</td>
                    <td className={TD}>{formatPercent(c.agreement_rate, number, na)}</td>
                    <td className={TD}>{formatUsd(c.estimated_cost_delta_usd, number, unknown)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto">
            <h4 className="mb-1 text-xs font-semibold text-gray-300">{t('routing.report.byArm')}</h4>
            <table className="w-full min-w-[30rem] text-left text-xs" data-testid="report-by-arm">
              <thead className="text-gray-500">
                <tr>
                  <th className={TH}>{t('routing.report.class')}</th>
                  <th className={TH}>{t('routing.report.arm')}</th>
                  <th className={TH}>{t('routing.report.pulls')}</th>
                  <th className={TH}>{t('routing.report.meanReward')}</th>
                  <th className={TH}>{t('routing.report.meanCost')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-gray-300">
                {report.by_arm.map((a, i) => (
                  <tr key={`${a.task_class}-${a.provider_id}-${a.model ?? ''}-${i}`}>
                    <td className={TD}>{a.task_class}</td>
                    <td className={`${TD} font-mono`}>
                      {a.provider_id}
                      {a.model ? ` · ${a.model}` : ''}
                    </td>
                    <td className={TD}>{number(a.n)}</td>
                    <td className={TD}>{a.mean_reward === null ? na : number(a.mean_reward, { maximumFractionDigits: 2 })}</td>
                    <td className={TD}>{formatUsd(a.mean_cost_usd, number, unknown)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  )
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-lg font-semibold text-gray-100" data-testid={testId}>
        {value}
      </dd>
    </div>
  )
}
