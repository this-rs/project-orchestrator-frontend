import { useState } from 'react'
import { Input, Textarea } from '@/components/ui'
import { useT } from '@/i18n'

export interface CreateTaskFormData {
  title: string
  description: string
  priority?: number
  tags: string[]
  estimated_complexity?: number
}

interface Props {
  onSubmit: (data: CreateTaskFormData) => Promise<void>
}

export function CreateTaskForm({ onSubmit }: Props) {
  const { t } = useT()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('')
  const [tags, setTags] = useState('')
  const [complexity, setComplexity] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!description.trim()) errs.description = t('forms.error.description')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label={t('forms.field.title')}
          placeholder={t('forms.placeholder.taskTitleOptional')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <Textarea
          label={t('forms.field.description')}
          placeholder={t('forms.placeholder.taskDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          rows={4}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Input
            label={t('forms.field.priority')}
            type="number"
            min={1}
            max={10}
            placeholder="1-10"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
          <Input
            label={t('forms.field.estimatedComplexity')}
            type="number"
            min={1}
            max={10}
            placeholder="1-10"
            value={complexity}
            onChange={(e) => setComplexity(e.target.value)}
          />
        </div>
        <Input
          label={t('forms.field.tags')}
          placeholder={t('forms.placeholder.tags')}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
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
      // Fresh form for the next "Add task"
      setTitle('')
      setDescription('')
      setPriority('')
      setTags('')
      setComplexity('')
    },
  }
}
