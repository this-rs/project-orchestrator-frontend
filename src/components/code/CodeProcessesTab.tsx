import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent, Button, EmptyState, ErrorState } from '@/components/ui'
import { Play, ChevronDown, ChevronRight, Loader2, Zap, Terminal, Globe, Radio } from 'lucide-react'
import { codeApi } from '@/services'
import type { EntryPoint, ProcessSummary } from '@/types'

interface CodeProcessesTabProps {
  projectSlug: string | null
}

// ── Entry point type colors ─────────────────────────────────────────────

const EP_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  main: { bg: 'bg-purple-500/15', text: 'text-purple-400', icon: <Play className="w-3.5 h-3.5" /> },
  handler: { bg: 'bg-blue-500/15', text: 'text-blue-400', icon: <Globe className="w-3.5 h-3.5" /> },
  cli: { bg: 'bg-green-500/15', text: 'text-green-400', icon: <Terminal className="w-3.5 h-3.5" /> },
  event: { bg: 'bg-amber-500/15', text: 'text-amber-400', icon: <Radio className="w-3.5 h-3.5" /> },
}

const DEFAULT_EP_STYLE = { bg: 'bg-gray-500/15', text: 'text-gray-400', icon: <Zap className="w-3.5 h-3.5" /> }

function getEpStyle(type?: string) {
  if (!type) return DEFAULT_EP_STYLE
  return EP_STYLES[type.toLowerCase()] || DEFAULT_EP_STYLE
}

// ── Process detail step type ────────────────────────────────────────────

interface ProcessStep {
  function_name: string
  file_path: string
  order: number
}

// ── Main component ──────────────────────────────────────────────────────

export function CodeProcessesTab({ projectSlug }: CodeProcessesTabProps) {
  const [entryPoints, setEntryPoints] = useState<EntryPoint[]>([])
  const [processes, setProcesses] = useState<ProcessSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedProcess, setExpandedProcess] = useState<string | null>(null)
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([])
  const [loadingSteps, setLoadingSteps] = useState(false)

  const loadData = useCallback(async () => {
    if (!projectSlug) return
    setLoading(true)
    setError(null)
    try {
      const [epData, procData] = await Promise.all([
        codeApi.getEntryPoints({ project_slug: projectSlug, limit: 50 }),
        codeApi.listProcesses({ project_slug: projectSlug }),
      ])
      setEntryPoints(epData.entry_points)
      setProcesses(procData.processes)
    } catch (err) {
      console.error('Failed to load processes:', err)
      setError('Failed to load process data.')
    } finally {
      setLoading(false)
    }
  }, [projectSlug])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDetect = async () => {
    if (!projectSlug) return
    setDetecting(true)
    try {
      await codeApi.detectProcesses({ project_slug: projectSlug })
      await loadData()
    } catch (err) {
      console.error('Process detection failed:', err)
    } finally {
      setDetecting(false)
    }
  }

  const handleExpand = async (processId: string) => {
    if (expandedProcess === processId) {
      setExpandedProcess(null)
      setProcessSteps([])
      return
    }
    setExpandedProcess(processId)
    setLoadingSteps(true)
    try {
      const data = await codeApi.getProcessDetail({ process_id: processId })
      // Backend returns steps array with function_name, file_path, order
      const steps = (data as { steps?: ProcessStep[] })?.steps || []
      setProcessSteps(steps)
    } catch {
      setProcessSteps([])
    } finally {
      setLoadingSteps(false)
    }
  }

  if (!projectSlug) {
    return (
      <EmptyState
        title="Select a project"
        description="Process detection requires a specific project. Please select one from the filter above."
      />
    )
  }

  if (loading && processes.length === 0) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-white/[0.04] rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return <ErrorState title="Process loading failed" description={error} onRetry={loadData} />
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        Business processes detected by tracing call chains from entry points (HTTP handlers, CLI
        commands, main functions). Expand a process to see its step-by-step execution flow.
      </p>

      {/* ── Entry Points ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Entry Points</CardTitle>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDetect}
              loading={detecting}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Detect Processes
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {entryPoints.length === 0 ? (
            <p className="text-sm text-gray-500">
              No entry points found. Click &quot;Detect Processes&quot; to scan the codebase.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {entryPoints.map((ep) => {
                const style = getEpStyle(ep.type)
                return (
                  <div
                    key={ep.id}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${style.bg} ${style.text}`}
                    title={ep.id}
                  >
                    {style.icon}
                    <span className="text-xs font-mono truncate max-w-[200px]">
                      {shortName(ep.id)}
                    </span>
                    {ep.type && <span className="text-xs opacity-60 capitalize">{ep.type}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Process List ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Detected Processes</CardTitle>
        </CardHeader>
        <CardContent>
          {processes.length === 0 ? (
            <EmptyState
              title="No processes detected"
              description="Click 'Detect Processes' to scan the codebase for business process flows."
            />
          ) : (
            <div className="space-y-1">
              {processes.map((proc) => (
                <div key={proc.id}>
                  {/* Process row */}
                  <button
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                      expandedProcess === proc.id
                        ? 'bg-white/[0.06]'
                        : 'hover:bg-white/[0.04]'
                    }`}
                    onClick={() => handleExpand(proc.id)}
                  >
                    {expandedProcess === proc.id ? (
                      <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-200 truncate">
                        {proc.label || proc.id}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-white/[0.08] rounded-full text-xs text-gray-400 shrink-0">
                      {proc.total} steps
                    </span>
                  </button>

                  {/* Expanded detail: timeline */}
                  {expandedProcess === proc.id && (
                    <div className="ml-10 mr-3 mb-3 mt-1">
                      {loadingSteps ? (
                        <div className="flex items-center gap-2 py-4 text-gray-500">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Loading steps…</span>
                        </div>
                      ) : processSteps.length === 0 ? (
                        <p className="text-sm text-gray-500 py-2">No steps available.</p>
                      ) : (
                        <div className="relative">
                          {processSteps
                            .sort((a, b) => a.order - b.order)
                            .map((step, idx) => (
                              <div key={idx} className="flex gap-3 pb-4 last:pb-0">
                                {/* Timeline column: circle + connector line */}
                                <div className="flex flex-col items-center shrink-0 pt-1.5">
                                  <div className="w-2 h-2 rounded-full bg-indigo-500/60" />
                                  {idx < processSteps.length - 1 && (
                                    <div className="w-px flex-1 bg-white/[0.1] mt-1" />
                                  )}
                                </div>
                                {/* Content */}
                                <div className="min-w-0 pt-0.5">
                                  <div className="text-sm font-mono text-gray-200">
                                    {step.function_name}
                                  </div>
                                  <div className="text-xs text-gray-500 truncate" title={step.file_path}>
                                    {step.file_path}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function shortName(path: string): string {
  if (!path) return '—'
  const parts = path.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : path
}
