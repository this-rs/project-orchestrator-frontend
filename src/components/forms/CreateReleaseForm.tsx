import { useState } from 'react'
import { Input, Textarea } from '@/components/ui'
import { useT } from '@/i18n'

export interface CreateReleaseFormData {
  version: string
  title?: string
  description?: string
  target_date?: string
}

interface Props {
  onSubmit: (data: CreateReleaseFormData) => Promise<void>
}

export function CreateReleaseForm({ onSubmit }: Props) {
  const { t } = useT()
  const [version, setVersion] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!version.trim()) errs.version = t('forms.error.version')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label={t('forms.field.version')}
          placeholder="1.0.0"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          error={errors.version}

          autoFocus
        />
        <Input
          label={t('forms.field.title')}
          placeholder={t('forms.placeholder.releaseTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}

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
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        version: version.trim(),
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        target_date: targetDate || undefined,
      })
    },
  }
}
