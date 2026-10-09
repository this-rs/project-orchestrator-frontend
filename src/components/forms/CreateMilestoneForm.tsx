import { useState } from 'react'
import { Input, Textarea } from '@/components/ui'
import { useT } from '@/i18n'

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
  const { t } = useT()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [tags, setTags] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = t('forms.error.title')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label={t('forms.field.title')}
          placeholder={t('forms.placeholder.milestoneTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          autoFocus
        />
        <Textarea
          label={t('forms.field.description')}
          placeholder={t('forms.placeholder.optionalDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <Input
          label={t('forms.field.targetDate')}
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
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
        title: title.trim(),
        description: description.trim() || undefined,
        target_date: targetDate || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      })
      // Fresh form for the next milestone
      setTitle('')
      setDescription('')
      setTargetDate('')
      setTags('')
    },
  }
}
