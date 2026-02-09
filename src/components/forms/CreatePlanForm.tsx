import { useState, useEffect } from 'react'
import { Input, Textarea, Select } from '@/components/ui'
import { projectsApi } from '@/services'
import type { Project } from '@/types'

export interface CreatePlanFormData {
  title: string
  description: string
  priority: number
  project_id?: string
}

interface Props {
  onSubmit: (data: CreatePlanFormData) => Promise<void>
  loading?: boolean
  defaultProjectId?: string
}

export function CreatePlanForm({ onSubmit, loading, defaultProjectId }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('5')
  const [projectId, setProjectId] = useState(defaultProjectId || '')
  const [projects, setProjects] = useState<Project[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    projectsApi.list({ limit: 100 }).then((res) => setProjects(res.items || [])).catch(() => {})
  }, [])

  const projectOptions = [
    { value: '', label: 'No project' },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ]

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Title is required'
    if (!description.trim()) errs.description = 'Description is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label="Title"
          placeholder="Plan title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          disabled={loading}
          autoFocus
        />
        <Textarea
          label="Description"
          placeholder="Describe the plan..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          disabled={loading}
          rows={4}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Input
            label="Priority"
            type="number"
            min={1}
            max={10}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            disabled={loading}
          />
          <Select
            label="Project"
            options={projectOptions}
            value={projectId}
            onChange={(value) => setProjectId(value)}
            disabled={loading}
          />
        </div>
      </>
    ),
    submit: async () => {
      if (!validate()) return
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        priority: parseInt(priority) || 5,
        project_id: projectId || undefined,
      })
    },
  }
}
