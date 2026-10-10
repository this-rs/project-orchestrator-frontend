import { useState } from 'react'
import { Input, Textarea, Select } from '@/components/ui'
import type { ComponentType } from '@/types'
import { useT } from '@/i18n'

export interface CreateComponentFormData {
  name: string
  component_type: ComponentType
  description?: string
  runtime?: string
  tags: string[]
}

interface Props {
  onSubmit: (data: CreateComponentFormData) => Promise<void>
}

export function CreateComponentForm({ onSubmit }: Props) {
  const { t } = useT()
  const typeOptions = [
    { value: 'service', label: t('forms.componentType.service') },
    { value: 'frontend', label: t('forms.componentType.frontend') },
    { value: 'worker', label: t('forms.componentType.worker') },
    { value: 'database', label: t('forms.componentType.database') },
    { value: 'message_queue', label: t('forms.componentType.message_queue') },
    { value: 'cache', label: t('forms.componentType.cache') },
    { value: 'gateway', label: t('forms.componentType.gateway') },
    { value: 'external', label: t('forms.componentType.external') },
    { value: 'other', label: t('forms.other') },
  ]
  const [name, setName] = useState('')
  const [componentType, setComponentType] = useState<string>('service')
  const [description, setDescription] = useState('')
  const [runtime, setRuntime] = useState('')
  const [tags, setTags] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = t('forms.error.name')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label={t('forms.field.name')}
          placeholder={t('forms.placeholder.componentName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}

          autoFocus
        />
        <Select
          label={t('forms.field.type')}
          options={typeOptions}
          value={componentType}
          onChange={(value) => setComponentType(value)}

        />
        <Textarea
          label={t('forms.field.description')}
          placeholder={t('forms.placeholder.optionalDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}

          rows={2}
        />
        <Input
          label={t('forms.field.runtime')}
          placeholder={t('forms.placeholder.runtime')}
          value={runtime}
          onChange={(e) => setRuntime(e.target.value)}

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
        name: name.trim(),
        component_type: componentType as ComponentType,
        description: description.trim() || undefined,
        runtime: runtime.trim() || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      })
    },
  }
}
