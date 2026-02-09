import { useState } from 'react'
import { Input, Textarea, Select } from '@/components/ui'
import type { ComponentType } from '@/types'

export interface CreateComponentFormData {
  name: string
  component_type: ComponentType
  description?: string
  runtime?: string
  tags: string[]
}

interface Props {
  onSubmit: (data: CreateComponentFormData) => Promise<void>
  loading?: boolean
}

const typeOptions = [
  { value: 'service', label: 'Service' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'worker', label: 'Worker' },
  { value: 'database', label: 'Database' },
  { value: 'message_queue', label: 'Message Queue' },
  { value: 'cache', label: 'Cache' },
  { value: 'gateway', label: 'Gateway' },
  { value: 'external', label: 'External' },
  { value: 'other', label: 'Other' },
]

export function CreateComponentForm({ onSubmit, loading }: Props) {
  const [name, setName] = useState('')
  const [componentType, setComponentType] = useState<string>('service')
  const [description, setDescription] = useState('')
  const [runtime, setRuntime] = useState('')
  const [tags, setTags] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Name is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label="Name"
          placeholder="Component name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          disabled={loading}
          autoFocus
        />
        <Select
          label="Type"
          options={typeOptions}
          value={componentType}
          onChange={(value) => setComponentType(value)}
          disabled={loading}
        />
        <Textarea
          label="Description"
          placeholder="Optional description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          rows={2}
        />
        <Input
          label="Runtime"
          placeholder="node, python, rust, etc."
          value={runtime}
          onChange={(e) => setRuntime(e.target.value)}
          disabled={loading}
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
        name: name.trim(),
        component_type: componentType as ComponentType,
        description: description.trim() || undefined,
        runtime: runtime.trim() || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      })
    },
  }
}
