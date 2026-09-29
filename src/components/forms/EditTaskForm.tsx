import { useState, useEffect } from 'react'
import { Input, Textarea } from '@/components/ui'

export interface EditTaskFormData {
  title: string
  description: string
  priority: number
  estimated_complexity?: number
  tags?: string[]
}

interface Props {
  initialValues: { title?: string; description?: string; priority?: number; estimated_complexity?: number; tags?: string[] }
  onSubmit: (data: EditTaskFormData) => Promise<void>
  loading?: boolean
}

export function EditTaskForm({ initialValues, onSubmit, loading }: Props) {
  const [title, setTitle] = useState(initialValues.title ?? '')
  const [description, setDescription] = useState(initialValues.description ?? '')
  const [priority, setPriority] = useState(String(initialValues.priority ?? 5))
  const [estimatedComplexity, setEstimatedComplexity] = useState(initialValues.estimated_complexity != null ? String(initialValues.estimated_complexity) : '')
  const [tagsInput, setTagsInput] = useState((initialValues.tags ?? []).join(', '))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setTitle(initialValues.title ?? '')
    setDescription(initialValues.description ?? '')
    setPriority(String(initialValues.priority ?? 5))
    setEstimatedComplexity(initialValues.estimated_complexity != null ? String(initialValues.estimated_complexity) : '')
    setTagsInput((initialValues.tags ?? []).join(', '))
    setErrors({})
  }, [initialValues.title, initialValues.description, initialValues.priority, initialValues.estimated_complexity, initialValues.tags])

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
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          disabled={loading}
          autoFocus
        />
        <Textarea
          label="Description"
          placeholder="Describe the task..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
          <Input
            label="Est. Complexity"
            type="number"
            min={1}
            max={10}
            placeholder="1-10"
            value={estimatedComplexity}
            onChange={(e) => setEstimatedComplexity(e.target.value)}
            disabled={loading}
          />
        </div>
        <Input
          label="Tags"
          placeholder="tag1, tag2, tag3"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          disabled={loading}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      const parsedTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        priority: parseInt(priority) || 5,
        estimated_complexity: estimatedComplexity ? parseInt(estimatedComplexity) || undefined : undefined,
        tags: parsedTags.length > 0 ? parsedTags : undefined,
      })
    },
  }
}
