import { useState, useEffect } from 'react'
import { Input, Textarea } from '@/components/ui'
import { useT } from '@/i18n'

export interface EditWorkspaceFormData {
  name: string
  description: string
  slug: string
}

interface Props {
  initialValues: { name: string; description?: string; slug: string }
  onSubmit: (data: EditWorkspaceFormData) => Promise<void>
  loading?: boolean
}

export function EditWorkspaceForm({ initialValues, onSubmit, loading }: Props) {
  const { t } = useT()
  const [name, setName] = useState(initialValues.name)
  const [slug, setSlug] = useState(initialValues.slug)
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState(initialValues.description ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setName(initialValues.name)
    setSlug(initialValues.slug)
    setSlugTouched(false)
    setDescription(initialValues.description ?? '')
    setErrors({})
  }, [initialValues.name, initialValues.slug, initialValues.description])

  const handleNameChange = (value: string) => {
    setName(value)
    if (!slugTouched) {
      setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    }
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = t('forms.error.name')
    if (!slug.trim()) errs.slug = t('forms.error.slug')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label={t('forms.field.name')}
          placeholder={t('forms.placeholder.workspaceName')}
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          error={errors.name}
          disabled={loading}
          autoFocus
        />
        <Input
          label={t('forms.field.slug')}
          placeholder={t('forms.placeholder.workspaceSlug')}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(e.target.value)
          }}
          error={errors.slug}
          disabled={loading}
        />
        <Textarea
          label={t('forms.field.description')}
          placeholder={t('forms.placeholder.optionalDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          rows={3}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return
      await onSubmit({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
      })
    },
  }
}
