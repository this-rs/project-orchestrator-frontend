import { useState } from 'react'
import { Input, Textarea } from '@/components/ui'

export interface CreateProjectFormData {
  name: string
  slug: string
  root_path: string
  description: string
}

interface Props {
  onSubmit: (data: CreateProjectFormData) => Promise<void>
  loading?: boolean
}

export function CreateProjectForm({ onSubmit, loading }: Props) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [rootPath, setRootPath] = useState('')
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
    if (!rootPath.trim()) errs.root_path = 'Root path is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label="Name"
          placeholder="My Project"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          error={errors.name}
          disabled={loading}
          autoFocus
        />
        <Input
          label="Slug"
          placeholder="my-project"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          disabled={loading}
        />
        <Input
          label="Root Path"
          placeholder="/path/to/project"
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          error={errors.root_path}
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
        root_path: rootPath.trim(),
        description: description.trim(),
      })
    },
  }
}
