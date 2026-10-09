import { useState } from 'react'
import { Input, Select } from '@/components/ui'
import type { ConstraintType } from '@/types'
import { useT } from '@/i18n'

export interface CreateConstraintFormData {
  constraint_type: ConstraintType
  description: string
  severity?: string
}

interface Props {
  onSubmit: (data: CreateConstraintFormData) => Promise<void>
}

export function CreateConstraintForm({ onSubmit }: Props) {
  const { t } = useT()
  const typeOptions = [
    { value: 'performance', label: t('forms.constraintType.performance') },
    { value: 'security', label: t('forms.constraintType.security') },
    { value: 'style', label: t('forms.constraintType.style') },
    { value: 'compatibility', label: t('forms.constraintType.compatibility') },
    { value: 'testing', label: t('forms.constraintType.testing') },
    { value: 'other', label: t('forms.other') },
  ]
  const severityOptions = [
    { value: '', label: t('forms.noSeverity') },
    { value: 'low', label: t('ui.status.low') },
    { value: 'medium', label: t('ui.status.medium') },
    { value: 'high', label: t('ui.status.high') },
    { value: 'critical', label: t('ui.status.critical') },
  ]
  const [constraintType, setConstraintType] = useState<string>('other')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('')
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Select
            label={t('forms.field.type')}
            options={typeOptions}
            value={constraintType}
            onChange={(value) => setConstraintType(value)}
          />
          <Select
            label={t('forms.field.severity')}
            options={severityOptions}
            value={severity}
            onChange={(value) => setSeverity(value)}
          />
        </div>
        <Input
          label={t('forms.field.description')}
          placeholder={t('forms.placeholder.constraint')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          autoFocus
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        constraint_type: constraintType as ConstraintType,
        description: description.trim(),
        severity: severity || undefined,
      })
    },
  }
}
