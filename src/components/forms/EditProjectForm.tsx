import { useState, useEffect } from 'react'
import { Input, Textarea } from '@/components/ui'
import { PROJECT_PROFILE_TEXT, profileOf } from '@/constants/projectProfile'
import { useT } from '@/i18n'
import type { ProjectProfile } from '@/types'
import { ProjectProfileField } from './ProjectProfileField'

export interface EditProjectFormData {
  name: string
  slug: string
  description: string
  profile: ProjectProfile
  /** The folder of a `software` project; `''` clears it when the project becomes `work`. */
  root_path: string
}

interface Props {
  initialValues: { name: string; slug?: string; description?: string; root_path?: string; profile?: ProjectProfile }
  onSubmit: (data: EditProjectFormData) => Promise<void>
  loading?: boolean
}

export function EditProjectForm({ initialValues, onSubmit, loading }: Props) {
  const { t } = useT()
  const initialProfile = profileOf(initialValues)
  const [profile, setProfile] = useState<ProjectProfile>(initialProfile)
  const [name, setName] = useState(initialValues.name)
  const [slug, setSlug] = useState(initialValues.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState(initialValues.description ?? '')
  const [rootPath, setRootPath] = useState(initialValues.root_path ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setProfile(initialProfile)
    setName(initialValues.name)
    setSlug(initialValues.slug ?? '')
    setSlugTouched(false)
    setDescription(initialValues.description ?? '')
    setRootPath(initialValues.root_path ?? '')
    setErrors({})
  }, [initialProfile, initialValues.name, initialValues.slug, initialValues.description, initialValues.root_path])

  const withCode = profile === 'software'

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
    if (withCode && !rootPath.trim()) errs.root_path = PROJECT_PROFILE_TEXT.folder.required
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <ProjectProfileField value={profile} onChange={setProfile} disabled={loading} />
        <Input
          label={t('forms.field.name')}
          placeholder={t('forms.placeholder.projectName')}
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          error={errors.name}
          disabled={loading}
          autoFocus
        />
        <Input
          label={t('forms.field.slug')}
          placeholder={t('forms.placeholder.projectSlug')}
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
        {withCode && (
          <Input
            label={PROJECT_PROFILE_TEXT.folder.label}
            placeholder={PROJECT_PROFILE_TEXT.folder.placeholder}
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            error={errors.root_path}
            disabled={loading}
            className="font-mono"
          />
        )}
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
        profile,
        root_path: withCode ? rootPath.trim() : '',
      })
    },
  }
}
