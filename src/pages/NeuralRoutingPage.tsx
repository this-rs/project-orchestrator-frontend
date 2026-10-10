import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  Button,
  EmptyState,
  ErrorState,
  Facts,
  Input,
  PageContainer,
  PageHeader,
  Section,
  Select,
  SkeletonCard,
  StatusText,
  Switch,
} from '@/components/ui'
import { SettingRow, SettingsList } from '@/components/settings/SettingRow'
import { useToast } from '@/hooks'
import { neuralRoutingApi } from '@/services/neuralRouting'
import type { NeuralRoutingStatus, NeuralRoutingConfig, UpdateConfigRequest } from '@/services/neuralRouting'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { useT } from '@/i18n'

/** A 0–1 fraction as a percentage; « — » when the backend sent nothing usable. */
const pct = (fraction: number | undefined) => (Number.isFinite(fraction) ? `${((fraction as number) * 100).toFixed(1)}%` : '—')
const num = (value: number | undefined) => (Number.isFinite(value) ? (value as number).toLocaleString() : '—')

// ============================================================================
// MAIN PAGE
// ============================================================================

export function NeuralRoutingPage() {
  const { t } = useT()
  const toast = useToast()
  const modeOptions = [
    { value: 'nn', label: t('intelLearning.neural.modeNn') },
    { value: 'full', label: t('intelLearning.neural.modeFull') },
  ]
  const [status, setStatus] = useState<NeuralRoutingStatus | null>(null)
  const [config, setConfig] = useState<NeuralRoutingConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Once the first load succeeded, later failures are toasts, not a page-level error. */
  const loadedRef = useRef(false)
  const [toggling, setToggling] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Config edit state ──
  const [editMode, setEditMode] = useState<string>('')
  const [editTimeoutMs, setEditTimeoutMs] = useState('')
  const [editTopK, setEditTopK] = useState('')
  const [editMinSim, setEditMinSim] = useState('')
  const [editMaxAge, setEditMaxAge] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, configRes] = await Promise.all([neuralRoutingApi.getStatus(), neuralRoutingApi.getConfig()])
      setStatus(statusRes)
      setConfig(configRes.config)
      setEditMode(configRes.config.mode)
      setEditTimeoutMs(String(configRes.config.inference.timeout_ms))
      setEditTopK(String(configRes.config.nn.top_k))
      setEditMinSim(String(configRes.config.nn.min_similarity))
      setEditMaxAge(String(configRes.config.nn.max_route_age_days))
      setError(null)
      loadedRef.current = true
    } catch (e: unknown) {
      if (loadedRef.current) toast.error(t('intelLearning.neural.loadFailed'))
      else setError(e instanceof Error ? e.message : t('intelLearning.neural.loadFailed'))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh status every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      neuralRoutingApi.getStatus().then(setStatus).catch(() => {})
    }, 10_000)
    return () => clearInterval(interval)
  }, [])

  const handleToggle = async () => {
    if (!status) return
    setToggling(true)
    try {
      if (status.enabled) {
        await neuralRoutingApi.disable()
        toast.success(t('intelLearning.neural.disabledToast'))
      } else {
        await neuralRoutingApi.enable()
        toast.success(t('intelLearning.neural.enabledToast'))
      }
      await fetchData()
    } catch {
      toast.error(t('intelLearning.neural.toggleFailed'))
    } finally {
      setToggling(false)
    }
  }

  /** Boolean settings save immediately (API supports them). */
  const handleBoolean = async (patch: UpdateConfigRequest, label: string) => {
    try {
      await neuralRoutingApi.updateConfig(patch)
      toast.success(t('intelLearning.neural.settingUpdated', { label }))
      await fetchData()
    } catch {
      toast.error(t('intelLearning.neural.settingUpdateFailed', { label }))
    }
  }

  const handleSaveConfig = async () => {
    setSaving(true)
    try {
      await neuralRoutingApi.updateConfig({
        mode: editMode || undefined,
        inference_timeout_ms: editTimeoutMs ? Number(editTimeoutMs) : undefined,
        nn_top_k: editTopK ? Number(editTopK) : undefined,
        nn_min_similarity: editMinSim ? Number(editMinSim) : undefined,
        nn_max_route_age_days: editMaxAge ? Number(editMaxAge) : undefined,
      })
      toast.success(t('intelLearning.neural.configUpdated'))
      await fetchData()
    } catch {
      toast.error(t('intelLearning.neural.configUpdateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const dirty =
    !!config &&
    (editMode !== config.mode ||
      editTimeoutMs !== String(config.inference.timeout_ms) ||
      editTopK !== String(config.nn.top_k) ||
      editMinSim !== String(config.nn.min_similarity) ||
      editMaxAge !== String(config.nn.max_route_age_days))

  const header = (
    <PageHeader
      title={NOMENCLATURE.neuralRouting.plural}
      description={t('intelLearning.neural.description')}
      intro="neuralRouting"
      status={
        status ? (
          <StatusText
            status={status.enabled ? 'enabled' : 'disabled'}
            label={status.enabled ? t('intelLearning.neural.enabled') : t('intelLearning.neural.disabled')}
          />
        ) : undefined
      }
      meta={[
        status ? <span key="m">{t('intelLearning.neural.modeValue', { mode: status.mode.toUpperCase() })}</span> : null,
        status?.cpu_guard_paused ? (
          <StatusText key="cpu" status="blocked" label={t('intelLearning.neural.cpuHigh')} />
        ) : null,
      ]}
      actions={
        // Icon-only on phones, icon + label from md (same pattern as MCP Federation).
        <Button size="sm" variant="ghost" onClick={fetchData} aria-label={t('intelLearning.neural.refresh')} className="w-9 px-0 md:w-auto md:px-3">
          <RefreshCw className="w-4 h-4 md:mr-1.5" aria-hidden="true" />
          <span className="hidden md:inline">{t('intelLearning.neural.refresh')}</span>
        </Button>
      }
    />
  )

  if (loading) {
    return (
      <PageContainer width="narrow" className="space-y-6">
        {header}
        <SkeletonCard lines={4} />
        <SkeletonCard lines={5} />
      </PageContainer>
    )
  }

  if (error) {
    return (
      <PageContainer width="narrow" className="space-y-6">
        {header}
        <ErrorState description={error} onRetry={fetchData} />
      </PageContainer>
    )
  }

  const metrics = status?.metrics
  const hasQueries = !!metrics && metrics.total_queries > 0

  const numberInput = (value: string, onChange: (v: string) => void, label: string, placeholder: string, step?: string) => (
    <div className="w-24">
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-9 py-1.5 text-right tabular-nums"
      />
    </div>
  )

  return (
    <PageContainer width="narrow" className="space-y-6">
      {header}

      {/* ── Activation ── */}
      <Section title={t('intelLearning.neural.activation')}>
        <SettingsList>
          <SettingRow
            label={t('intelLearning.neural.toggleLabel')}
            description={status?.enabled ? t('intelLearning.neural.onDescription') : t('intelLearning.neural.offDescription')}
            control={
              <Switch
                checked={!!status?.enabled}
                disabled={toggling || !status}
                onChange={handleToggle}
                ariaLabel={t('intelLearning.neural.toggleLabel')}
              />
            }
          />
          <SettingRow
            label={t('intelLearning.neural.nnFallback')}
            description={t('intelLearning.neural.nnFallbackDescription')}
            control={
              <Switch
                checked={!!config?.inference.nn_fallback}
                disabled={!config}
                onChange={(v) => handleBoolean({ nn_fallback: v }, t('intelLearning.neural.nnFallback'))}
                ariaLabel={t('intelLearning.neural.nnFallback')}
              />
            }
          />
          <SettingRow
            label={t('intelLearning.neural.collection')}
            description={t('intelLearning.neural.collectionDescription')}
            meta={
              config
                ? [
                    t('intelLearning.neural.collectionBuffer', { count: config.collection.buffer_size }),
                    t('intelLearning.neural.collectionIdle', { seconds: config.collection.stale_session_timeout_secs }),
                  ]
                : undefined
            }
            control={
              <Switch
                checked={!!config?.collection.enabled}
                disabled={!config}
                onChange={(v) => handleBoolean({ collection_enabled: v }, t('intelLearning.neural.collection'))}
                ariaLabel={t('intelLearning.neural.collection')}
              />
            }
          />
        </SettingsList>
      </Section>

      {/* ── Metrics ── */}
      <Section title={t('intelLearning.neural.performance')} description={t('intelLearning.neural.refreshedEvery')}>
        {hasQueries ? (
          <Facts
            columns={1}
            items={[
              {
                label: t('intelLearning.neural.queries'),
                value: <span className="tabular-nums">{num(metrics.total_queries)}</span>,
              },
              {
                label: t('intelLearning.neural.hitRate'),
                value: (
                  <span>
                    <span className="tabular-nums">{pct(metrics.hit_rate)}</span>
                    <span className="text-gray-500">
                      {' '}
                      — {t('intelLearning.neural.hitRateDetail', { hits: num(metrics.hits), misses: num(metrics.total_queries - metrics.hits) })}
                    </span>
                  </span>
                ),
              },
              {
                label: t('intelLearning.neural.cache'),
                value: (
                  <span>
                    <span className="tabular-nums">{pct(metrics.cache_hit_rate)}</span>
                    <span className="text-gray-500"> — {t('intelLearning.neural.cacheDetail', { count: num(metrics.cache_hits) })}</span>
                  </span>
                ),
              },
              {
                label: t('intelLearning.neural.matchQuality'),
                value: (
                  <span>
                    <span className="tabular-nums">{pct(metrics.avg_similarity)}</span>
                    <span className="text-gray-500">
                      {' '}
                      {t('intelLearning.neural.avgSimilarity')} · {t('intelLearning.neural.reward')} <span className="tabular-nums">{Number.isFinite(metrics.avg_reward) ? metrics.avg_reward.toFixed(2) : '—'}</span>
                    </span>
                  </span>
                ),
              },
            ]}
          />
        ) : (
          <EmptyState
            size="sm"
            title={t('intelLearning.neural.noQueries')}
            description={t('intelLearning.neural.noQueriesDescription')}
          />
        )}
      </Section>

      {/* ── Configuration ── */}
      <Section
        title={t('intelLearning.neural.parameters')}
        description={t('intelLearning.neural.parametersDescription')}
        action={
          <Button size="sm" onClick={handleSaveConfig} loading={saving} disabled={!dirty}>
            {t('intelLearning.neural.save')}
          </Button>
        }
      >
        <SettingsList>
          <SettingRow
            label={t('intelLearning.neural.routingMode')}
            description={t('intelLearning.neural.routingModeDescription')}
            control={<Select value={editMode} onChange={setEditMode} options={modeOptions} className="w-52" />}
          />
          <SettingRow
            label={t('intelLearning.neural.timeout')}
            description={t('intelLearning.neural.timeoutDescription')}
            control={numberInput(editTimeoutMs, setEditTimeoutMs, t('intelLearning.neural.timeout'), '15')}
          />
          <SettingRow
            label={t('intelLearning.neural.topK')}
            description={t('intelLearning.neural.topKDescription')}
            control={numberInput(editTopK, setEditTopK, t('intelLearning.neural.topK'), '5')}
          />
          <SettingRow
            label={t('intelLearning.neural.minSimilarity')}
            description={t('intelLearning.neural.minSimilarityDescription')}
            control={numberInput(editMinSim, setEditMinSim, t('intelLearning.neural.minSimilarity'), '0.65', '0.01')}
          />
          <SettingRow
            label={t('intelLearning.neural.maxAge')}
            description={t('intelLearning.neural.maxAgeDescription')}
            control={numberInput(editMaxAge, setEditMaxAge, t('intelLearning.neural.maxAge'), '90')}
          />
        </SettingsList>
      </Section>

      {/* ── System ── */}
      <Section title={t('intelLearning.neural.system')}>
        <Facts
          columns={1}
          items={[
            {
              label: t('intelLearning.neural.cpuGuard'),
              value: status?.cpu_guard_paused ? (
                <StatusText status="blocked" label={t('intelLearning.neural.cpuPausedDetail')} />
              ) : (
                <StatusText status="active" label={t('intelLearning.neural.cpuActiveDetail')} />
              ),
            },
          ]}
        />
      </Section>
    </PageContainer>
  )
}
