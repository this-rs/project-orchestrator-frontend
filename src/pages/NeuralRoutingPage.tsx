import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  Button,
  Facts,
  Input,
  PageContainer,
  PageHeader,
  RelativeTime,
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

const modeOptions = [
  { value: 'nn', label: 'NN (nearest neighbour)' },
  { value: 'full', label: 'Full (policy net + NN)' },
]

const ms = (us: number) => `${(us / 1000).toFixed(1)} ms`

// ============================================================================
// MAIN PAGE
// ============================================================================

export function NeuralRoutingPage() {
  const toast = useToast()
  const [status, setStatus] = useState<NeuralRoutingStatus | null>(null)
  const [config, setConfig] = useState<NeuralRoutingConfig | null>(null)
  const [loading, setLoading] = useState(true)
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
      title="Neural Routing"
      description="Le routage neuronal choisit, pour chaque requête d'un agent, le chemin le plus probable en s'appuyant sur les trajectoires passées similaires. Ici : l'activer, suivre son efficacité et régler ses paramètres."
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
        <Button size="sm" variant="ghost" onClick={fetchData} aria-label="Refresh">
          <RefreshCw className="w-4 h-4 md:mr-1" aria-hidden="true" />
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

  const metrics = status?.metrics
  const hasQueries = !!metrics && metrics.total_queries > 0
  const hitRate = hasQueries ? ((metrics.hits / metrics.total_queries) * 100).toFixed(1) : '0.0'

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
      className="h-9 py-1.5 text-right tabular-nums text-base md:text-sm"
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
                ? 'Actif : les requêtes passent par le routeur neuronal.'
                : 'Inactif : les requêtes suivent le routage classique.'
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
            description="Si le modèle ne répond pas à temps, se rabattre sur les plus proches voisins."
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
            description="Enregistrer les trajectoires des agents pour améliorer le routage."
            meta={
              config
                ? [
                    `buffer ${config.collection.buffer_size} entries`,
                    `flush every ${config.collection.flush_interval_secs}s`,
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
      <Section title="Performance" description="Mis à jour toutes les 10 secondes.">
        {hasQueries ? (
          <Facts
            columns={1}
            items={[
              {
                label: 'Queries',
                value: <span className="tabular-nums">{metrics.total_queries.toLocaleString()}</span>,
              },
              {
                label: 'Hit rate',
                value: (
                  <span>
                    <span className="tabular-nums">{hitRate}%</span>
                    <span className="text-gray-500">
                      {' '}
                      — {metrics.hits} requêtes routées par un voisin connu, {metrics.misses} sans correspondance
                    </span>
                  </span>
                ),
              },
              {
                label: 'Latency',
                value: (
                  <span>
                    <span className="tabular-nums">{ms(metrics.avg_latency_us)}</span>
                    <span className="text-gray-500">
                      {' '}
                      en moyenne{metrics.p99_latency_us ? `, ${ms(metrics.p99_latency_us)} au pire (p99)` : ''}
                    </span>
                  </span>
                ),
              },
              {
                label: 'Cache',
                value: (
                  <span>
                    <span className="tabular-nums">{metrics.cache_size.toLocaleString()}</span>
                    <span className="text-gray-500"> routes en mémoire · </span>
                    {metrics.last_invalidated_at ? (
                      <RelativeTime date={metrics.last_invalidated_at} prefix="vidé il y a " className="text-gray-500" />
                    ) : (
                      <span className="text-gray-500">jamais vidé</span>
                    )}
                  </span>
                ),
              },
            ]}
          />
        ) : (
          <p className="text-sm text-gray-500">
            Aucune requête enregistrée. Activez le routage neuronal puis utilisez les agents pour voir les métriques.
          </p>
        )}
      </Section>

      {/* ── Configuration ── */}
      <Section
        title="Parameters"
        description="Réglages avancés — les valeurs par défaut conviennent dans la plupart des cas."
        action={
          <Button size="sm" onClick={handleSaveConfig} loading={saving} disabled={!dirty}>
            Save
          </Button>
        }
      >
        <SettingsList>
          <SettingRow
            label="Routing mode"
            description="NN : réutilise les chemins de trajectoires similaires. Full : un modèle décide, NN en secours."
            control={<Select value={editMode} onChange={setEditMode} options={modeOptions} className="w-52" />}
          />
          <SettingRow
            label="Inference timeout (ms)"
            description="Temps maximum laissé au modèle avant d'abandonner."
            control={numberInput(editTimeoutMs, setEditTimeoutMs, 'Inference timeout (ms)', '15')}
          />
          <SettingRow
            label="NN top-K"
            description="Nombre de trajectoires voisines consultées pour chaque requête."
            control={numberInput(editTopK, setEditTopK, 'NN top-K', '5')}
          />
          <SettingRow
            label="Min similarity"
            description="Ressemblance minimale (0 à 1) pour qu'un voisin soit utilisé."
            control={numberInput(editMinSim, setEditMinSim, 'Min similarity', '0.65', '0.01')}
          />
          <SettingRow
            label="Max route age (days)"
            description="Les trajectoires plus anciennes sont ignorées."
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
                <StatusText status="blocked" label="Paused — machine trop chargée, routage suspendu" />
              ) : (
                <StatusText status="active" label="Active — surveille la charge CPU" />
              ),
            },
          ]}
        />
      </Section>
    </PageContainer>
  )
}
