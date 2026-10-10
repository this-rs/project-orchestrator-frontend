import { useState, useEffect } from 'react'
import { Input, Textarea, Select } from '@/components/ui'
import { workspacesApi } from '@/services'
import type { Project } from '@/types'
import { useT } from '@/i18n'

export interface CreatePlanFormData {
  title: string
  description: string
  priority: number
  project_id?: string
}

interface Props {
  onSubmit: (data: CreatePlanFormData) => Promise<void>
  defaultProjectId?: string
  workspaceSlug?: string
}

export function CreatePlanForm({ onSubmit, defaultProjectId, workspaceSlug }: Props) {
  const { t } = useT()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('5')
  const [projectId, setProjectId] = useState(defaultProjectId || '')
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
    { value: '', label: t('forms.noProject') },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ]

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = t('forms.error.title')
    if (!description.trim()) errs.description = t('forms.error.description')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label={t('forms.field.title')}
          placeholder={t('forms.placeholder.planTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          autoFocus
        />
        <Textarea
          label={t('forms.field.description')}
          placeholder={t('forms.placeholder.planDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          rows={4}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Input
            label={t('forms.field.priority')}
            type="number"
            min={1}
            max={10}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
          <Select
            label={t('forms.field.project')}
            options={projectOptions}
            value={projectId}
            onChange={(value) => setProjectId(value)}
          />
        </div>
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        priority: parseInt(priority) || 5,
        project_id: projectId || undefined,
      })
      // Fresh form for the next "New plan"
      setTitle('')
      setDescription('')
      setPriority('5')
    },
  }
}
