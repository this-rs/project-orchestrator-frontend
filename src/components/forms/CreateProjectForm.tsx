import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button, Input, Textarea } from '@/components/ui'
import { isTauri } from '@/services/env'
import { PROJECT_PROFILE_TEXT } from '@/constants/projectProfile'
import { useT } from '@/i18n'
import type { ProjectProfile } from '@/types'
import { ProjectProfileField } from './ProjectProfileField'

export interface CreateProjectFormData {
  name: string
  slug: string
  /** `software` (a folder to index) or `work` (plans, notes, documents — no folder). */
  profile: ProjectProfile
  /** Set for a `software` project, absent for a `work` one. */
  root_path?: string
  description: string
}

interface Props {
  onSubmit: (data: CreateProjectFormData) => Promise<void>
  workspaceName?: string
}

async function pickDirectory(): Promise<string | null> {
  if (!isTauri) return null
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string | null>('pick_directory')
}

export function CreateProjectForm({ onSubmit, workspaceName }: Props) {
  const { t } = useT()
  const [profile, setProfile] = useState<ProjectProfile>('software')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [rootPath, setRootPath] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const withCode = profile === 'software'

  const handleNameChange = (value: string) => {
    setName(value)
    if (!slugTouched) {
      setSlug(
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
      )
    }
  }

  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

  const handleProfileChange = (next: ProjectProfile) => {
    setProfile(next)
    if (next === 'work') clearError('root_path')
  }

  const handleBrowse = async () => {
    try {
      const dir = await pickDirectory()
      if (dir) {
        setRootPath(dir)
        clearError('root_path')
      }
    } catch (e) {
      console.error('Directory picker failed:', e)
      setErrors((prev) => ({
        ...prev,
        root_path: t('forms.error.folderPicker'),
      }))
    }
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = t('forms.error.name')
    if (withCode && !rootPath.trim()) errs.root_path = PROJECT_PROFILE_TEXT.folder.required
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        {workspaceName && (
          <p className="flex items-center gap-2 text-xs text-gray-400">
            <FolderOpen className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">
              {t('forms.project.addedTo')} <span className="font-medium text-gray-200">{workspaceName}</span>
            </span>
          </p>
        )}
        <ProjectProfileField value={profile} onChange={handleProfileChange} />
        <Input
          label={t('forms.field.name')}
          placeholder={t('forms.placeholder.projectNameNew')}
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          error={errors.name}
          autoFocus
        />
        <Input
          label={t('forms.field.slug')}
          placeholder={t('forms.placeholder.projectSlugNew')}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(e.target.value)
          }}
        />
        {withCode && (
          <div className="flex items-start gap-2">
            <Input
              label={PROJECT_PROFILE_TEXT.folder.label}
              placeholder={PROJECT_PROFILE_TEXT.folder.placeholder}
              value={rootPath}
              onChange={(e) => {
                setRootPath(e.target.value)
                clearError('root_path')
              }}
              error={errors.root_path}
              className="font-mono"
            />
            {isTauri && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleBrowse}
                aria-label={PROJECT_PROFILE_TEXT.folder.browse}
                title={PROJECT_PROFILE_TEXT.folder.browse}
                className="shrink-0 mt-6 h-10 w-10 px-0"
              >
                <FolderOpen className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
        <Textarea
          label={t('forms.field.description')}
          placeholder={t('forms.placeholder.optionalDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await onSubmit({
        name: name.trim(),
        slug: slug.trim() || (undefined as unknown as string),
        profile,
        root_path: withCode ? rootPath.trim() : undefined,
        description: description.trim(),
      })
    },
  }
}
