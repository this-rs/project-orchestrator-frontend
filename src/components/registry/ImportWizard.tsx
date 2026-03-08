import { useState, useEffect } from 'react'
import { Download, FileText, GitBranch, Tag, Globe, CheckCircle2, AlertTriangle } from 'lucide-react'
import { registryApi } from '@/services'
import { Dialog } from '@/components/ui/Dialog'
import { Button, Select, Spinner, Badge } from '@/components/ui'
import { TrustScoreBar } from './TrustBadge'
import type { PublishedSkillSummary, PublishedSkill, SkillImportResult } from '@/types'

// ── Conflict strategy options ─────────────────────────────────────────────

const strategyOptions = [
  { value: 'skip', label: 'Skip (keep existing)' },
  { value: 'merge', label: 'Merge (add new notes)' },
  { value: 'replace', label: 'Replace (overwrite)' },
]

// ── Import Wizard Dialog ──────────────────────────────────────────────────

interface ImportWizardProps {
  /** The skill summary selected for import (null = closed) */
  skill: PublishedSkillSummary | null
  /** Target project ID for import */
  projectId: string
  /** Called after successful import with the result */
  onImported: (result: SkillImportResult) => void
  /** Close the wizard */
  onClose: () => void
}

type WizardStep = 'preview' | 'importing' | 'success' | 'error'

export function ImportWizard({ skill, projectId, onImported, onClose }: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('preview')
  const [fullSkill, setFullSkill] = useState<PublishedSkill | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [strategy, setStrategy] = useState<string>('skip')
  const [result, setResult] = useState<SkillImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch full skill details when skill is selected
  useEffect(() => {
    if (!skill) {
      setStep('preview')
      setFullSkill(null)
      setResult(null)
      setError(null)
      return
    }

    setLoadingDetail(true)
    registryApi
      .get(skill.id)
      .then((data) => {
        setFullSkill(data)
        setLoadingDetail(false)
      })
      .catch(() => {
        setLoadingDetail(false)
        // Use summary data only
      })
  }, [skill])

  const handleImport = async () => {
    if (!skill) return
    setStep('importing')
    setError(null)

    try {
      const importResult = await registryApi.import(skill.id, {
        project_id: projectId,
        conflict_strategy: strategy as 'skip' | 'merge' | 'replace',
      })
      setResult(importResult)
      setStep('success')
      onImported(importResult)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      setError(msg)
      setStep('error')
    }
  }

  if (!skill) return null

  return (
    <Dialog open={!!skill} onClose={onClose} title="Import Skill" size="md">
      {step === 'preview' && (
        <PreviewStep
          skill={skill}
          fullSkill={fullSkill}
          loadingDetail={loadingDetail}
          strategy={strategy}
          onStrategyChange={setStrategy}
          onImport={handleImport}
          onCancel={onClose}
        />
      )}
      {step === 'importing' && <ImportingStep skill={skill} />}
      {step === 'success' && result && (
        <SuccessStep skill={skill} result={result} onClose={onClose} />
      )}
      {step === 'error' && <ErrorStep error={error} onRetry={handleImport} onClose={onClose} />}
    </Dialog>
  )
}

// ── Preview Step ──────────────────────────────────────────────────────────

interface PreviewStepProps {
  skill: PublishedSkillSummary
  fullSkill: PublishedSkill | null
  loadingDetail: boolean
  strategy: string
  onStrategyChange: (v: string) => void
  onImport: () => void
  onCancel: () => void
}

function PreviewStep({
  skill,
  fullSkill,
  loadingDetail,
  strategy,
  onStrategyChange,
  onImport,
  onCancel,
}: PreviewStepProps) {
  const noteCount = fullSkill?.package?.notes?.length ?? skill.note_count
  const protocolCount = fullSkill?.package?.protocols?.length ?? skill.protocol_count
  const decisionCount = fullSkill?.package?.decisions?.length ?? 0

  return (
    <div className="space-y-4">
      {/* Skill info */}
      <div>
        <h4 className="text-sm font-semibold text-gray-100 mb-1">{skill.name}</h4>
        {skill.description && <p className="text-xs text-gray-400">{skill.description}</p>}
      </div>

      {/* Source */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>from {skill.source_project_name}</span>
        {skill.is_remote && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 ring-1 ring-inset ring-blue-500/20 text-[10px] font-medium">
            <Globe className="w-2.5 h-2.5" />
            Remote
          </span>
        )}
      </div>

      {/* Trust score bar */}
      <TrustScoreBar trustScore={skill.trust_score} trustLevel={skill.trust_level} />

      {/* Package contents */}
      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
        <h5 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Package Contents</h5>
        <div className="grid grid-cols-3 gap-2">
          <ContentStat icon={FileText} label="Notes" count={noteCount} />
          <ContentStat icon={GitBranch} label="Decisions" count={decisionCount} />
          <ContentStat icon={Tag} label="Protocols" count={protocolCount} />
        </div>

        {/* Note preview (from full skill) */}
        {fullSkill?.package?.notes && fullSkill.package.notes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <h5 className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
              Notes Preview
            </h5>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {fullSkill.package.notes.slice(0, 5).map((note, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <Badge variant="default" className="shrink-0 mt-0.5">
                    {note.note_type}
                  </Badge>
                  <span className="text-gray-400 line-clamp-1">{note.content}</span>
                </div>
              ))}
              {fullSkill.package.notes.length > 5 && (
                <span className="text-[10px] text-gray-500">
                  +{fullSkill.package.notes.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {loadingDetail && (
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <Spinner size="sm" />
            Loading package details...
          </div>
        )}
      </div>

      {/* Tags */}
      {skill.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {skill.tags.map((tag) => (
            <Badge key={tag} variant="default">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Conflict strategy */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">
          If a skill with the same name already exists:
        </label>
        <Select options={strategyOptions} value={strategy} onChange={onStrategyChange} />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onImport}>
          <Download className="w-4 h-4 mr-1.5" />
          Import Skill
        </Button>
      </div>
    </div>
  )
}

// ── Content stat ──────────────────────────────────────────────────────────

function ContentStat({
  icon: Icon,
  label,
  count,
}: {
  icon: typeof FileText
  label: string
  count: number
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5">
        <Icon className="w-3 h-3" />
        <span className="text-sm font-medium">{count}</span>
      </div>
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  )
}

// ── Importing Step ────────────────────────────────────────────────────────

function ImportingStep({ skill }: { skill: PublishedSkillSummary }) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <Spinner size="lg" className="mb-4" />
      <h4 className="text-sm font-medium text-gray-200 mb-1">
        Importing "{skill.name}"...
      </h4>
      <p className="text-xs text-gray-500">
        Creating skill, notes, and decisions in your project.
      </p>
    </div>
  )
}

// ── Success Step ──────────────────────────────────────────────────────────

function SuccessStep({
  skill,
  result,
  onClose,
}: {
  skill: PublishedSkillSummary
  result: SkillImportResult
  onClose: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="w-12 h-12 rounded-full bg-emerald-900/30 flex items-center justify-center mb-4">
        <CheckCircle2 className="w-6 h-6 text-emerald-400" />
      </div>
      <h4 className="text-sm font-semibold text-gray-100 mb-1">
        "{skill.name}" imported successfully
      </h4>

      {/* Import stats */}
      <div className="flex items-center gap-4 text-xs text-gray-400 mt-2 mb-4">
        <span>{result.notes_created} notes created</span>
        <span>{result.decisions_imported} decisions</span>
        <span>{result.synapses_created} synapses</span>
      </div>

      {result.conflict && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-500/20 text-xs text-amber-400">
          Conflict resolved: {result.conflict.strategy_applied} for existing skill
        </div>
      )}

      <Button onClick={onClose}>Done</Button>
    </div>
  )
}

// ── Error Step ────────────────────────────────────────────────────────────

function ErrorStep({
  error,
  onRetry,
  onClose,
}: {
  error: string | null
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-red-400" />
      </div>
      <h4 className="text-sm font-semibold text-gray-100 mb-1">Import Failed</h4>
      <p className="text-xs text-gray-400 text-center max-w-xs mb-4">{error}</p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onRetry}>Retry</Button>
      </div>
    </div>
  )
}
