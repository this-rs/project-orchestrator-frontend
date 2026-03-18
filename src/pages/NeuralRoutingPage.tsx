import { useState, useEffect, useCallback } from 'react'
import {
  Power,
  PowerOff,
  Activity,
  Cpu,
  Settings,
  RefreshCw,
  Zap,
  TrendingUp,
  BarChart3,
  Clock,
  Database,
} from 'lucide-react'
import {
  Badge,
  Button,
  Select,
  Input,
  PageShell,
  CollapsibleSection,
} from '@/components/ui'
import { useToast } from '@/hooks'
import { neuralRoutingApi } from '@/services/neuralRouting'
import type { NeuralRoutingStatus, NeuralRoutingConfig } from '@/services/neuralRouting'

// ============================================================================
// METRIC CARD
// ============================================================================

function MetricCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <span className="text-gray-500 mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-semibold text-gray-200">{value}</p>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export function NeuralRoutingPage() {
  const toast = useToast()
  const [status, setStatus] = useState<NeuralRoutingStatus | null>(null)
  const [config, setConfig] = useState<NeuralRoutingConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  // ── Config edit state ──
  const [editMode, setEditMode] = useState<string>('')
  const [editTimeoutMs, setEditTimeoutMs] = useState('')
  const [editTopK, setEditTopK] = useState('')
  const [editMinSim, setEditMinSim] = useState('')
  const [editMaxAge, setEditMaxAge] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, configRes] = await Promise.all([
        neuralRoutingApi.getStatus(),
        neuralRoutingApi.getConfig(),
      ])
      setStatus(statusRes)
      setConfig(configRes.config)

      // Sync edit state
      setEditMode(configRes.config.mode)
      setEditTimeoutMs(String(configRes.config.inference.timeout_ms))
      setEditTopK(String(configRes.config.nn.top_k))
      setEditMinSim(String(configRes.config.nn.min_similarity))
      setEditMaxAge(String(configRes.config.nn.max_route_age_days))
    } catch (e: unknown) {
      toast.error('Failed to load neural routing data')
      console.error(e)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh every 10s
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

  const handleSaveConfig = async () => {
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
    }
  }

  if (loading) {
    return (
      <PageShell title="Neural Routing" description="Loading...">
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      </PageShell>
    )
  }

  const metrics = status?.metrics
  const hitRate = metrics && metrics.total_queries > 0
    ? ((metrics.hits / metrics.total_queries) * 100).toFixed(1)
    : '0.0'

  return (
    <PageShell
      title="Neural Routing"
      description="Real-time inference pipeline monitoring and configuration"
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchData}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button
            size="sm"
            variant={status?.enabled ? 'danger' : 'primary'}
            onClick={handleToggle}
            disabled={toggling}
          >
            {status?.enabled ? (
              <>
                <PowerOff className="w-4 h-4 mr-1" />
                Disable
              </>
            ) : (
              <>
                <Power className="w-4 h-4 mr-1" />
                Enable
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ── Status Overview ── */}
        <CollapsibleSection
          title="Status"
          icon={<Activity className="w-4 h-4" />}
          description="Current neural routing state"
          defaultOpen
          headerRight={
            <div className="flex items-center gap-2">
              <Badge variant={status?.enabled ? 'success' : 'default'}>
                {status?.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Badge variant="info">{status?.mode?.toUpperCase()}</Badge>
              {status?.cpu_guard_paused && (
                <Badge variant="error">CPU Guard Paused</Badge>
              )}
            </div>
          }
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              label="Total Queries"
              value={metrics?.total_queries?.toLocaleString() ?? '0'}
              icon={<Database className="w-4 h-4" />}
            />
            <MetricCard
              label="Hit Rate"
              value={`${hitRate}%`}
              sub={`${metrics?.hits ?? 0} hits / ${metrics?.misses ?? 0} misses`}
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <MetricCard
              label="Avg Latency"
              value={metrics?.avg_latency_us ? `${(metrics.avg_latency_us / 1000).toFixed(1)}ms` : 'N/A'}
              sub={metrics?.p99_latency_us ? `p99: ${(metrics.p99_latency_us / 1000).toFixed(1)}ms` : undefined}
              icon={<Clock className="w-4 h-4" />}
            />
            <MetricCard
              label="Cache Size"
              value={metrics?.cache_size?.toLocaleString() ?? '0'}
              sub={metrics?.last_invalidated_at ? `Last invalidated: ${new Date(metrics.last_invalidated_at).toLocaleString()}` : 'Never invalidated'}
              icon={<Zap className="w-4 h-4" />}
            />
          </div>
        </CollapsibleSection>

        {/* ── Routing Performance ── */}
        <CollapsibleSection
          title="Performance"
          icon={<BarChart3 className="w-4 h-4" />}
          description="Routing metrics and throughput"
        >
          <div className="space-y-3">
            {metrics && metrics.total_queries > 0 ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-20">Hit Rate</span>
                  <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500/80 rounded-full transition-all duration-500"
                      style={{ width: `${hitRate}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-12 text-right">{hitRate}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-20">Latency</span>
                  <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500/80 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (metrics.avg_latency_us / 15000) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-12 text-right">
                    {(metrics.avg_latency_us / 1000).toFixed(1)}ms
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 italic">No queries recorded yet. Enable neural routing and make some queries to see metrics.</p>
            )}
          </div>
        </CollapsibleSection>

        {/* ── Configuration ── */}
        <CollapsibleSection
          title="Configuration"
          icon={<Settings className="w-4 h-4" />}
          description="Neural routing parameters"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Routing Mode</label>
                <Select
                  value={editMode}
                  onChange={(val) => setEditMode(val)}
                  options={[
                    { value: 'nn', label: 'NN (Nearest Neighbor only)' },
                    { value: 'full', label: 'Full (Policy Net + NN fallback)' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Inference Timeout (ms)</label>
                <Input
                  type="number"
                  value={editTimeoutMs}
                  onChange={(e) => setEditTimeoutMs(e.target.value)}
                  placeholder="15"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">NN Top-K</label>
                <Input
                  type="number"
                  value={editTopK}
                  onChange={(e) => setEditTopK(e.target.value)}
                  placeholder="5"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Min Similarity</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editMinSim}
                  onChange={(e) => setEditMinSim(e.target.value)}
                  placeholder="0.65"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max Route Age (days)</label>
                <Input
                  type="number"
                  value={editMaxAge}
                  onChange={(e) => setEditMaxAge(e.target.value)}
                  placeholder="90"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveConfig}>
                Save Configuration
              </Button>
            </div>
          </div>
        </CollapsibleSection>

        {/* ── System Info ── */}
        <CollapsibleSection
          title="System"
          icon={<Cpu className="w-4 h-4" />}
          description="CPU guard and collection status"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
              <span className="text-sm text-gray-400">CPU Guard</span>
              <Badge variant={status?.cpu_guard_paused ? 'error' : 'success'}>
                {status?.cpu_guard_paused ? 'Paused (high CPU)' : 'Active'}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
              <span className="text-sm text-gray-400">Trajectory Collection</span>
              <Badge variant={config?.collection.enabled ? 'success' : 'default'}>
                {config?.collection.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
              <span className="text-sm text-gray-400">Collection Buffer</span>
              <span className="text-sm text-gray-300">{config?.collection.buffer_size ?? 'N/A'} entries</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
              <span className="text-sm text-gray-400">Flush Interval</span>
              <span className="text-sm text-gray-300">{config?.collection.flush_interval_secs ?? 'N/A'}s</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-400">NN Fallback</span>
              <Badge variant={config?.inference.nn_fallback ? 'success' : 'default'}>
                {config?.inference.nn_fallback ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </PageShell>
  )
}
