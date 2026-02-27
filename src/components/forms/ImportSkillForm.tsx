import { useState, useRef } from 'react'
import { Upload, FileJson, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Select, Badge } from '@/components/ui'
import type { SkillPackage, ImportSkillRequest } from '@/types'

interface Props {
  projects: { id: string; name: string }[]
  onSubmit: (data: ImportSkillRequest) => Promise<void>
}

function validatePackage(data: unknown): data is SkillPackage {
  if (!data || typeof data !== 'object') return false
  const pkg = data as Record<string, unknown>
  if (typeof pkg.schema_version !== 'number') return false
  if (!pkg.metadata || typeof pkg.metadata !== 'object') return false
  if (!pkg.skill || typeof pkg.skill !== 'object') return false
  const skill = pkg.skill as Record<string, unknown>
  if (typeof skill.name !== 'string' || !skill.name) return false
  if (!Array.isArray(pkg.notes)) return false
  if (!Array.isArray(pkg.decisions)) return false
  return true
}

export function ImportSkillForm({ projects, onSubmit }: Props) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [conflictStrategy, setConflictStrategy] = useState<'skip' | 'merge' | 'replace'>('skip')
  const [parsedPackage, setParsedPackage] = useState<SkillPackage | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }))
  const conflictOptions = [
    { value: 'skip', label: 'Skip (keep existing)' },
    { value: 'merge', label: 'Merge' },
    { value: 'replace', label: 'Replace' },
  ]

  const handleFile = async (file: File) => {
    setParseError(null)
    setParsedPackage(null)

    if (!file.name.endsWith('.json')) {
      setParseError('File must be a .json file')
      return
    }

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!validatePackage(data)) {
        setParseError('Invalid skill package format. Expected schema_version, metadata, skill, notes, and decisions fields.')
        return
      }
      setParsedPackage(data as SkillPackage)
    } catch {
      setParseError('Failed to parse JSON file')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!projectId) errs.project_id = 'Project is required'
    if (!parsedPackage) errs.file = 'Please upload a skill package JSON file'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        {/* Drop zone / file input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Skill Package</label>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
              parsedPackage
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : parseError
                  ? 'border-red-500/30 bg-red-500/5'
                  : 'border-white/[0.1] bg-white/[0.02] hover:border-white/[0.2] hover:bg-white/[0.04]'
            }`}
          >
            {parsedPackage ? (
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            ) : parseError ? (
              <AlertCircle className="w-8 h-8 text-red-400" />
            ) : (
              <Upload className="w-8 h-8 text-gray-500" />
            )}
            <span className="text-sm text-gray-400">
              {parsedPackage
                ? 'Package loaded — click to replace'
                : 'Drop a .json file here or click to browse'}
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleInputChange}
          />
          {parseError && (
            <p className="mt-1.5 text-xs text-red-400">{parseError}</p>
          )}
          {errors.file && !parseError && (
            <p className="mt-1.5 text-xs text-red-400">{errors.file}</p>
          )}
        </div>

        {/* Preview */}
        {parsedPackage && (
          <div className="p-4 rounded-lg bg-white/[0.04] border border-white/[0.08] space-y-2">
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold text-gray-200">{parsedPackage.skill.name}</span>
            </div>
            {parsedPackage.skill.description && (
              <p className="text-xs text-gray-400 line-clamp-2">{parsedPackage.skill.description}</p>
            )}
            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
              <span>{parsedPackage.notes.length} notes</span>
              <span>{parsedPackage.decisions.length} decisions</span>
              {parsedPackage.skill.tags.length > 0 && (
                <div className="flex gap-1">
                  {parsedPackage.skill.tags.slice(0, 3).map((t) => (
                    <Badge key={t} variant="default">{t}</Badge>
                  ))}
                </div>
              )}
            </div>
            {parsedPackage.metadata.source_project && (
              <p className="text-xs text-gray-500">
                Source: {parsedPackage.metadata.source_project}
              </p>
            )}
          </div>
        )}

        {/* Project destination */}
        <Select
          label="Destination Project"
          options={projectOptions}
          value={projectId}
          onChange={setProjectId}
          error={errors.project_id}
        />

        {/* Conflict strategy */}
        <Select
          label="Conflict Strategy"
          options={conflictOptions}
          value={conflictStrategy}
          onChange={(v) => setConflictStrategy(v as 'skip' | 'merge' | 'replace')}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        project_id: projectId,
        package: parsedPackage!,
        conflict_strategy: conflictStrategy,
      })
    },
  }
}
