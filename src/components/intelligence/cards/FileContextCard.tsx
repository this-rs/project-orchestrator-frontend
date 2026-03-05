import { memo, useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import type { FileNodeData } from '@/types/intelligence'
import type { Note, NodeImportance, NodeImportanceMetrics, NodeImportanceFabricMetrics } from '@/types'
import type { CoChanger } from '@/services/commits'
import { codeApi } from '@/services/code'
import { commitsApi } from '@/services/commits'
import { notesApi } from '@/services/notes'
import {
  Network,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  StickyNote,
  GitFork,
  Loader2,
  Braces,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  Lightbulb,
  BookOpen,
  Zap,
  Eye,
  Activity,
  Tag,
} from 'lucide-react'

// ============================================================================
// MINI GAUGE (self-contained — shared version extracted in Step 3)
// ============================================================================

function MiniGauge({
  label,
  value,
  color,
  max = 1,
  percentile,
}: {
  label: string
  value: number
  color: string
  max?: number
  percentile?: { p80: number; p95: number }
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  // Determine tier relative to percentiles
  let tier: string | null = null
  if (percentile) {
    if (value >= percentile.p95) tier = 'P95+'
    else if (value >= percentile.p80) tier = 'P80+'
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 min-w-[72px] shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
        {/* Percentile markers */}
        {percentile && (
          <>
            <div
              className="absolute top-0 h-full w-px bg-slate-600"
              style={{ left: `${(percentile.p80 / max) * 100}%` }}
              title="P80"
            />
            <div
              className="absolute top-0 h-full w-px bg-slate-500"
              style={{ left: `${(percentile.p95 / max) * 100}%` }}
              title="P95"
            />
          </>
        )}
      </div>
      <span className="text-[10px] font-mono text-slate-400 min-w-[38px] text-right">
        {value < 0.001 ? '0' : value < 0.01 ? value.toFixed(4) : value.toFixed(3)}
      </span>
      {tier && (
        <span className="text-[8px] font-bold text-amber-400 min-w-[28px]">{tier}</span>
      )}
    </div>
  )
}

// ============================================================================
// RISK BADGE
// ============================================================================

const riskConfig: Record<string, { bg: string; text: string; border: string; Icon: typeof Shield }> = {
  critical: { bg: '#450a0a', text: '#f87171', border: '#991b1b', Icon: ShieldX },
  high: { bg: '#431407', text: '#fb923c', border: '#9a3412', Icon: ShieldAlert },
  medium: { bg: '#422006', text: '#fbbf24', border: '#854d0e', Icon: Shield },
  low: { bg: '#052e16', text: '#4ade80', border: '#166534', Icon: ShieldCheck },
}

function RiskBadge({ level }: { level: string }) {
  const cfg = riskConfig[level] ?? riskConfig.medium
  const Icon = cfg.Icon
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-md border"
      style={{ backgroundColor: cfg.bg, color: cfg.text, borderColor: cfg.border }}
    >
      <Icon size={10} />
      {level.toUpperCase()}
    </span>
  )
}

// ============================================================================
// LANGUAGE TAG
// ============================================================================

const langColors: Record<string, string> = {
  rust: '#DEA584',
  typescript: '#3178C6',
  javascript: '#F7DF1E',
  python: '#3572A5',
  go: '#00ADD8',
  java: '#B07219',
  ruby: '#701516',
  c: '#555555',
  cpp: '#F34B7D',
  swift: '#F05138',
  kotlin: '#A97BFF',
  php: '#4F5D95',
  css: '#563D7C',
  html: '#E34C26',
}

function LanguageTag({ language }: { language: string }) {
  const color = langColors[language.toLowerCase()] ?? '#94A3B8'
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {language}
    </span>
  )
}

// ============================================================================
// NOTE TYPE ICONS
// ============================================================================

const noteTypeIcons: Record<string, typeof StickyNote> = {
  gotcha: AlertTriangle,
  tip: Lightbulb,
  guideline: BookOpen,
  pattern: Zap,
  context: Eye,
  observation: Activity,
}

// ============================================================================
// SECTION LOADING PLACEHOLDER
// ============================================================================

function SectionLoader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 py-2">
      <Loader2 size={10} className="text-slate-600 animate-spin" />
      <span className="text-[10px] text-slate-600">{label}</span>
    </div>
  )
}

// ============================================================================
// FILE CONTEXT CARD — MAIN COMPONENT
// ============================================================================

interface FileContextCardProps {
  data: FileNodeData
  entityId: string
}

interface FunctionInfo {
  name: string
  is_async?: boolean
  visibility?: string
  line_start?: number
}

function FileContextCardComponent({ data, entityId }: FileContextCardProps) {
  const { projectSlug } = useParams<{ slug: string; projectSlug: string }>()
  const filePath = data.path ?? entityId

  // Async-loaded state
  const [importance, setImportance] = useState<NodeImportance | null>(null)
  const [functions, setFunctions] = useState<FunctionInfo[]>([])
  const [linkedNotes, setLinkedNotes] = useState<Note[]>([])
  const [coChangers, setCoChangers] = useState<CoChanger[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch enriched data on mount
  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      const results = await Promise.allSettled([
        // 1. Node importance (PageRank, betweenness, risk)
        projectSlug
          ? codeApi.getNodeImportance({ project_slug: projectSlug, node_path: filePath, node_type: 'File' })
          : Promise.reject('no project'),
        // 2. File symbols (functions)
        codeApi.getFileSymbols(filePath),
        // 3. Linked notes
        notesApi.getEntityNotes('file', filePath),
        // 4. Co-changers
        commitsApi.getFileCoChangers(filePath, { limit: 5 }),
      ])

      if (cancelled) return

      // Extract with safe fallbacks
      if (results[0].status === 'fulfilled') setImportance(results[0].value)
      if (results[1].status === 'fulfilled') {
        const syms = results[1].value
        setFunctions(
          (syms.functions ?? []).map((f) => ({
            name: f.name,
            is_async: f.is_async,
            visibility: f.visibility,
            line_start: f.line_start,
          })),
        )
      }
      if (results[2].status === 'fulfilled') setLinkedNotes(results[2].value.items ?? [])
      if (results[3].status === 'fulfilled') setCoChangers(results[3].value.items ?? [])

      setLoading(false)
    }

    fetchAll()
    return () => { cancelled = true }
  }, [filePath, projectSlug])

  // Derived values
  const metrics: NodeImportanceMetrics | null = importance?.metrics ?? null
  const fabricMetrics: NodeImportanceFabricMetrics | null = importance?.fabric_metrics ?? null
  const riskLevel = importance?.risk_level ?? data.riskLevel
  const communityLabel = fabricMetrics?.fabric_community_label ?? data.communityLabel
  const communityId = fabricMetrics?.fabric_community_id ?? data.communityId
  const pagerank = metrics?.pagerank ?? data.pagerank ?? 0
  const betweenness = metrics?.betweenness ?? data.betweenness ?? 0

  return (
    <div className="space-y-3">
      {/* ── Header: Language + Community ────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {data.language && <LanguageTag language={data.language} />}
        {communityLabel && (
          <span className="inline-flex items-center gap-1 text-[10px] text-indigo-400">
            <Network size={10} />
            {communityLabel}
          </span>
        )}
        {communityId != null && !communityLabel && (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
            <Network size={10} />
            community {communityId}
          </span>
        )}
        {riskLevel && <RiskBadge level={riskLevel} />}
      </div>

      {/* ── Importance Summary ──────────────────────────────────────── */}
      {importance?.summary && (
        <p className="text-[10px] text-slate-400 italic leading-relaxed">
          {importance.summary}
        </p>
      )}

      {/* ── Metrics Gauges ─────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <MiniGauge
          label="PageRank"
          value={pagerank}
          color="#3B82F6"
          percentile={
            importance?.percentiles
              ? { p80: importance.percentiles.pagerank_p80, p95: importance.percentiles.pagerank_p95 }
              : undefined
          }
        />
        <MiniGauge
          label="Betweenness"
          value={betweenness}
          color="#8B5CF6"
          percentile={
            importance?.percentiles
              ? { p80: importance.percentiles.betweenness_p80, p95: importance.percentiles.betweenness_p95 }
              : undefined
          }
        />
        {fabricMetrics?.fabric_pagerank != null && (
          <MiniGauge
            label="Fabric PR"
            value={fabricMetrics.fabric_pagerank}
            color="#06B6D4"
          />
        )}
      </div>

      {/* ── Degree Info ────────────────────────────────────────────── */}
      {metrics && (
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
            <ArrowDownRight size={10} className="text-emerald-500" />
            {metrics.in_degree} imports
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
            <ArrowUpRight size={10} className="text-blue-500" />
            {metrics.out_degree} dependents
          </span>
          {metrics.clustering_coefficient != null && (
            <span className="text-[10px] text-slate-500">
              CC: {metrics.clustering_coefficient.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* ── Functions List ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Braces size={10} className="text-blue-400" />
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
            Functions
          </span>
          {!loading && (
            <span className="text-[10px] text-slate-600 font-mono">({functions.length})</span>
          )}
        </div>
        {loading ? (
          <SectionLoader label="Loading symbols..." />
        ) : functions.length === 0 ? (
          <p className="text-[10px] text-slate-600 italic pl-3">No functions found</p>
        ) : (
          <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
            {functions.map((fn) => (
              <div
                key={fn.name}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-slate-800/60 group"
              >
                <span className="text-[9px] text-slate-600 font-mono min-w-[10px]">
                  {fn.visibility === 'pub' ? (
                    <span className="text-emerald-600">+</span>
                  ) : (
                    <span className="text-slate-700">-</span>
                  )}
                </span>
                <span className="text-[10px] text-slate-300 font-mono truncate flex-1 group-hover:text-blue-300">
                  {fn.name}
                </span>
                {fn.is_async && (
                  <span className="text-[8px] text-cyan-600 font-medium">async</span>
                )}
                {fn.line_start != null && (
                  <span className="text-[8px] text-slate-700 font-mono">L{fn.line_start}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Linked Notes ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <StickyNote size={10} className="text-amber-400" />
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
            Linked Notes
          </span>
          {!loading && (
            <span className="text-[10px] text-slate-600 font-mono">({linkedNotes.length})</span>
          )}
        </div>
        {loading ? (
          <SectionLoader label="Loading notes..." />
        ) : linkedNotes.length === 0 ? (
          <p className="text-[10px] text-slate-600 italic pl-3">No linked notes</p>
        ) : (
          <div className="space-y-1 max-h-[140px] overflow-y-auto">
            {linkedNotes.map((note) => {
              const NoteIcon = noteTypeIcons[note.note_type] ?? StickyNote
              const importanceColors: Record<string, string> = {
                critical: '#f87171',
                high: '#fb923c',
                medium: '#fbbf24',
                low: '#94a3b8',
              }
              const importColor = importanceColors[note.importance] ?? '#94a3b8'
              return (
                <div
                  key={note.id}
                  className="bg-slate-800/40 rounded-md px-2 py-1.5 border border-slate-700/50 hover:border-amber-800/40 transition-colors"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <NoteIcon size={9} color="#fbbf24" />
                    <span className="text-[9px] font-medium text-amber-400">{note.note_type}</span>
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: importColor }}
                      title={`importance: ${note.importance}`}
                    />
                    {note.tags.length > 0 && (
                      <div className="flex items-center gap-0.5 ml-auto">
                        <Tag size={7} className="text-slate-600" />
                        <span className="text-[8px] text-slate-600">{note.tags.length}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-snug line-clamp-2">
                    {note.content}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Co-Changers ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <GitFork size={10} className="text-orange-400" />
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
            Co-Changers
          </span>
          {!loading && coChangers.length > 0 && (
            <span className="text-[10px] text-slate-600 font-mono">(top {coChangers.length})</span>
          )}
        </div>
        {loading ? (
          <SectionLoader label="Loading co-changers..." />
        ) : coChangers.length === 0 ? (
          <p className="text-[10px] text-slate-600 italic pl-3">No co-change data</p>
        ) : (
          <div className="space-y-0.5">
            {coChangers.map((cc) => {
              const ccBase = cc.file_path.split('/').pop() ?? cc.file_path
              // Normalize count to bar width (1→10%, max count→100%)
              const maxCount = coChangers[0]?.co_change_count ?? 1
              const barPct = Math.max(10, (cc.co_change_count / maxCount) * 100)
              return (
                <div key={cc.file_path} className="flex items-center gap-2 group">
                  <span
                    className="text-[10px] text-slate-400 font-mono truncate flex-1 group-hover:text-orange-300"
                    title={cc.file_path}
                  >
                    {ccBase}
                  </span>
                  <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden shrink-0">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: '#FED7AA',
                        opacity: 0.6 + (barPct / 100) * 0.4,
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 min-w-[16px] text-right">
                    {cc.co_change_count}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export const FileContextCard = memo(FileContextCardComponent)
