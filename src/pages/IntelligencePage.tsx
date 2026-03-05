import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAtom } from 'jotai'
import {
  Brain,
  FileCode2,
  StickyNote,
  Scale,
  Network,
  Zap,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { LoadingPage } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { intelligenceApi } from '@/services/intelligence'
import { intelligenceSummaryAtom } from '@/atoms/intelligence'
import type { IntelligenceSummary } from '@/types/intelligence'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string
  value: number | string
  icon: typeof Brain
  color: string
  sub?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-800/50 border border-slate-700/50 p-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon size={18} color={color} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-slate-200">{value}</p>
        <p className="text-[11px] text-slate-500">{label}</p>
        {sub && <p className="text-[10px] text-slate-600">{sub}</p>}
      </div>
    </div>
  )
}

function LayerSection({
  title,
  color,
  children,
}: {
  title: string
  color: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{children}</div>
      </CardContent>
    </Card>
  )
}

export function IntelligencePage() {
  const { projectSlug } = useParams<{ projectSlug: string }>()
  const wsSlug = useWorkspaceSlug()
  const navigate = useNavigate()
  const [summary, setSummary] = useAtom(intelligenceSummaryAtom)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = useCallback(async () => {
    if (!projectSlug) return
    setError(null)
    setLoading(true)
    try {
      const data = await intelligenceApi.getSummary(projectSlug)
      setSummary(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load intelligence data')
    } finally {
      setLoading(false)
    }
  }, [projectSlug, setSummary])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  if (loading) return <LoadingPage />
  if (error) return <ErrorState description={error} onRetry={fetchSummary} />

  const s = summary as IntelligenceSummary | null
  if (!s) return <ErrorState description="No data available" />

  return (
    <div className="py-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Brain size={22} className="text-cyan-400" />
            Intelligence
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Multi-layer knowledge graph overview for{' '}
            <span className="text-slate-400 font-medium">{projectSlug}</span>
          </p>
        </div>
        <button
          onClick={() =>
            navigate(
              workspacePath(wsSlug, `/projects/${projectSlug}/intelligence/graph`),
            )
          }
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30 transition-colors text-sm font-medium"
        >
          Open Graph
          <ArrowRight size={14} />
        </button>
      </div>

      {/* Code Layer */}
      <LayerSection title="Code" color="#3B82F6">
        <StatCard label="Files" value={s.code.files} icon={FileCode2} color="#3B82F6" />
        <StatCard label="Functions" value={s.code.functions} icon={Network} color="#60A5FA" />
        <StatCard label="Communities" value={s.code.communities} icon={Network} color="#6366F1" />
        <StatCard label="Orphan Files" value={s.code.orphans} icon={AlertTriangle} color="#F59E0B" />
        {s.code.hotspots.length > 0 && (
          <StatCard
            label="Top Hotspot"
            value={s.code.hotspots[0].path.split('/').pop() ?? s.code.hotspots[0].path}
            icon={Zap}
            color="#EF4444"
            sub={`churn: ${s.code.hotspots[0].churn_score.toFixed(1)}`}
          />
        )}
      </LayerSection>

      {/* Knowledge Layer */}
      <LayerSection title="Knowledge" color="#F59E0B">
        <StatCard
          label="Notes"
          value={s.knowledge.notes}
          icon={StickyNote}
          color="#F59E0B"
          sub={`${s.knowledge.stale_count} stale`}
        />
        <StatCard label="Decisions" value={s.knowledge.decisions} icon={Scale} color="#8B5CF6" />
        {Object.entries(s.knowledge.types_distribution).map(([type, count]) => (
          <StatCard
            key={type}
            label={type.charAt(0).toUpperCase() + type.slice(1)}
            value={count}
            icon={StickyNote}
            color="#D97706"
          />
        ))}
      </LayerSection>

      {/* Fabric Layer */}
      <LayerSection title="Fabric (Relations)" color="#94A3B8">
        <StatCard label="Co-changed Pairs" value={s.fabric.co_changed_pairs} icon={Network} color="#FED7AA" />
      </LayerSection>

      {/* Neural Layer */}
      <LayerSection title="Neural" color="#06B6D4">
        <StatCard label="Synapses" value={s.neural.active_synapses} icon={Brain} color="#06B6D4" />
        <StatCard
          label="Avg Energy"
          value={`${(s.neural.avg_energy * 100).toFixed(0)}%`}
          icon={Zap}
          color="#22D3EE"
        />
        <StatCard
          label="Weak Synapses"
          value={`${(s.neural.weak_synapses_ratio * 100).toFixed(0)}%`}
          icon={Brain}
          color="#6B7280"
        />
        <StatCard label="Dead Notes" value={s.neural.dead_notes_count} icon={StickyNote} color="#374151" />
      </LayerSection>

      {/* Skills Layer */}
      <LayerSection title="Skills" color="#EC4899">
        <StatCard
          label="Skills"
          value={s.skills.total}
          icon={Brain}
          color="#EC4899"
          sub={`${s.skills.active} active, ${s.skills.emerging} emerging`}
        />
        <StatCard
          label="Avg Cohesion"
          value={`${(s.skills.avg_cohesion * 100).toFixed(0)}%`}
          icon={Brain}
          color="#F9A8D4"
        />
        <StatCard label="Activations" value={s.skills.total_activations} icon={Zap} color="#F472B6" />
      </LayerSection>
    </div>
  )
}
