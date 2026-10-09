import { useState, useEffect } from 'react'
import { Input, Textarea, Select } from '@/components/ui'
import { workspacesApi } from '@/services'
import type { Project } from '@/types'
import { useT } from '@/i18n'

export interface EditPlanFormData {
  title: string
  description: string
  priority: number
  project_id?: string
}

interface Props {
  initialValues: { title: string; description?: string; priority?: number; project_id?: string }
  onSubmit: (data: EditPlanFormData) => Promise<void>
  workspaceSlug?: string
  loading?: boolean
}

export function EditPlanForm({ initialValues, onSubmit, workspaceSlug, loading }: Props) {
  const { t } = useT()
  const [title, setTitle] = useState(initialValues.title)
  const [description, setDescription] = useState(initialValues.description ?? '')
  const [priority, setPriority] = useState(String(initialValues.priority ?? 5))
  const [projectId, setProjectId] = useState(initialValues.project_id ?? '')
  const [projects, setProjects] = useState<Project[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setTitle(initialValues.title)
    setDescription(initialValues.description ?? '')
    setPriority(String(initialValues.priority ?? 5))
    setProjectId(initialValues.project_id ?? '')
    setErrors({})
  }, [initialValues.title, initialValues.description, initialValues.priority, initialValues.project_id])

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
          disabled={loading}
          autoFocus
        />
        <Textarea
          label={t('forms.field.description')}
          placeholder={t('forms.placeholder.planDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
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
            disabled={loading}
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
    },
  }
}
