import { useState } from 'react'
import { Input, Textarea, Select } from '@/components/ui'
import type { CreateFeatureGraphRequest } from '@/types'

interface Props {
  projects: { id: string; name: string }[]
  onSubmit: (data: CreateFeatureGraphRequest) => Promise<void>
}

export function CreateFeatureGraphForm({ projects, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }))

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Name is required'
    if (!projectId) errs.project_id = 'Project is required'
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
          onChange={setProjectId}
          error={errors.project_id}
        />
        <Input
          label="Name"
          placeholder="Feature graph name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          autoFocus
        />
        <Textarea
          label="Description"
          placeholder="Describe this feature graph..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        project_id: projectId,
        name: name.trim(),
        description: description.trim() || undefined,
      })
    },
  }
}
