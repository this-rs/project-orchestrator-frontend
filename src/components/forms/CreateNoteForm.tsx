import { useState, useEffect } from 'react'
import { Textarea, Select, Input } from '@/components/ui'
import { projectsApi } from '@/services'
import type { Project, NoteType, NoteImportance } from '@/types'

export interface CreateNoteFormData {
  project_id: string
  note_type: NoteType
  content: string
  importance?: NoteImportance
  tags: string[]
}

interface Props {
  onSubmit: (data: CreateNoteFormData) => Promise<void>
  loading?: boolean
  defaultProjectId?: string
}

const typeOptions = [
  { value: 'guideline', label: 'Guideline' },
  { value: 'gotcha', label: 'Gotcha' },
  { value: 'pattern', label: 'Pattern' },
  { value: 'context', label: 'Context' },
  { value: 'tip', label: 'Tip' },
  { value: 'observation', label: 'Observation' },
  { value: 'assertion', label: 'Assertion' },
]

const importanceOptions = [
  { value: '', label: 'Default' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

export function CreateNoteForm({ onSubmit, loading, defaultProjectId }: Props) {
  const [projectId, setProjectId] = useState(defaultProjectId || '')
  const [noteType, setNoteType] = useState<string>('guideline')
  const [content, setContent] = useState('')
  const [importance, setImportance] = useState('')
  const [tags, setTags] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    projectsApi.list({ limit: 100 }).then((res) => setProjects(res.items || [])).catch(() => {})
  }, [])

  const projectOptions = [
    { value: '', label: 'Select a project' },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ]

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!projectId) errs.project_id = 'Project is required'
    if (!content.trim()) errs.content = 'Content is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Select
          label="Project"
          options={projectOptions}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          error={errors.project_id}
          disabled={loading}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Select
            label="Type"
            options={typeOptions}
            value={noteType}
            onChange={(e) => setNoteType(e.target.value)}
            disabled={loading}
          />
          <Select
            label="Importance"
            options={importanceOptions}
            value={importance}
            onChange={(e) => setImportance(e.target.value)}
            disabled={loading}
          />
        </div>
        <Textarea
          label="Content"
          placeholder="Write the note content..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          error={errors.content}
          disabled={loading}
          autoFocus
          rows={5}
        />
        <Input
          label="Tags"
          placeholder="Comma-separated tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          disabled={loading}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return
      await onSubmit({
        project_id: projectId,
        note_type: noteType as NoteType,
        content: content.trim(),
        importance: (importance as NoteImportance) || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      })
    },
  }
}
