import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Upload, FileJson, AlertCircle, CheckCircle2 } from 'lucide-react'
import { MetaLine, Select, focusRing, pluralize } from '@/components/ui'
import type { SkillPackage, ImportSkillRequest } from '@/types'

interface Props {
  projects: { id: string; name: string }[]
  onSubmit: (data: ImportSkillRequest) => Promise<void>
}

const conflictOptions = [
  { value: 'skip', label: 'Skip (keep existing)' },
  { value: 'merge', label: 'Merge (add new notes)' },
  { value: 'replace', label: 'Replace (overwrite)' },
]

/** Structural check of an exported skill package (schema_version + metadata + skill + notes + decisions). */
export function isSkillPackage(data: unknown): data is SkillPackage {
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

/** `#a #b #c +2` — same shape as the list meta lines. */
function tagLine(tags: string[] | undefined, max = 3): string | null {
  if (!tags || tags.length === 0) return null
  const shown = tags.slice(0, max).map((t) => `#${t}`).join(' ')
  return tags.length > max ? `${shown} +${tags.length - max}` : shown
}

/**
 * Import a skill package (.json exported from another project). Returns
 * `{ fields, submit }` like the other forms (render `fields` in a FormDialog).
 *
 * The drop zone is a real button (keyboard + screen reader reachable, ≥ 36px
 * tall); drag-and-drop is an enhancement on top of it.
 */
export function ImportSkillForm({ projects, onSubmit }: Props) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [conflictStrategy, setConflictStrategy] = useState<'skip' | 'merge' | 'replace'>('skip')
  const [parsedPackage, setParsedPackage] = useState<SkillPackage | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }))

  const handleFile = async (file: File) => {
    setParseError(null)
    setParsedPackage(null)
    setFileName(file.name)
    setErrors((e) => ({ ...e, file: '' }))

    if (!file.name.endsWith('.json')) {
      setParseError('The package must be a .json file.')
      return
    }
    try {
      const data: unknown = JSON.parse(await file.text())
      if (!isSkillPackage(data)) {
        setParseError('Not a skill package: expected schema_version, metadata, skill, notes and decisions.')
        return
      }
      setParsedPackage(data)
    } catch {
      setParseError('The file is not valid JSON.')
    }
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
    // Allow picking the same file again after a fix
    e.target.value = ''
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!projectId) errs.project_id = 'Project is required'
    if (!parsedPackage) errs.file = 'Choose a skill package (.json) first'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const tone = parsedPackage
    ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
    : parseError
      ? 'border-red-500/30 bg-red-500/[0.04]'
      : dragging
        ? 'border-indigo-500/50 bg-indigo-500/[0.06]'
        : 'border-white/[0.1] bg-white/[0.02] hover:border-white/[0.2] hover:bg-white/[0.04]'

  const pkg = parsedPackage
  const fileError = parseError ?? (errors.file || null)

  return {
    fields: (
      <>
        <div>
          <p id="skill-package-label" className="block text-sm font-medium text-gray-300 mb-1">
            Skill package
          </p>
          <button
            type="button"
            aria-labelledby="skill-package-label"
            aria-describedby={fileError ? 'skill-package-error' : undefined}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`w-full min-h-24 flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed text-center transition-colors ${focusRing} ${tone}`}
          >
            {pkg ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400" aria-hidden="true" />
            ) : parseError ? (
              <AlertCircle className="w-6 h-6 text-red-400" aria-hidden="true" />
            ) : (
              <Upload className="w-6 h-6 text-gray-500" aria-hidden="true" />
            )}
            <span className="text-sm text-gray-300 break-words">
              {pkg ? 'Package loaded — tap to replace' : 'Tap to choose a .json file, or drop it here'}
            </span>
            {fileName && <span className="text-xs text-gray-500 break-all">{fileName}</span>}
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleInputChange} />
          {fileError && (
            <p id="skill-package-error" className="mt-1.5 text-xs text-red-400" role="alert">
              {fileError}
            </p>
          )}
        </div>

        {pkg && (
          <section aria-label="Package preview" className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 space-y-1">
            <p className="flex items-start gap-1.5 text-sm text-gray-200 min-w-0">
              <FileJson className="w-4 h-4 mt-0.5 shrink-0 text-indigo-400" aria-hidden="true" />
              <span className="break-words">{pkg.skill.name}</span>
            </p>
            {pkg.skill.description && <p className="text-xs text-gray-500 line-clamp-2 break-words">{pkg.skill.description}</p>}
            <MetaLine
              items={[
                pluralize(pkg.notes.length, 'note'),
                pluralize(pkg.decisions.length, 'decision'),
                pkg.protocols?.length ? pluralize(pkg.protocols.length, 'protocol') : null,
                pkg.metadata.source_project ? `from ${pkg.metadata.source_project}` : null,
                tagLine(pkg.skill.tags),
              ]}
            />
          </section>
        )}

        <Select label="Destination project" options={projectOptions} value={projectId} onChange={setProjectId} error={errors.project_id} />
        <Select
          label="If the skill already exists"
          options={conflictOptions}
          value={conflictStrategy}
          onChange={(v) => setConflictStrategy(v as 'skip' | 'merge' | 'replace')}
        />
      </>
    ),
    submit: async () => {
      if (!validate() || !parsedPackage) return false
      await onSubmit({ project_id: projectId, package: parsedPackage, conflict_strategy: conflictStrategy })
    },
  }
}
