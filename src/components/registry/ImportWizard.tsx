import { useState, useEffect } from 'react'
import { Download, Globe, CheckCircle2, AlertTriangle } from 'lucide-react'
import { registryApi } from '@/services'
import { Dialog } from '@/components/ui/Dialog'
import { Button, MetaLine, Select, Spinner, pluralize } from '@/components/ui'
import { TrustScoreBar } from './TrustBadge'
import { TagChips } from './concepts'
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
  /** Candidate destination projects */
  projects: { id: string; name: string }[]
  /** Pre-selected destination (active project filter); defaults to the first project */
  defaultProjectId?: string
  /** Called after successful import with the result */
  onImported: (result: SkillImportResult) => void
  /** Close the wizard */
  onClose: () => void
}

type WizardStep = 'preview' | 'importing' | 'success' | 'error'

export function ImportWizard({ skill, projects, defaultProjectId, onImported, onClose }: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('preview')
  const [fullSkill, setFullSkill] = useState<PublishedSkill | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [strategy, setStrategy] = useState<string>('skip')
  const [projectId, setProjectId] = useState<string>('')
  const [result, setResult] = useState<SkillImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch full skill details when a skill is selected
  useEffect(() => {
    if (!skill) {
      setStep('preview')
      setFullSkill(null)
      setResult(null)
      setError(null)
      setProjectId('')
      return
    }
    setLoadingDetail(true)
    registryApi
      .get(skill.id)
      .then((data) => setFullSkill(data))
      .catch(() => {
        // Summary data only
      })
      .finally(() => setLoadingDetail(false))
  }, [skill])

  // Explicit choice, else the active project filter, else the first project
  const targetProjectId = projectId || defaultProjectId || projects[0]?.id || ''

  const handleImport = async () => {
    if (!skill || !targetProjectId) return
    setStep('importing')
    setError(null)
    try {
      const importResult = await registryApi.import(skill.id, {
        project_id: targetProjectId,
        conflict_strategy: strategy as 'skip' | 'merge' | 'replace',
      })
      setResult(importResult)
      setStep('success')
      onImported(importResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setStep('error')
    }
  }

  if (!skill) return null

  return (
    <Dialog open={!!skill} onClose={onClose} title="Import skill" size="md">
      {step === 'preview' && (
        <PreviewStep
          skill={skill}
          fullSkill={fullSkill}
          loadingDetail={loadingDetail}
          projects={projects}
          projectId={targetProjectId}
          onProjectChange={setProjectId}
          strategy={strategy}
          onStrategyChange={setStrategy}
          onImport={handleImport}
          onCancel={onClose}
        />
      )}
      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Spinner size="lg" className="mb-4" />
          <p className="text-sm text-gray-200 break-words">Importing “{skill.name}”…</p>
          <p className="mt-1 text-xs text-gray-500">Creating the skill, its notes and decisions in your project.</p>
        </div>
      )}
      {step === 'success' && result && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-3" aria-hidden="true" />
          <p className="text-sm text-gray-100 break-words">“{skill.name}” imported</p>
          <MetaLine
            size="sm"
            className="justify-center mt-2 mb-4"
            items={[
              pluralize(result.notes_created, 'note') + ' created',
              pluralize(result.decisions_imported, 'decision'),
              pluralize(result.synapses_created, 'synapse'),
            ]}
          />
          {result.conflict && (
            <p className="mb-4 text-xs text-amber-400">
              Conflict resolved: {result.conflict.strategy_applied} for the existing skill
            </p>
          )}
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      )}
      {step === 'error' && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mb-3" aria-hidden="true" />
          <p className="text-sm text-gray-100">Import failed</p>
          <p className="mt-1 mb-4 text-xs text-gray-400 max-w-xs break-words">{error}</p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleImport}>
              Retry
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

// ── Preview Step ──────────────────────────────────────────────────────────

interface PreviewStepProps {
  skill: PublishedSkillSummary
  fullSkill: PublishedSkill | null
  loadingDetail: boolean
  projects: { id: string; name: string }[]
  projectId: string
  onProjectChange: (v: string) => void
  strategy: string
  onStrategyChange: (v: string) => void
  onImport: () => void
  onCancel: () => void
}

function PreviewStep({
  skill,
  fullSkill,
  loadingDetail,
  projects,
  projectId,
  onProjectChange,
  strategy,
  onStrategyChange,
  onImport,
  onCancel,
}: PreviewStepProps) {
  const notes = fullSkill?.package?.notes ?? []
  const noteCount = fullSkill?.package?.notes?.length ?? skill.note_count
  const protocolCount = fullSkill?.package?.protocols?.length ?? skill.protocol_count
  const decisionCount = fullSkill?.package?.decisions?.length ?? 0

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-gray-100 break-words">{skill.name}</h4>
        {skill.description && <p className="text-xs text-gray-400 break-words">{skill.description}</p>}
        <MetaLine
          items={[
            <span key="src" className="break-all">from {skill.source_project_name}</span>,
            skill.is_remote ? (
              <span key="remote" className="inline-flex items-center gap-1">
                <Globe className="w-3 h-3" aria-hidden="true" />
                Remote
              </span>
            ) : null,
            skill.import_count > 0 ? `imported ${skill.import_count}×` : null,
          ]}
        />
      </div>

      <TrustScoreBar trustScore={skill.trust_score} trustLevel={skill.trust_level} />

      {/* Package contents */}
      <section aria-label="Package contents" className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 space-y-2">
        <MetaLine
          size="sm"
          items={[
            pluralize(noteCount, 'note'),
            pluralize(decisionCount, 'decision'),
            pluralize(protocolCount, 'protocol'),
          ]}
        />
        {notes.length > 0 && (
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {notes.slice(0, 5).map((note, i) => (
              <li key={i} className="text-xs text-gray-400 line-clamp-2 break-words">
                <span className="text-gray-500">{note.note_type} · </span>
                {note.content}
              </li>
            ))}
            {notes.length > 5 && <li className="text-[11px] text-gray-500">+{notes.length - 5} more</li>}
          </ul>
        )}
        {loadingDetail && (
          <p className="flex items-center gap-2 text-xs text-gray-500">
            <Spinner size="sm" />
            Loading package details…
          </p>
        )}
      </section>

      <TagChips tags={skill.tags} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Destination project"
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          value={projectId}
          onChange={onProjectChange}
          placeholder="Choose a project"
        />
        <Select label="If the skill already exists" options={strategyOptions} value={strategy} onChange={onStrategyChange} />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-white/[0.06]">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onImport} disabled={!projectId}>
          <Download className="w-4 h-4 mr-1.5" aria-hidden="true" />
          Import skill
        </Button>
      </div>
    </div>
  )
}
