import { useState } from 'react'
import { Input, Textarea } from '@/components/ui'

export interface CreateMilestoneFormData {
  title: string
  description?: string
  target_date?: string
  tags?: string[]
}

interface Props {
  onSubmit: (data: CreateMilestoneFormData) => Promise<void>
}

export function CreateMilestoneForm({ onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [tags, setTags] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Title is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label="Title"
          placeholder="Milestone title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}

          autoFocus
        />
        <Textarea
          label="Description"
          placeholder="Optional description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}

          rows={3}
        />
        <Input
          label="Target Date"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}

        />
        <Input
          label="Tags"
          placeholder="Comma-separated tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}

        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        target_date: targetDate || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      })
    },
  }
}
