import { memo, useState, useEffect, useCallback } from 'react'
import type { SkillNodeData } from '@/types/intelligence'
import type { Skill, SkillHealth, SkillMembers, Note, Decision } from '@/types'
import { skillsApi } from '@/services/skills'
import {
  Heart,
  StickyNote,
  Scale,
  Zap,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Hash,
  Target,
  Sparkles,
  RefreshCw,
} from 'lucide-react'

// ============================================================================
// MINI GAUGE
// ============================================================================

function MiniGauge({
  label,
  value,
  color,
  max = 1,
}: {
  label: string
  value: number
  color: string
  max?: number
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 min-w-[60px] shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-400 min-w-[32px] text-right">
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  )
}

// ============================================================================
// STATUS & HEALTH BADGES
// ============================================================================

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  emerging: { bg: '#422006', text: '#fbbf24', border: '#854d0e' },
  active: { bg: '#052e16', text: '#4ade80', border: '#166534' },
  dormant: { bg: '#1e293b', text: '#94a3b8', border: '#334155' },
  archived: { bg: '#1e293b', text: '#64748b', border: '#334155' },
  imported: { bg: '#1e1b4b', text: '#a5b4fc', border: '#3730a3' },
}

function StatusBadge({ status }: { status: string }) {
  const colors = statusColors[status] ?? { bg: '#1e293b', text: '#94a3b8', border: '#334155' }
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-md border"
      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
    >
      {status}
    </span>
  )
}

const healthConfig: Record<string, { color: string; Icon: typeof Shield; label: string }> = {
  healthy: { color: '#4ade80', Icon: ShieldCheck, label: 'Healthy' },
  needs_attention: { color: '#fbbf24', Icon: ShieldAlert, label: 'Needs attention' },
  at_risk: { color: '#fb923c', Icon: AlertTriangle, label: 'At risk' },
  should_archive: { color: '#f87171', Icon: Shield, label: 'Should archive' },
}

function HealthBadge({ recommendation }: { recommendation: string }) {
  const cfg = healthConfig[recommendation] ?? healthConfig.needs_attention
  const Icon = cfg.Icon
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-md"
      style={{ color: cfg.color, backgroundColor: `${cfg.color}15` }}
    >
      <Icon size={10} />
      {cfg.label}
    </span>
  )
}

// ============================================================================
// SECTION LOADER
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
// SKILL CONTEXT CARD — MAIN COMPONENT
// ============================================================================

interface SkillContextCardProps {
  data: SkillNodeData
  entityId: string
}

function SkillContextCardComponent({ data, entityId }: SkillContextCardProps) {
  const [skill, setSkill] = useState<Skill | null>(null)
  const [health, setHealth] = useState<SkillHealth | null>(null)
  const [members, setMembers] = useState<SkillMembers | null>(null)
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(false)
  const [activationResult, setActivationResult] = useState<string | null>(null)

  // Fetch enriched data
  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      const results = await Promise.allSettled([
        skillsApi.get(entityId),
        skillsApi.getHealth(entityId),
        skillsApi.getMembers(entityId),
      ])

      if (cancelled) return

      if (results[0].status === 'fulfilled') setSkill(results[0].value)
      if (results[1].status === 'fulfilled') setHealth(results[1].value)
      if (results[2].status === 'fulfilled') setMembers(results[2].value)

      setLoading(false)
    }

    fetchAll()
    return () => { cancelled = true }
  }, [entityId])

  // Activate skill
  const handleActivate = useCallback(async () => {
    setActivating(true)
    setActivationResult(null)
    try {
      const result = await skillsApi.activate(entityId, data.label)
      setActivationResult(
        `Activated with ${result.activated_notes.length} notes, confidence ${(result.confidence * 100).toFixed(0)}%`,
      )
    } catch (err) {
      setActivationResult(err instanceof Error ? `Error: ${err.message}` : 'Activation failed')
    } finally {
      setActivating(false)
    }
  }, [entityId, data.label])

  // Derived
  const notes: Note[] = members?.notes ?? []
  const decisions: Decision[] = members?.decisions ?? []
  const triggerPatterns = skill?.trigger_patterns ?? []
  const description = skill?.description ?? ''

  return (
    <div className="space-y-3">
      {/* ── Status & Health row ────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={data.status} />
        {health && <HealthBadge recommendation={health.recommendation} />}
        {skill?.is_validated && (
          <span className="text-[9px] text-emerald-500 font-medium">Validated</span>
        )}
        {health?.in_probation && (
          <span className="text-[9px] text-amber-500 font-medium">
            Probation ({health.probation_days_remaining ?? '?'}d left)
          </span>
        )}
      </div>

      {/* ── Description ───────────────────────────────────────────── */}
      {description && (
        <p className="text-[10px] text-slate-400 italic leading-relaxed line-clamp-3">
          {description}
        </p>
      )}

      {/* ── Energy, Cohesion & Coverage gauges ────────────────────── */}
      <div className="space-y-1.5">
        <MiniGauge label="Energy" value={data.energy} color="#ec4899" />
        <MiniGauge label="Cohesion" value={data.cohesion} color="#a78bfa" />
        {skill && <MiniGauge label="Coverage" value={skill.coverage} color="#06b6d4" />}
        {skill && <MiniGauge label="Hit Rate" value={skill.hit_rate} color="#22c55e" />}
      </div>

      {/* ── Stats counters ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
          <StickyNote size={10} className="text-amber-400" />
          {notes.length || data.noteCount} notes
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
          <Scale size={10} className="text-violet-400" />
          {decisions.length || 0} decisions
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
          <Zap size={10} className="text-pink-400" />
          {skill?.activation_count ?? data.activationCount} activations
        </span>
      </div>

      {/* ── Trigger Patterns ──────────────────────────────────────── */}
      {triggerPatterns.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Target size={10} className="text-pink-400" />
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
              Trigger Patterns
            </span>
          </div>
          <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
            {triggerPatterns.map((tp, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800/40"
              >
                <span className="text-[8px] text-pink-600 font-mono uppercase min-w-[36px]">
                  {tp.pattern_type}
                </span>
                <span className="text-[10px] text-slate-300 font-mono truncate flex-1">
                  {tp.pattern_value}
                </span>
                <span className="text-[8px] text-slate-600">
                  {(tp.confidence_threshold * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Member Notes ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <StickyNote size={10} className="text-amber-400" />
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
            Member Notes
          </span>
          {!loading && (
            <span className="text-[10px] text-slate-600 font-mono">({notes.length})</span>
          )}
        </div>
        {loading ? (
          <SectionLoader label="Loading members..." />
        ) : notes.length === 0 ? (
          <p className="text-[10px] text-slate-600 italic pl-3">No member notes</p>
        ) : (
          <div className="space-y-0.5 max-h-[100px] overflow-y-auto">
            {notes.slice(0, 8).map((note) => (
              <div
                key={note.id}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-slate-800/60 group"
              >
                <span className="text-[9px] font-medium text-amber-500 min-w-[48px]">
                  {note.note_type}
                </span>
                <span className="text-[10px] text-slate-400 truncate flex-1 group-hover:text-amber-200">
                  {note.content.slice(0, 80)}
                </span>
              </div>
            ))}
            {notes.length > 8 && (
              <p className="text-[9px] text-slate-600 pl-2">+{notes.length - 8} more</p>
            )}
          </div>
        )}
      </div>

      {/* ── Member Decisions ──────────────────────────────────────── */}
      {decisions.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Scale size={10} className="text-violet-400" />
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
              Member Decisions
            </span>
            <span className="text-[10px] text-slate-600 font-mono">({decisions.length})</span>
          </div>
          <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
            {decisions.slice(0, 5).map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-slate-800/60 group"
              >
                <span className="text-[9px] text-violet-500 min-w-[48px]">{d.status}</span>
                <span className="text-[10px] text-slate-400 truncate flex-1 group-hover:text-violet-200">
                  {d.description.slice(0, 80)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Health explanation ─────────────────────────────────────── */}
      {health?.explanation && (
        <div className="bg-slate-800/40 rounded-md p-2 border border-slate-700/40">
          <p className="text-[10px] text-slate-400 mb-0.5 font-medium uppercase tracking-wider">
            <Heart size={9} className="inline mr-1 text-pink-400" />
            Health Assessment
          </p>
          <p className="text-[10px] text-slate-300 leading-relaxed">
            {health.explanation}
          </p>
        </div>
      )}

      {/* ── Tags ──────────────────────────────────────────────────── */}
      {skill?.tags && skill.tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <Hash size={10} className="text-slate-500 shrink-0" />
          {skill.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono rounded bg-pink-950/30 text-pink-300 border border-pink-900/40"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* ── Activate button ───────────────────────────────────────── */}
      <button
        onClick={handleActivate}
        disabled={activating}
        className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors
          bg-pink-950/40 border-pink-800 text-pink-400 hover:bg-pink-900/40 hover:text-pink-300
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {activating ? (
          <>
            <RefreshCw size={12} className="animate-spin" />
            Activating...
          </>
        ) : (
          <>
            <Sparkles size={12} />
            Activate Skill
          </>
        )}
      </button>

      {activationResult && (
        <p className={`text-[10px] px-1 ${activationResult.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
          {activationResult}
        </p>
      )}
    </div>
  )
}

export const SkillContextCard = memo(SkillContextCardComponent)
