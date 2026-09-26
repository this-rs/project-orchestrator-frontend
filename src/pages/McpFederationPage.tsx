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
  pluralize,
  textLink,
  type StatusTone,
} from '@/components/ui'
import { Notice } from '@/components/settings/SettingRow'
import { ToneText } from '@/components/settings/ToneText'
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

// ============================================================================
// LABELS
// ============================================================================

const STATUS: Record<ConnectionStatus, { label: string; tone: StatusTone }> = {
  connected: { label: 'Connected', tone: 'success' },
  disconnected: { label: 'Disconnected', tone: 'muted' },
  error: { label: 'Error', tone: 'danger' },
  reconnecting: { label: 'Reconnecting', tone: 'warning' },
}

const CIRCUIT: Record<CircuitState, { label: string; tone: StatusTone; help: string }> = {
  closed: { label: 'Closed', tone: 'success', help: 'normal, calls go through' },
  open: { label: 'Open', tone: 'danger', help: 'too many errors, calls temporarily blocked' },
  half_open: { label: 'Half open', tone: 'warning', help: 'a few trial calls to check recovery' },
}

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

const inputCls = 'text-base md:text-sm'

function ConnectServerDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
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
      toast.error('Server ID is required')
      return false
    }
    const body: ConnectServerRequest = {
      server_id: serverId.trim(),
      transport,
      ...(displayName.trim() && { display_name: displayName.trim() }),
    }
    if (transport === 'stdio') {
      if (!command.trim()) {
        toast.error('Command is required for Stdio transport')
        return false
      }
      body.command = command.trim()
      if (args.trim()) body.args = args.trim().split(/\s+/)
      if (env.trim()) body.env = parseKeyValuePairs(env)
    } else {
      if (!url.trim()) {
        toast.error('URL is required for SSE/HTTP transport')
        return false
      }
      body.url = url.trim()
      if (headers.trim()) body.headers = parseKeyValuePairs(headers)
    }
    const res = await mcpFederationApi.connectServer(body)
    toast.success(res.message || `Server ${serverId} connected`)
    onSuccess()
  }

  return (
    <FormDialog open={open} onClose={onClose} onSubmit={handleSubmit} title="Connect MCP server" submitLabel="Connect" size="lg">
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Plug in an external MCP server: its tools become available to the agents, with error and latency tracking.
        </p>
        <Field label="Server ID *">
          {(id) => <Input id={id} value={serverId} onChange={(e) => setServerId(e.target.value)} placeholder="my-mcp-server" className={inputCls} />}
        </Field>
        <Field label="Display name">
          {(id) => (
            <Input id={id} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="My MCP Server (optional)" className={inputCls} />
          )}
        </Field>
        <Field label="Transport *" hint="Stdio: a process started locally. SSE / HTTP: a server already running, reached by URL.">
          {() => (
            <Select
              value={transport}
              onChange={(val) => setTransport(val as McpTransportType)}
              options={[
                { value: 'stdio', label: 'Stdio (local process)' },
                { value: 'sse', label: 'SSE (Server-Sent Events)' },
                { value: 'streamable_http', label: 'Streamable HTTP' },
              ]}
            />
          )}
        </Field>
        {transport === 'stdio' ? (
          <>
            <Field label="Command *">
              {(id) => (
                <Input
                  id={id}
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx -y @modelcontextprotocol/server-everything"
                  className={`font-mono ${inputCls}`}
                />
              )}
            </Field>
            <Field label="Arguments" hint="Space-separated.">
              {(id) => <Input id={id} value={args} onChange={(e) => setArgs(e.target.value)} placeholder="--port 3000 --verbose" className={`font-mono ${inputCls}`} />}
            </Field>
            <Field label="Environment variables" hint="One KEY=VALUE per line.">
              {(id) => (
                <Textarea id={id} value={env} onChange={(e) => setEnv(e.target.value)} placeholder={'KEY=value\nANOTHER_KEY=value'} rows={3} className={`font-mono ${inputCls}`} />
              )}
            </Field>
          </>
        ) : (
          <>
            <Field label="URL *">
              {(id) => <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:3000/sse" className={inputCls} />}
            </Field>
            <Field label="Headers" hint="One KEY=VALUE per line.">
              {(id) => (
                <Textarea
                  id={id}
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                  placeholder={'Authorization=Bearer token\nX-Custom=value'}
                  rows={3}
                  className={`font-mono ${inputCls}`}
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
      toast.error('Failed to load tools')
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
      toast.success('Probe completed')
      await fetchTools()
    } catch {
      toast.error('Probe failed')
    } finally {
      setProbing(false)
    }
  }

  const stats = server.stats
  const circuit = CIRCUIT[server.circuit_breaker_state]

  return (
    <div className="space-y-3">
      <Facts
        columns={2}
        items={[
          { label: 'Calls', value: <span className="tabular-nums">{stats.call_count.toLocaleString()}</span> },
          {
            label: 'Errors',
            value: (
              <span>
                <span className="tabular-nums">{stats.error_count.toLocaleString()}</span>
                <span className="text-gray-500"> · {(stats.error_rate * 100).toFixed(1)}% of calls</span>
              </span>
            ),
          },
          {
            label: 'Latency',
            value:
              stats.latency_p50 != null ? (
                <span>
                  <span className="tabular-nums">{stats.latency_p50} ms</span>
                  <span className="text-gray-500"> median{stats.latency_p95 != null ? `, ${stats.latency_p95} ms at p95` : ''}</span>
                </span>
              ) : (
                'N/A'
              ),
          },
          {
            label: 'Circuit',
            value: (
              <span>
                <ToneText tone={circuit.tone} label={circuit.label} />
                <span className="text-gray-500"> — {circuit.help}</span>
              </span>
            ),
          },
          { label: 'Last call', value: stats.last_call_at ? <RelativeTime date={stats.last_call_at} /> : 'Never' },
          { label: 'Last error', value: stats.last_error ? <span className="text-red-300 break-words">{stats.last_error}</span> : null },
        ]}
      />

      {/* Group header (ListGroup typography) — not a ListGroup because the empty state must not live inside a <ul>. */}
      <div className="flex items-center justify-between gap-2 min-h-9">
        <h4 className="text-[11px] font-medium text-gray-500">
          Discovered tools <span className="tabular-nums text-gray-600">{tools.length}</span>
        </h4>
        <Button size="sm" variant="ghost" onClick={handleProbe} loading={probing}>
          {!probing && <Scan className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />}
          Probe
        </Button>
      </div>

      {loadingTools ? (
        <EntityListSkeleton rows={2} />
      ) : tools.length === 0 ? (
        <EmptyState size="sm" title="No tools discovered" description="Run a probe to query the server." />
      ) : (
        <EntityList variant="flush" aria-label={`Tools of ${server.display_name || server.id}`} className="rounded-lg border border-white/[0.05]">
          {tools.map((tool) => (
            <EntityRow
              key={tool.fqn}
              title={<span className="font-mono text-xs">{tool.name}</span>}
              ariaLabel={tool.name}
              description={tool.description}
              trailing={tool.profile?.latency_ms != null ? `${tool.profile.latency_ms} ms` : undefined}
              meta={[
                <ToneText key="c" tone={CATEGORY_TONE[tool.category] ?? 'neutral'} label={tool.category} />,
                tool.profile?.response_shape ? `returns ${tool.profile.response_shape}` : null,
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
      setError(e instanceof Error ? e.message : 'Failed to load MCP servers')
    } finally {
      setLoading(false)
    }
  }, [])

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
      toast.success(`Server ${server.display_name || server.id} disconnected`)
      if (selectedServerId === server.id) setSelectedServerId(null)
      await fetchData()
    } catch {
      toast.error('Failed to disconnect server')
    }
  }

  const runServerAction = async (serverId: string, kind: 'reconnect' | 'probe') => {
    setPending((p) => ({ ...p, [serverId]: kind }))
    try {
      if (kind === 'reconnect') {
        await mcpFederationApi.reconnectServer(serverId)
        toast.success('Reconnection initiated')
      } else {
        await mcpFederationApi.probeServer(serverId)
        toast.success('Probe completed')
      }
      await fetchData()
    } catch {
      toast.error(kind === 'reconnect' ? 'Failed to reconnect' : 'Probe failed')
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
      title="MCP Federation"
      description="External MCP servers plugged into the orchestrator: their tools add to the agents' own. Tap a server for its statistics and tools. Refreshed every 10 seconds."
      count={loading ? undefined : servers.length}
      width="wide"
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={fetchData} aria-label="Refresh" className="w-9 px-0 md:w-auto md:px-3">
            <RefreshCw className="w-4 h-4 md:mr-1.5" aria-hidden="true" />
            <span className="hidden md:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={openConnect}>
            <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
            Connect
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
            title="No MCP servers connected"
            description="Connect an external MCP server to discover and use its tools."
            action={
              <Button size="sm" onClick={openConnect}>
                <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
                Connect server
              </Button>
            }
          />
        ) : (
          <>
            {error && (
              <Notice tone="warning">
                {error}{' '}
                <button type="button" onClick={fetchData} className={`${textLink} ${hitArea}`}>
                  Retry
                </button>
              </Notice>
            )}

            <Facts
              columns={2}
              items={[
                {
                  label: 'Connected',
                  value: (
                    <span>
                      <span className="tabular-nums">
                        {connectedCount} / {servers.length}
                      </span>
                      <span className="text-gray-500"> servers reachable</span>
                    </span>
                  ),
                },
                {
                  label: 'Tools',
                  value: (
                    <span>
                      <span className="tabular-nums">{totalTools}</span>
                      <span className="text-gray-500"> tools available</span>
                    </span>
                  ),
                },
                {
                  label: 'Latency',
                  value: avgLatency > 0 ? (
                    <span>
                      <span className="tabular-nums">{avgLatency.toFixed(0)} ms</span>
                      <span className="text-gray-500"> median, averaged</span>
                    </span>
                  ) : (
                    'N/A'
                  ),
                },
                {
                  label: 'Errors',
                  value: (
                    <span>
                      <span className="tabular-nums">{(avgErrorRate * 100).toFixed(1)}%</span>
                      <span className="text-gray-500"> of calls fail (average)</span>
                    </span>
                  ),
                },
              ]}
            />

            <EntityList aria-label="MCP servers">
              {servers.map((server) => {
                const name = server.display_name || server.id
                const selected = selectedServerId === server.id
                const status = STATUS[server.status] ?? { label: server.status, tone: 'neutral' as StatusTone }
                const circuit = CIRCUIT[server.circuit_breaker_state]
                const busy = pending[server.id]
                return (
                  <EntityRow
                    key={server.id}
                    title={name}
                    onClick={() => setSelectedServerId(selected ? null : server.id)}
                    selected={selected}
                    leading={<StatusDot tone={status.tone} pulse={server.status === 'reconnecting'} label={status.label} />}
                    trailing={pluralize(server.tool_count, 'tool')}
                    meta={[
                      busy ? (
                        <ToneText key="busy" tone="progress" label={busy === 'probe' ? 'Probing…' : 'Reconnecting…'} pulse />
                      ) : (
                        <ToneText key="st" tone={status.tone} label={status.label} dot={false} />
                      ),
                      transportLabels[server.transport_type] ?? server.transport_type,
                      server.circuit_breaker_state !== 'closed' ? (
                        <ToneText key="cb" tone={circuit.tone} label={`Circuit ${circuit.label.toLowerCase()}`} />
                      ) : null,
                      server.display_name && server.display_name !== server.id ? (
                        <span key="id" className="font-mono">{server.id}</span>
                      ) : null,
                      server.connected_at ? <RelativeTime key="since" date={server.connected_at} prefix="since " /> : null,
                    ]}
                    actions={[
                      {
                        label: 'Reconnect',
                        icon: RefreshCw,
                        hidden: server.status === 'connected',
                        disabled: !!busy,
                        onClick: () => runServerAction(server.id, 'reconnect'),
                      },
                      {
                        label: 'Probe tools',
                        icon: Scan,
                        disabled: !!busy,
                        onClick: () => runServerAction(server.id, 'probe'),
                      },
                      {
                        label: 'Disconnect',
                        icon: Unplug,
                        variant: 'danger',
                        onClick: () => handleDisconnect(server),
                        confirm: {
                          title: `Disconnect ${name}?`,
                          description: `Disconnects the server and removes its ${server.tool_count} discovered tools.`,
                          confirmLabel: 'Disconnect',
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
