import { useState, useEffect, useCallback, useId, type ReactNode } from 'react'
import { Plus, RefreshCw, Scan, Server, Unplug } from 'lucide-react'
import {
  Button,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  Facts,
  FormDialog,
  Input,
  PageShell,
  RelativeTime,
  Select,
  StatusDot,
  Textarea,
  hitArea,
  textLink,
  type StatusTone,
  ToneText,
} from '@/components/ui'
import { useT } from '@/i18n'
import { Notice } from '@/components/settings/SettingRow'
import { useToast } from '@/hooks'
import { mcpFederationApi } from '@/services/mcpFederation'
import type {
  McpServerSummary,
  McpDiscoveredTool,
  McpTransportType,
  ConnectionStatus,
  CircuitState,
  ConnectServerRequest,
} from '@/services/mcpFederation'
import { NOMENCLATURE } from '@/constants/nomenclature'

// ============================================================================
// LABELS
// ============================================================================

const STATUS_TONE: Record<ConnectionStatus, StatusTone> = {
  connected: 'success',
  disconnected: 'muted',
  error: 'danger',
  reconnecting: 'warning',
}

const CIRCUIT_TONE: Record<CircuitState, StatusTone> = {
  closed: 'success',
  open: 'danger',
  half_open: 'warning',
}

const CIRCUIT_HELP = { closed: 'closedHelp', open: 'openHelp', half_open: 'halfOpenHelp' } as const

const CATEGORIES = ['query', 'search', 'create', 'mutation', 'delete', 'unknown'] as const

// Product names of the transports: not translated.
const transportLabels: Record<McpTransportType, string> = {
  stdio: 'Stdio',
  sse: 'SSE',
  streamable_http: 'HTTP',
}

const CATEGORY_TONE: Record<string, StatusTone> = {
  query: 'info',
  search: 'info',
  create: 'success',
  mutation: 'warning',
  delete: 'danger',
  unknown: 'neutral',
}

function parseKeyValuePairs(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf('=')
    if (idx > 0) result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return result
}

// ============================================================================
// CONNECT SERVER DIALOG (remounted on each open → fresh state)
// ============================================================================

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-gray-400 mb-1">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}


function ConnectServerDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { t } = useT()
  const toast = useToast()
  const [serverId, setServerId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [transport, setTransport] = useState<McpTransportType>('stdio')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [env, setEnv] = useState('')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState('')

  const handleSubmit = async () => {
    if (!serverId.trim()) {
      toast.error(t('mcpFederation.connect.idRequired'))
      return false
    }
    const body: ConnectServerRequest = {
      server_id: serverId.trim(),
      transport,
      ...(displayName.trim() && { display_name: displayName.trim() }),
    }
    if (transport === 'stdio') {
      if (!command.trim()) {
        toast.error(t('mcpFederation.connect.commandRequired'))
        return false
      }
      body.command = command.trim()
      if (args.trim()) body.args = args.trim().split(/\s+/)
      if (env.trim()) body.env = parseKeyValuePairs(env)
    } else {
      if (!url.trim()) {
        toast.error(t('mcpFederation.connect.urlRequired'))
        return false
      }
      body.url = url.trim()
      if (headers.trim()) body.headers = parseKeyValuePairs(headers)
    }
    const res = await mcpFederationApi.connectServer(body)
    toast.success(res.message || t('mcpFederation.connect.connected', { id: serverId }))
    onSuccess()
  }

  return (
    <FormDialog open={open} onClose={onClose} onSubmit={handleSubmit} title={t('mcpFederation.connect.title')} submitLabel={t('mcpFederation.connect.submit')} size="lg">
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          {t('mcpFederation.connect.intro')}
        </p>
        <Field label={t('mcpFederation.connect.serverId')}>
          {(id) => <Input id={id} value={serverId} onChange={(e) => setServerId(e.target.value)} placeholder="my-mcp-server" />}
        </Field>
        <Field label={t('mcpFederation.connect.displayName')}>
          {(id) => (
            <Input id={id} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('mcpFederation.connect.displayNamePlaceholder')} />
          )}
        </Field>
        <Field label={t('mcpFederation.connect.transport')} hint={t('mcpFederation.connect.transportHint')}>
          {() => (
            <Select
              value={transport}
              onChange={(val) => setTransport(val as McpTransportType)}
              options={[
                { value: 'stdio', label: t('mcpFederation.connect.transportStdio') },
                { value: 'sse', label: 'SSE (Server-Sent Events)' },
                { value: 'streamable_http', label: 'Streamable HTTP' },
              ]}
            />
          )}
        </Field>
        {transport === 'stdio' ? (
          <>
            <Field label={t('mcpFederation.connect.command')}>
              {(id) => (
                <Input
                  id={id}
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx -y @modelcontextprotocol/server-everything"
                  className="font-mono"
                />
              )}
            </Field>
            <Field label={t('mcpFederation.connect.arguments')} hint={t('mcpFederation.connect.argumentsHint')}>
              {(id) => <Input id={id} value={args} onChange={(e) => setArgs(e.target.value)} placeholder="--port 3000 --verbose" className="font-mono" />}
            </Field>
            <Field label={t('mcpFederation.connect.env')} hint={t('mcpFederation.connect.keyValueHint')}>
              {(id) => (
                <Textarea id={id} value={env} onChange={(e) => setEnv(e.target.value)} placeholder={'KEY=value\nANOTHER_KEY=value'} rows={3} className="font-mono" />
              )}
            </Field>
          </>
        ) : (
          <>
            <Field label={t('mcpFederation.connect.url')}>
              {(id) => <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:3000/sse" />}
            </Field>
            <Field label={t('mcpFederation.connect.headers')} hint={t('mcpFederation.connect.keyValueHint')}>
              {(id) => (
                <Textarea
                  id={id}
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                  placeholder={'Authorization=Bearer token\nX-Custom=value'}
                  rows={3}
                  className="font-mono"
                />
              )}
            </Field>
          </>
        )}
      </div>
    </FormDialog>
  )
}

// ============================================================================
// SERVER DETAIL (expanded under its row)
// ============================================================================

function ServerDetail({ server }: { server: McpServerSummary }) {
  const { t } = useT()
  const toast = useToast()
  const [tools, setTools] = useState<McpDiscoveredTool[]>([])
  const [loadingTools, setLoadingTools] = useState(true)
  const [probing, setProbing] = useState(false)

  const fetchTools = useCallback(async () => {
    setLoadingTools(true)
    try {
      const res = await mcpFederationApi.listServerTools(server.id)
      // API returns either a raw array or { tools: [...] }
      setTools(Array.isArray(res) ? res : res.tools ?? [])
    } catch {
      toast.error(t('mcpFederation.detail.loadToolsFailed'))
    } finally {
      setLoadingTools(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id])

  useEffect(() => {
    fetchTools()
  }, [fetchTools])

  const handleProbe = async () => {
    setProbing(true)
    try {
      await mcpFederationApi.probeServer(server.id)
      toast.success(t('mcpFederation.detail.probeDone'))
      await fetchTools()
    } catch {
      toast.error(t('mcpFederation.detail.probeFailed'))
    } finally {
      setProbing(false)
    }
  }

  const stats = server.stats
  const circuitState = server.circuit_breaker_state

  return (
    <div className="space-y-3">
      <Facts
        columns={2}
        items={[
          { label: t('mcpFederation.detail.calls'), value: <span className="tabular-nums">{stats.call_count.toLocaleString()}</span> },
          {
            label: t('mcpFederation.detail.errors'),
            value: (
              <span>
                <span className="tabular-nums">{stats.error_count.toLocaleString()}</span>
                <span className="text-gray-500"> · {(stats.error_rate * 100).toFixed(1)}% {t('mcpFederation.detail.errorsOfCalls')}</span>
              </span>
            ),
          },
          {
            label: t('mcpFederation.detail.latency'),
            value:
              stats.latency_p50 != null ? (
                <span>
                  <span className="tabular-nums">{stats.latency_p50} ms</span>
                  <span className="text-gray-500"> {stats.latency_p95 != null ? t('mcpFederation.detail.medianP95', { p95: stats.latency_p95 }) : t('mcpFederation.detail.median')}</span>
                </span>
              ) : (
                t('mcpFederation.detail.na')
              ),
          },
          {
            label: t('mcpFederation.detail.circuit'),
            value: (
              <span>
                <ToneText tone={CIRCUIT_TONE[circuitState]} label={t(`mcpFederation.circuit.${circuitState}`)} />
                <span className="text-gray-500"> — {t(`mcpFederation.circuit.${CIRCUIT_HELP[circuitState]}`)}</span>
              </span>
            ),
          },
          { label: t('mcpFederation.detail.lastCall'), value: stats.last_call_at ? <RelativeTime date={stats.last_call_at} /> : t('mcpFederation.detail.never') },
          { label: t('mcpFederation.detail.lastError'), value: stats.last_error ? <span className="text-red-300 break-words">{stats.last_error}</span> : null },
        ]}
      />

      {/* Group header (ListGroup typography) — not a ListGroup because the empty state must not live inside a <ul>. */}
      <div className="flex items-center justify-between gap-2 min-h-9">
        <h4 className="text-[11px] font-medium text-gray-500">
          {t('mcpFederation.detail.discovered')} <span className="tabular-nums text-gray-600">{tools.length}</span>
        </h4>
        <Button size="sm" variant="ghost" onClick={handleProbe} loading={probing}>
          {!probing && <Scan className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />}
          {t('mcpFederation.detail.probe')}
        </Button>
      </div>

      {loadingTools ? (
        <EntityListSkeleton rows={2} />
      ) : tools.length === 0 ? (
        <EmptyState size="sm" title={t('mcpFederation.detail.noTools')} description={t('mcpFederation.detail.noToolsHint')} />
      ) : (
        <EntityList variant="flush" aria-label={t('mcpFederation.detail.toolsOf', { name: server.display_name || server.id })} className="rounded-lg border border-white/[0.05]">
          {tools.map((tool) => (
            <EntityRow
              key={tool.fqn}
              title={<span className="font-mono text-xs">{tool.name}</span>}
              ariaLabel={tool.name}
              description={tool.description}
              trailing={tool.profile?.latency_ms != null ? `${tool.profile.latency_ms} ms` : undefined}
              meta={[
                <ToneText key="c" tone={CATEGORY_TONE[tool.category] ?? 'neutral'} label={(CATEGORIES as readonly string[]).includes(tool.category) ? t(`mcpFederation.categories.${tool.category as (typeof CATEGORIES)[number]}`) : tool.category} />,
                tool.profile?.response_shape ? t('mcpFederation.detail.returns', { shape: tool.profile.response_shape }) : null,
                tool.similar_internal.length > 0 ? (
                  <span key="s" className="text-gray-500">
                    ≈{' '}
                    {tool.similar_internal
                      .slice(0, 3)
                      .map(([name, score]) => `${name} (${(score * 100).toFixed(0)}%)`)
                      .join(', ')}
                  </span>
                ) : null,
              ]}
            />
          ))}
        </EntityList>
      )}
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export function McpFederationPage() {
  const { t } = useT()
  const toast = useToast()
  const [servers, setServers] = useState<McpServerSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectKey, setConnectKey] = useState(0)
  const [showConnect, setShowConnect] = useState(false)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [pending, setPending] = useState<Record<string, 'reconnect' | 'probe' | undefined>>({})

  const fetchData = useCallback(async () => {
    try {
      setServers(await mcpFederationApi.listServers())
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('mcpFederation.page.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      mcpFederationApi
        .listServers()
        .then((data) => {
          setServers(data)
          setError(null)
        })
        .catch(() => {})
    }, 10_000)
    return () => clearInterval(interval)
  }, [])

  const openConnect = () => {
    setConnectKey((k) => k + 1)
    setShowConnect(true)
  }

  const handleDisconnect = async (server: McpServerSummary) => {
    try {
      await mcpFederationApi.disconnectServer(server.id)
      toast.success(t('mcpFederation.page.disconnected', { name: server.display_name || server.id }))
      if (selectedServerId === server.id) setSelectedServerId(null)
      await fetchData()
    } catch {
      toast.error(t('mcpFederation.page.disconnectFailed'))
    }
  }

  const runServerAction = async (serverId: string, kind: 'reconnect' | 'probe') => {
    setPending((p) => ({ ...p, [serverId]: kind }))
    try {
      if (kind === 'reconnect') {
        await mcpFederationApi.reconnectServer(serverId)
        toast.success(t('mcpFederation.page.reconnectStarted'))
      } else {
        await mcpFederationApi.probeServer(serverId)
        toast.success(t('mcpFederation.detail.probeDone'))
      }
      await fetchData()
    } catch {
      toast.error(kind === 'reconnect' ? t('mcpFederation.page.reconnectFailed') : t('mcpFederation.detail.probeFailed'))
    } finally {
      setPending((p) => ({ ...p, [serverId]: undefined }))
    }
  }

  // Aggregates
  const connectedCount = servers.filter((s) => s.status === 'connected').length
  const totalTools = servers.reduce((sum, s) => sum + s.tool_count, 0)
  const avgLatency = servers.length > 0 ? servers.reduce((sum, s) => sum + (s.stats.latency_p50 ?? 0), 0) / servers.length : 0
  const avgErrorRate = servers.length > 0 ? servers.reduce((sum, s) => sum + s.stats.error_rate, 0) / servers.length : 0

  return (
    <PageShell
      title={NOMENCLATURE.mcpFederation.plural}
      description={t('mcpFederation.description')}
      intro="mcpFederation"
      count={loading ? undefined : servers.length}
      width="wide"
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={fetchData} aria-label={t('mcpFederation.page.refresh')}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span className="hidden md:inline">{t('mcpFederation.page.refresh')}</span>
          </Button>
          <Button size="sm" onClick={openConnect}>
            <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
            {t('mcpFederation.page.connect')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {loading ? (
          <EntityListSkeleton rows={3} />
        ) : error && servers.length === 0 ? (
          <ErrorState description={error} onRetry={fetchData} />
        ) : servers.length === 0 ? (
          <EmptyState
            icon={<Server className="w-6 h-6" />}
            title={t('mcpFederation.page.emptyTitle')}
            description={t('mcpFederation.page.emptyDescription')}
            action={
              <Button size="sm" onClick={openConnect}>
                <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
                {t('mcpFederation.page.connectServer')}
              </Button>
            }
          />
        ) : (
          <>
            {error && (
              <Notice tone="warning">
                {error}{' '}
                <button type="button" onClick={fetchData} className={`${textLink} ${hitArea}`}>
                  {t('mcpFederation.page.retry')}
                </button>
              </Notice>
            )}

            <Facts
              columns={2}
              items={[
                {
                  label: t('mcpFederation.page.connectedLabel'),
                  value: (
                    <span>
                      <span className="tabular-nums">
                        {connectedCount} / {servers.length}
                      </span>
                      <span className="text-gray-500"> {t('mcpFederation.page.serversReachable')}</span>
                    </span>
                  ),
                },
                {
                  label: t('mcpFederation.page.tools'),
                  value: (
                    <span>
                      <span className="tabular-nums">{totalTools}</span>
                      <span className="text-gray-500"> {t('mcpFederation.page.toolsAvailable')}</span>
                    </span>
                  ),
                },
                {
                  label: t('mcpFederation.detail.latency'),
                  value: avgLatency > 0 ? (
                    <span>
                      <span className="tabular-nums">{avgLatency.toFixed(0)} ms</span>
                      <span className="text-gray-500"> {t('mcpFederation.page.medianAveraged')}</span>
                    </span>
                  ) : (
                    t('mcpFederation.detail.na')
                  ),
                },
                {
                  label: t('mcpFederation.detail.errors'),
                  value: (
                    <span>
                      <span className="tabular-nums">{(avgErrorRate * 100).toFixed(1)}%</span>
                      <span className="text-gray-500"> {t('mcpFederation.page.failAverage')}</span>
                    </span>
                  ),
                },
              ]}
            />

            <EntityList aria-label={t('mcpFederation.page.listAria')}>
              {servers.map((server) => {
                const name = server.display_name || server.id
                const selected = selectedServerId === server.id
                const status =
                  server.status in STATUS_TONE
                    ? { label: t(`mcpFederation.status.${server.status}`), tone: STATUS_TONE[server.status] }
                    : { label: server.status as string, tone: 'neutral' as StatusTone }
                const circuitState = server.circuit_breaker_state
                const busy = pending[server.id]
                return (
                  <EntityRow
                    key={server.id}
                    title={name}
                    onClick={() => setSelectedServerId(selected ? null : server.id)}
                    selected={selected}
                    expanded={selected}
                    leading={<StatusDot tone={status.tone} pulse={server.status === 'reconnecting'} label={status.label} />}
                    trailing={server.connected_at ? <RelativeTime date={server.connected_at} prefix={`${t('mcpFederation.page.since')} `} /> : undefined}
                    meta={[
                      busy ? (
                        <ToneText key="busy" tone="progress" label={busy === 'probe' ? t('mcpFederation.page.probing') : t('mcpFederation.page.reconnecting')} pulse />
                      ) : (
                        <ToneText key="st" tone={status.tone} label={status.label} dot={false} />
                      ),
                      transportLabels[server.transport_type] ?? server.transport_type,
                      server.circuit_breaker_state !== 'closed' ? (
                        <ToneText key="cb" tone={CIRCUIT_TONE[circuitState]} label={t('mcpFederation.circuit.state', { state: t(`mcpFederation.circuit.${circuitState}`).toLowerCase() })} />
                      ) : null,
                      server.display_name && server.display_name !== server.id ? (
                        <span key="id" className="font-mono">{server.id}</span>
                      ) : null,
                      t(server.tool_count === 1 ? 'mcpFederation.page.toolOne' : 'mcpFederation.page.toolMany', { n: server.tool_count }),
                    ]}
                    actions={[
                      {
                        label: t('mcpFederation.page.reconnect'),
                        icon: RefreshCw,
                        hidden: server.status === 'connected',
                        disabled: !!busy,
                        onClick: () => runServerAction(server.id, 'reconnect'),
                      },
                      {
                        label: t('mcpFederation.detail.probe'),
                        icon: Scan,
                        disabled: !!busy,
                        onClick: () => runServerAction(server.id, 'probe'),
                      },
                      {
                        label: t('mcpFederation.page.disconnect'),
                        icon: Unplug,
                        variant: 'danger',
                        onClick: () => handleDisconnect(server),
                        confirm: {
                          title: t('mcpFederation.page.disconnectTitle', { name }),
                          description: t('mcpFederation.page.disconnectDescription', { count: server.tool_count }),
                          confirmLabel: t('mcpFederation.page.disconnect'),
                        },
                      },
                    ]}
                  >
                    {selected && <ServerDetail server={server} />}
                  </EntityRow>
                )
              })}
            </EntityList>
          </>
        )}
      </div>

      <ConnectServerDialog
        key={connectKey}
        open={showConnect}
        onClose={() => setShowConnect(false)}
        onSuccess={() => {
          setShowConnect(false)
          fetchData()
        }}
      />
    </PageShell>
  )
}
