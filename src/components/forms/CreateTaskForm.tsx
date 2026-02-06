import { useState } from 'react'
import { Input, Textarea } from '@/components/ui'

export interface CreateTaskFormData {
  title: string
  description: string
  priority?: number
  tags: string[]
  estimated_complexity?: number
}

interface Props {
  onSubmit: (data: CreateTaskFormData) => Promise<void>
  loading?: boolean
}

export function CreateTaskForm({ onSubmit, loading }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('')
  const [tags, setTags] = useState('')
  const [complexity, setComplexity] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!description.trim()) errs.description = 'Description is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label="Title"
          placeholder="Task title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading}
          autoFocus
        />
        <Textarea
          label="Description"
          placeholder="Describe what needs to be done..."
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
            placeholder="1-10"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            disabled={loading}
          />
          <Input
            label="Estimated Complexity"
            type="number"
            min={1}
            max={10}
            placeholder="1-10"
            value={complexity}
            onChange={(e) => setComplexity(e.target.value)}
            disabled={loading}
          />
        </div>
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
        title: title.trim() || undefined as unknown as string,
        description: description.trim(),
        priority: priority ? parseInt(priority) : undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        estimated_complexity: complexity ? parseInt(complexity) : undefined,
      })
    },
  }
}
