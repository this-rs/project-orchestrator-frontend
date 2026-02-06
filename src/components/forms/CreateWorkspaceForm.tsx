import { useState } from 'react'
import { Input, Textarea } from '@/components/ui'

export interface CreateWorkspaceFormData {
  name: string
  slug: string
  description: string
}

interface Props {
  onSubmit: (data: CreateWorkspaceFormData) => Promise<void>
  loading?: boolean
}

export function CreateWorkspaceForm({ onSubmit, loading }: Props) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleNameChange = (value: string) => {
    setName(value)
    if (!slug) {
      setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    }
  }

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
          placeholder="My Workspace"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          error={errors.name}
          disabled={loading}
          autoFocus
        />
        <Input
          label="Slug"
          placeholder="my-workspace"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          disabled={loading}
        />
        <Textarea
          label="Description"
          placeholder="Optional description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          rows={3}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return
      await onSubmit({
        name: name.trim(),
        slug: slug.trim() || undefined as unknown as string,
        description: description.trim(),
      })
    },
  }
}
