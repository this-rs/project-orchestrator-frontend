import { useState, useEffect, useCallback } from 'react'
import {
  Server,
  Plus,
  Activity,
  RefreshCw,
  Trash2,
  Scan,
  Network,
  Plug,
  AlertTriangle,
  ChevronRight,
  X,
  Clock,
  BarChart3,
  Shield,
  Zap,
} from 'lucide-react'
import {
  Badge,
  Button,
  Input,
  Select,
  Textarea,
  PageShell,
  CollapsibleSection,
  EmptyState,
  FormDialog,
  ConfirmDialog,
  Spinner,
} from '@/components/ui'
import { useToast, useConfirmDialog } from '@/hooks'
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
// HELPERS
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

const statusColors: Record<ConnectionStatus, string> = {
  connected: 'bg-green-500',
  disconnected: 'bg-gray-500',
  error: 'bg-red-500',
  reconnecting: 'bg-yellow-500',
}

const statusVariants: Record<ConnectionStatus, 'success' | 'default' | 'error' | 'warning'> = {
  connected: 'success',
  disconnected: 'default',
  error: 'error',
  reconnecting: 'warning',
}

const circuitVariants: Record<CircuitState, 'success' | 'error' | 'warning'> = {
  closed: 'success',
  open: 'error',
  half_open: 'warning',
}

const circuitLabels: Record<CircuitState, string> = {
  closed: 'Closed',
  open: 'Open',
  half_open: 'Half Open',
}

const transportLabels: Record<McpTransportType, string> = {
  stdio: 'Stdio',
  sse: 'SSE',
  streamable_http: 'HTTP',
}

const categoryVariants: Record<string, 'info' | 'error' | 'success' | 'warning' | 'purple' | 'default'> = {
  query: 'info',
  search: 'info',
  create: 'success',
  mutation: 'warning',
  delete: 'error',
  unknown: 'default',
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {status === 'connected' && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusColors[status]}`} />
    </span>
  )
}

function parseKeyValuePairs(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf('=')
    if (idx > 0) {
      result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
    }
  }
  return result
}

// ============================================================================
// CONNECT SERVER DIALOG
// ============================================================================

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

  // Reset on close
  useEffect(() => {
    if (!open) {
      setServerId('')
      setDisplayName('')
      setTransport('stdio')
      setCommand('')
      setArgs('')
      setEnv('')
      setUrl('')
      setHeaders('')
    }
  }, [open])

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
      if (args.trim()) {
        body.args = args.trim().split(/\s+/)
      }
      if (env.trim()) {
        body.env = parseKeyValuePairs(env)
      }
    } else {
      if (!url.trim()) {
        toast.error('URL is required for SSE/HTTP transport')
        return false
      }
      body.url = url.trim()
      if (headers.trim()) {
        body.headers = parseKeyValuePairs(headers)
      }
    }

    const res = await mcpFederationApi.connectServer(body)
    toast.success(res.message || `Server ${serverId} connected`)
    onSuccess()
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      title="Connect MCP Server"
      submitLabel="Connect"
      size="lg"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Server ID *</label>
          <Input
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
            placeholder="my-mcp-server"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Display Name</label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My MCP Server (optional)"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Transport *</label>
          <Select
            value={transport}
            onChange={(val) => setTransport(val as McpTransportType)}
            options={[
              { value: 'stdio', label: 'Stdio (local process)' },
              { value: 'sse', label: 'SSE (Server-Sent Events)' },
              { value: 'streamable_http', label: 'Streamable HTTP' },
            ]}
          />
        </div>

        {transport === 'stdio' ? (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Command *</label>
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx -y @modelcontextprotocol/server-everything"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Arguments</label>
              <Input
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="--port 3000 --verbose (space-separated)"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Environment Variables</label>
              <Textarea
                value={env}
                onChange={(e) => setEnv(e.target.value)}
                placeholder={'KEY=value\nANOTHER_KEY=value'}
                rows={3}
              />
              <p className="text-xs text-gray-600 mt-1">One KEY=VALUE per line</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">URL *</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:3000/sse"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Headers</label>
              <Textarea
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                placeholder={'Authorization=Bearer token\nX-Custom=value'}
                rows={3}
              />
              <p className="text-xs text-gray-600 mt-1">One KEY=VALUE per line</p>
            </div>
          </>
        )}
      </div>
    </FormDialog>
  )
}

// ============================================================================
// SERVER DETAIL PANEL
// ============================================================================

function ServerDetailPanel({ server, onClose }: { server: McpServerSummary; onClose: () => void }) {
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

  return (
    <CollapsibleSection
      title={`Server Detail — ${server.display_name || server.id}`}
      icon={<Server className="w-4 h-4" />}
      defaultOpen
      headerRight={
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MetricCard
            label="Total Calls"
            value={stats.call_count.toLocaleString()}
            icon={<BarChart3 className="w-4 h-4" />}
          />
          <MetricCard
            label="Errors"
            value={stats.error_count.toLocaleString()}
            sub={`${(stats.error_rate * 100).toFixed(1)}% error rate`}
            icon={<AlertTriangle className="w-4 h-4" />}
          />
          <MetricCard
            label="Latency p50"
            value={stats.latency_p50 != null ? `${stats.latency_p50}ms` : 'N/A'}
            sub={stats.latency_p95 != null ? `p95: ${stats.latency_p95}ms` : undefined}
            icon={<Clock className="w-4 h-4" />}
          />
          <MetricCard
            label="Circuit Breaker"
            value={circuitLabels[server.circuit_breaker_state]}
            icon={<Shield className="w-4 h-4" />}
          />
          <MetricCard
            label="Last Call"
            value={stats.last_call_at ? new Date(stats.last_call_at).toLocaleTimeString() : 'Never'}
            icon={<Zap className="w-4 h-4" />}
          />
          {stats.last_error && (
            <MetricCard
              label="Last Error"
              value={stats.last_error.slice(0, 40)}
              icon={<AlertTriangle className="w-4 h-4" />}
            />
          )}
        </div>

        {/* Tools */}
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-300">
            Discovered Tools ({tools.length})
          </h4>
          <Button size="sm" variant="ghost" onClick={handleProbe} disabled={probing}>
            {probing ? <Spinner size="sm" className="mr-1" /> : <Scan className="w-3.5 h-3.5 mr-1" />}
            Probe
          </Button>
        </div>

        {loadingTools ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : tools.length === 0 ? (
          <p className="text-sm text-gray-500 italic py-4 text-center">
            No tools discovered. Try running a probe.
          </p>
        ) : (
          <div className="border border-white/[0.04] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04] bg-white/[0.02]">
                  <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Name</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Category</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium hidden md:table-cell">Latency</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium hidden lg:table-cell">Shape</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium hidden lg:table-cell">Similar Internal</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool) => (
                  <tr key={tool.fqn} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                    <td className="px-3 py-2">
                      <div>
                        <p className="text-gray-200 font-medium">{tool.name}</p>
                        {tool.description && (
                          <p className="text-xs text-gray-500 truncate max-w-xs">{tool.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={categoryVariants[tool.category] ?? 'default'}>
                        {tool.category}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-gray-400">
                      {tool.profile?.latency_ms != null ? `${tool.profile.latency_ms}ms` : '—'}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell text-gray-400">
                      {tool.profile?.response_shape ?? '—'}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      {tool.similar_internal.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {tool.similar_internal.slice(0, 3).map(([name, score]) => (
                            <span key={name} className="text-xs text-gray-500">
                              {name} <span className="text-gray-600">({(score * 100).toFixed(0)}%)</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export function McpFederationPage() {
  const toast = useToast()
  const confirmDialog = useConfirmDialog()
  const [servers, setServers] = useState<McpServerSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showConnect, setShowConnect] = useState(false)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  const fetchData = useCallback(async () => {
    try {
      const data = await mcpFederationApi.listServers()
      setServers(data)
      setError(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load MCP servers'
      setError(msg)
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
      mcpFederationApi.listServers()
        .then((data) => {
          setServers(data)
          setError(null)
        })
        .catch(() => {})
    }, 10_000)
    return () => clearInterval(interval)
  }, [])

  const handleDisconnect = (server: McpServerSummary) => {
    confirmDialog.open({
      title: `Disconnect ${server.display_name || server.id}?`,
      description: `This will disconnect the MCP server and remove all its ${server.tool_count} discovered tools.`,
      confirmLabel: 'Disconnect',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await mcpFederationApi.disconnectServer(server.id)
          toast.success(`Server ${server.display_name || server.id} disconnected`)
          if (selectedServerId === server.id) setSelectedServerId(null)
          await fetchData()
        } catch {
          toast.error('Failed to disconnect server')
        }
      },
    })
  }

  const handleReconnect = async (serverId: string) => {
    setActionLoading((prev) => ({ ...prev, [serverId]: true }))
    try {
      await mcpFederationApi.reconnectServer(serverId)
      toast.success('Reconnection initiated')
      await fetchData()
    } catch {
      toast.error('Failed to reconnect')
    } finally {
      setActionLoading((prev) => ({ ...prev, [serverId]: false }))
    }
  }

  const handleProbe = async (serverId: string) => {
    setActionLoading((prev) => ({ ...prev, [`probe-${serverId}`]: true }))
    try {
      await mcpFederationApi.probeServer(serverId)
      toast.success('Probe completed')
      await fetchData()
    } catch {
      toast.error('Probe failed')
    } finally {
      setActionLoading((prev) => ({ ...prev, [`probe-${serverId}`]: false }))
    }
  }

  // Computed metrics
  const connectedCount = servers.filter((s) => s.status === 'connected').length
  const totalTools = servers.reduce((sum, s) => sum + s.tool_count, 0)
  const avgLatency = servers.length > 0
    ? servers.reduce((sum, s) => sum + (s.stats.latency_p50 ?? 0), 0) / servers.length
    : 0
  const avgErrorRate = servers.length > 0
    ? servers.reduce((sum, s) => sum + s.stats.error_rate, 0) / servers.length
    : 0

  const selectedServer = servers.find((s) => s.id === selectedServerId) ?? null

  if (loading) {
    return (
      <PageShell title="MCP Federation" description="Loading...">
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="MCP Federation"
      description="Manage external MCP servers and discovered tools"
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button size="sm" variant="primary" onClick={() => setShowConnect(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Connect Server
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ── Error Banner ── */}
        {error && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-red-900/20 border border-red-500/20 text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
            <Button size="sm" variant="ghost" onClick={fetchData} className="ml-auto">
              Retry
            </Button>
          </div>
        )}

        {/* ── Overview ── */}
        <CollapsibleSection
          title="Overview"
          icon={<Activity className="w-4 h-4" />}
          description="Aggregated metrics across all connected servers"
          defaultOpen
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              label="Servers Connected"
              value={connectedCount}
              sub={`${servers.length} total`}
              icon={<Server className="w-4 h-4" />}
            />
            <MetricCard
              label="Tools Discovered"
              value={totalTools}
              icon={<Plug className="w-4 h-4" />}
            />
            <MetricCard
              label="Avg Latency (p50)"
              value={avgLatency > 0 ? `${avgLatency.toFixed(0)}ms` : 'N/A'}
              icon={<Clock className="w-4 h-4" />}
            />
            <MetricCard
              label="Avg Error Rate"
              value={`${(avgErrorRate * 100).toFixed(1)}%`}
              icon={<AlertTriangle className="w-4 h-4" />}
            />
          </div>
        </CollapsibleSection>

        {/* ── Connected Servers ── */}
        <CollapsibleSection
          title="Servers"
          icon={<Network className="w-4 h-4" />}
          description={`${servers.length} server${servers.length !== 1 ? 's' : ''} registered`}
          defaultOpen
        >
          {servers.length === 0 ? (
            <EmptyState
              icon={<Server className="w-8 h-8" />}
              title="No MCP servers connected"
              description="Connect an external MCP server to discover and use its tools."
              action={
                <Button size="sm" variant="primary" onClick={() => setShowConnect(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Connect Server
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {servers.map((server) => (
                <div
                  key={server.id}
                  className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                    selectedServerId === server.id
                      ? 'border-indigo-500/40 bg-indigo-500/[0.04]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                  }`}
                  onClick={() => setSelectedServerId(selectedServerId === server.id ? null : server.id)}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot status={server.status} />
                      <h4 className="text-sm font-medium text-gray-200 truncate">
                        {server.display_name || server.id}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge variant="default">{transportLabels[server.transport_type]}</Badge>
                      <Badge variant={statusVariants[server.status]}>{server.status}</Badge>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                    <span>{server.tool_count} tool{server.tool_count !== 1 ? 's' : ''}</span>
                    <span>
                      <Badge variant={circuitVariants[server.circuit_breaker_state]} className="text-[10px]">
                        CB: {circuitLabels[server.circuit_breaker_state]}
                      </Badge>
                    </span>
                    {server.connected_at && (
                      <span>Since {new Date(server.connected_at).toLocaleDateString()}</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {server.status !== 'connected' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReconnect(server.id)}
                        disabled={!!actionLoading[server.id]}
                      >
                        {actionLoading[server.id] ? (
                          <Spinner size="sm" className="mr-1" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 mr-1" />
                        )}
                        Reconnect
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleProbe(server.id)}
                      disabled={!!actionLoading[`probe-${server.id}`]}
                    >
                      {actionLoading[`probe-${server.id}`] ? (
                        <Spinner size="sm" className="mr-1" />
                      ) : (
                        <Scan className="w-3.5 h-3.5 mr-1" />
                      )}
                      Probe
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDisconnect(server)}
                      className="text-red-400 hover:text-red-300 ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Disconnect
                    </Button>
                  </div>

                  {/* Expand indicator */}
                  <div className="flex justify-center mt-2">
                    <ChevronRight className={`w-3.5 h-3.5 text-gray-600 transition-transform ${selectedServerId === server.id ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* ── Server Detail ── */}
        {selectedServer && (
          <ServerDetailPanel
            server={selectedServer}
            onClose={() => setSelectedServerId(null)}
          />
        )}
      </div>

      {/* ── Dialogs ── */}
      <ConnectServerDialog
        open={showConnect}
        onClose={() => setShowConnect(false)}
        onSuccess={() => {
          setShowConnect(false)
          fetchData()
        }}
      />
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}
