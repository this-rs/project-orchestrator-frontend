import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Input, Textarea } from '@/components/ui'
import { isTauri } from '@/services/env'

export interface CreateProjectFormData {
  name: string
  slug: string
  root_path: string
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
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [rootPath, setRootPath] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

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

  const handleBrowse = async () => {
    try {
      const dir = await pickDirectory()
      if (dir) {
        setRootPath(dir)
        setErrors((prev) => {
          const next = { ...prev }
          delete next.root_path
          return next
        })
      }
    } catch (e) {
      console.error('Directory picker failed:', e)
      setErrors((prev) => ({
        ...prev,
        root_path: 'Failed to open folder picker. Rebuild the desktop app.',
      }))
    }
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Name is required'
    if (!rootPath.trim()) errs.root_path = 'Root path is required'
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
              Will be added to <span className="font-medium text-gray-200">{workspaceName}</span>
            </span>
          </p>
        )}
        <Input
          label="Name"
          placeholder="My Project"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          error={errors.name}
          autoFocus
        />
        <Input
          label="Slug"
          placeholder="my-project"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(e.target.value)
          }}
        />
        <div className="w-full">
          <label htmlFor="create-project-root-path" className="block text-sm font-medium text-gray-300 mb-1">
            Root Path
          </label>
          <div className="flex gap-2">
            <input
              id="create-project-root-path"
              className={`
                flex-1 min-w-0 px-3 py-2 bg-surface-base border border-border-default rounded-lg
                text-gray-100 placeholder-gray-500
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                disabled:opacity-50 disabled:cursor-not-allowed
                ${errors.root_path ? 'border-red-500' : ''}
              `}
              placeholder="/path/to/project"
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
            />
            {isTauri && (
              <button
                type="button"
                onClick={handleBrowse}
                className="
                  shrink-0 px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-lg
                  text-gray-300 hover:bg-white/[0.1] hover:text-gray-100
                  transition-colors cursor-pointer
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
                title="Browse for folder"
                aria-label="Browse for folder"
              >
                <FolderOpen className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
          </div>
          {errors.root_path && (
            <p className="mt-1 text-sm text-red-400">{errors.root_path}</p>
          )}
        </div>
        <Textarea
          label="Description"
          placeholder="Optional description..."
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
        root_path: rootPath.trim(),
        description: description.trim(),
      })
    },
  }
}
