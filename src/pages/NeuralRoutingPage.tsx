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

const modeOptions = [
  { value: 'nn', label: 'NN (nearest neighbour)' },
  { value: 'full', label: 'Full (policy net + NN)' },
]

/** A 0–1 fraction as a percentage; « — » when the backend sent nothing usable. */
const pct = (fraction: number | undefined) => (Number.isFinite(fraction) ? `${((fraction as number) * 100).toFixed(1)}%` : '—')
const num = (value: number | undefined) => (Number.isFinite(value) ? (value as number).toLocaleString() : '—')

// ============================================================================
// MAIN PAGE
// ============================================================================

export function NeuralRoutingPage() {
  const toast = useToast()
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
      if (loadedRef.current) toast.error('Failed to load neural routing data')
      else setError(e instanceof Error ? e.message : 'Failed to load neural routing data')
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
        toast.success('Neural routing disabled')
      } else {
        await neuralRoutingApi.enable()
        toast.success('Neural routing enabled')
      }
      await fetchData()
    } catch {
      toast.error('Failed to toggle neural routing')
    } finally {
      setToggling(false)
    }
  }

  /** Boolean settings save immediately (API supports them). */
  const handleBoolean = async (patch: UpdateConfigRequest, label: string) => {
    try {
      await neuralRoutingApi.updateConfig(patch)
      toast.success(`${label} updated`)
      await fetchData()
    } catch {
      toast.error(`Failed to update ${label.toLowerCase()}`)
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
      toast.success('Configuration updated')
      await fetchData()
    } catch {
      toast.error('Failed to update configuration')
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
      description="For each request an assistant makes, routing reuses the path that worked for similar requests before. Turn it on here, follow how well it does and tune it."
      intro="neuralRouting"
      status={
        status ? (
          <StatusText
            status={status.enabled ? 'enabled' : 'disabled'}
            label={status.enabled ? 'Enabled' : 'Disabled'}
          />
        ) : undefined
      }
      meta={[
        status ? <span key="m">Mode {status.mode.toUpperCase()}</span> : null,
        status?.cpu_guard_paused ? (
          <StatusText key="cpu" status="blocked" label="Paused — CPU high" />
        ) : null,
      ]}
      actions={
        // Icon-only on phones, icon + label from md (same pattern as MCP Federation).
        <Button size="sm" variant="ghost" onClick={fetchData} aria-label="Refresh" className="w-9 px-0 md:w-auto md:px-3">
          <RefreshCw className="w-4 h-4 md:mr-1.5" aria-hidden="true" />
          <span className="hidden md:inline">Refresh</span>
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
      <Section title="Activation">
        <SettingsList>
          <SettingRow
            label="Neural routing"
            description={
              status?.enabled
                ? 'On: requests go through the neural router.'
                : 'Off: requests follow the classic routing.'
            }
            control={
              <Switch
                checked={!!status?.enabled}
                disabled={toggling || !status}
                onChange={handleToggle}
                ariaLabel="Neural routing"
              />
            }
          />
          <SettingRow
            label="NN fallback"
            description="When the model does not answer in time, fall back to the nearest neighbours."
            control={
              <Switch
                checked={!!config?.inference.nn_fallback}
                disabled={!config}
                onChange={(v) => handleBoolean({ nn_fallback: v }, 'NN fallback')}
                ariaLabel="NN fallback"
              />
            }
          />
          <SettingRow
            label="Trajectory collection"
            description="Record the paths assistants take, to improve routing over time."
            meta={
              config
                ? [
                    `buffer ${config.collection.buffer_size} entries`,
                    `idle sessions closed after ${config.collection.stale_session_timeout_secs}s`,
                  ]
                : undefined
            }
            control={
              <Switch
                checked={!!config?.collection.enabled}
                disabled={!config}
                onChange={(v) => handleBoolean({ collection_enabled: v }, 'Trajectory collection')}
                ariaLabel="Trajectory collection"
              />
            }
          />
        </SettingsList>
      </Section>

      {/* ── Metrics ── */}
      <Section title="Performance" description="Refreshed every 10 seconds.">
        {hasQueries ? (
          <Facts
            columns={1}
            items={[
              {
                label: 'Queries',
                value: <span className="tabular-nums">{num(metrics.total_queries)}</span>,
              },
              {
                label: 'Hit rate',
                value: (
                  <span>
                    <span className="tabular-nums">{pct(metrics.hit_rate)}</span>
                    <span className="text-gray-500">
                      {' '}
                      — {num(metrics.hits)} routed by a known neighbour, {num(metrics.total_queries - metrics.hits)} without a match
                    </span>
                  </span>
                ),
              },
              {
                label: 'Cache',
                value: (
                  <span>
                    <span className="tabular-nums">{pct(metrics.cache_hit_rate)}</span>
                    <span className="text-gray-500"> — {num(metrics.cache_hits)} answered from memory</span>
                  </span>
                ),
              },
              {
                label: 'Match quality',
                value: (
                  <span>
                    <span className="tabular-nums">{pct(metrics.avg_similarity)}</span>
                    <span className="text-gray-500">
                      {' '}
                      average similarity · reward <span className="tabular-nums">{Number.isFinite(metrics.avg_reward) ? metrics.avg_reward.toFixed(2) : '—'}</span>
                    </span>
                  </span>
                ),
              },
            ]}
          />
        ) : (
          <EmptyState
            size="sm"
            title="No queries recorded"
            description="Turn routing on, then work with your assistants: the figures appear here."
          />
        )}
      </Section>

      {/* ── Configuration ── */}
      <Section
        title="Parameters"
        description="Advanced settings — the defaults are fine in most cases."
        action={
          <Button size="sm" onClick={handleSaveConfig} loading={saving} disabled={!dirty}>
            Save
          </Button>
        }
      >
        <SettingsList>
          <SettingRow
            label="Routing mode"
            description="NN: reuse the paths of similar trajectories. Full: a model decides, with NN as fallback."
            control={<Select value={editMode} onChange={setEditMode} options={modeOptions} className="w-52" />}
          />
          <SettingRow
            label="Inference timeout (ms)"
            description="Maximum time given to the model before giving up."
            control={numberInput(editTimeoutMs, setEditTimeoutMs, 'Inference timeout (ms)', '15')}
          />
          <SettingRow
            label="NN top-K"
            description="Number of neighbouring trajectories consulted for each request."
            control={numberInput(editTopK, setEditTopK, 'NN top-K', '5')}
          />
          <SettingRow
            label="Min similarity"
            description="Minimum similarity (0 to 1) for a neighbour to be used."
            control={numberInput(editMinSim, setEditMinSim, 'Min similarity', '0.65', '0.01')}
          />
          <SettingRow
            label="Max route age (days)"
            description="Older trajectories are ignored."
            control={numberInput(editMaxAge, setEditMaxAge, 'Max route age (days)', '90')}
          />
        </SettingsList>
      </Section>

      {/* ── System ── */}
      <Section title="System">
        <Facts
          columns={1}
          items={[
            {
              label: 'CPU guard',
              value: status?.cpu_guard_paused ? (
                <StatusText status="blocked" label="Paused — machine under heavy load, routing suspended" />
              ) : (
                <StatusText status="active" label="Active — watching CPU load" />
              ),
            },
          ]}
        />
      </Section>
    </PageContainer>
  )
}
