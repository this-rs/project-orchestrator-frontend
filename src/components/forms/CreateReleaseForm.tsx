import { useState } from 'react'
import { Input, Textarea } from '@/components/ui'

export interface CreateReleaseFormData {
  version: string
  title?: string
  description?: string
  target_date?: string
}

interface Props {
  onSubmit: (data: CreateReleaseFormData) => Promise<void>
  loading?: boolean
}

export function CreateReleaseForm({ onSubmit, loading }: Props) {
  const [version, setVersion] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!version.trim()) errs.version = 'Version is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label="Version"
          placeholder="1.0.0"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          error={errors.version}
          disabled={loading}
          autoFocus
        />
        <Input
          label="Title"
          placeholder="Release title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
        <Input
          label="Target Date"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          disabled={loading}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return
      await onSubmit({
        version: version.trim(),
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        target_date: targetDate || undefined,
      })
    },
  }
}
