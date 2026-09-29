import { useState, useEffect } from 'react'
import { Input, Textarea } from '@/components/ui'

export interface EditMilestoneFormData {
  title: string
  description: string
  target_date?: string
}

interface Props {
  initialValues: { title: string; description?: string; target_date?: string }
  onSubmit: (data: EditMilestoneFormData) => Promise<void>
}

/** `2026-09-25T00:00:00Z` → `2026-09-25` for <input type="date">. */
function toDateInput(value?: string): string {
  if (!value) return ''
  return value.slice(0, 10)
}

export function EditMilestoneForm({ initialValues, onSubmit }: Props) {
  const [title, setTitle] = useState(initialValues.title)
  const [description, setDescription] = useState(initialValues.description ?? '')
  const [targetDate, setTargetDate] = useState(toDateInput(initialValues.target_date))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setTitle(initialValues.title)
    setDescription(initialValues.description ?? '')
    setTargetDate(toDateInput(initialValues.target_date))
    setErrors({})
  }, [initialValues.title, initialValues.description, initialValues.target_date])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Title is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} autoFocus />
        <Textarea
          label="Description"
          placeholder="Optional description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
        <Input label="Target Date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        target_date: targetDate || undefined,
      })
    },
  }
}
