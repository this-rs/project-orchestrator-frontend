import { useState, useEffect } from 'react'
import { Textarea, Select, Input } from '@/components/ui'
import { workspacesApi } from '@/services'
import type { Project, NoteType, NoteImportance } from '@/types'
import { useT } from '@/i18n'

export interface CreateNoteFormData {
  project_id: string
  note_type: NoteType
  content: string
  importance?: NoteImportance
  tags: string[]
}

interface Props {
  onSubmit: (data: CreateNoteFormData) => Promise<void>
  defaultProjectId?: string
  workspaceSlug?: string
}

export function CreateNoteForm({ onSubmit, defaultProjectId, workspaceSlug }: Props) {
  const { t } = useT()
  const typeOptions = [
    { value: 'guideline', label: t('forms.noteType.guideline') },
    { value: 'gotcha', label: t('forms.noteType.gotcha') },
    { value: 'pattern', label: t('forms.noteType.pattern') },
    { value: 'context', label: t('forms.noteType.context') },
    { value: 'tip', label: t('forms.noteType.tip') },
    { value: 'observation', label: t('forms.noteType.observation') },
    { value: 'assertion', label: t('forms.noteType.assertion') },
  ]
  const importanceOptions = [
    { value: '', label: t('forms.default') },
    { value: 'low', label: t('ui.status.low') },
    { value: 'medium', label: t('ui.status.medium') },
    { value: 'high', label: t('ui.status.high') },
    { value: 'critical', label: t('ui.status.critical') },
  ]
  const [projectId, setProjectId] = useState(defaultProjectId || '')
  const [noteType, setNoteType] = useState<string>('guideline')
  const [content, setContent] = useState('')
  const [importance, setImportance] = useState('')
  const [tags, setTags] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (workspaceSlug) {
      workspacesApi.listProjects(workspaceSlug).then((data) => {
        setProjects(Array.isArray(data) ? data : [])
      }).catch(() => {})
    }
  }, [workspaceSlug])

  const projectOptions = [
    { value: '', label: t('forms.globalProject') },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ]

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!content.trim()) errs.content = t('forms.error.content')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Select
          label={t('forms.field.project')}
          options={projectOptions}
          value={projectId}
          onChange={(value) => setProjectId(value)}
          error={errors.project_id}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Select
            label={t('forms.field.type')}
            options={typeOptions}
            value={noteType}
            onChange={(value) => setNoteType(value)}
          />
          <Select
            label={t('forms.field.importance')}
            options={importanceOptions}
            value={importance}
            onChange={(value) => setImportance(value)}
          />
        </div>
        <Textarea
          label={t('forms.field.content')}
          placeholder={t('forms.placeholder.noteContent')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          error={errors.content}
          autoFocus
          rows={5}
        />
        <Input
          label={t('forms.field.tags')}
          placeholder={t('forms.placeholder.tags')}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
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
